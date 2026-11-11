// server/providers/admin-router.js
import express from "express";
import { isIP } from "node:net";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readProvidersFile,
  writeProvidersFile,
  resolveApiKey,
  sanitizeProviderForAdmin,
} from "./loader.js";


function isSafeProviderBaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
    if (hostname === "metadata.google.internal" || hostname === "metadata" ) return false;
    if (isIP(hostname) === 4) {
      const [a,b] = hostname.split(".").map(Number);
      if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) ||
          (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
    }
    if (isIP(hostname) === 6 && (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:"))) return false;
    return true;
  } catch { return false; }
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENV_FILE = path.join(PROJECT_ROOT, ".env");

async function storeProviderApiKey(provider, apiKey) {
  if (!apiKey) return;
  const envNames = Array.isArray(provider.apiKeyEnvVars) ? provider.apiKeyEnvVars : [];
  let envName = envNames.find((name) => /^[A-Z][A-Z0-9_]{1,55}_(?:API_KEY|TOKEN)$/.test(name));
  if (!envName) {
    envName = `${String(provider.id).replace(/[^a-z0-9]/gi, "_").toUpperCase()}_API_KEY`;
    provider.apiKeyEnvVars = [envName];
  }
  let content = "";
  try { content = await readFile(ENV_FILE, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const escaped = String(apiKey).replace(/\r?\n/g, "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const line = `${envName}="${escaped}"`;
  const pattern = new RegExp(`^${envName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`, "m");
  content = pattern.test(content) ? content.replace(pattern, () => line) : `${content.replace(/\s*$/, "")}\n${line}\n`;
  await writeFile(ENV_FILE, content, { encoding: "utf8", mode: 0o600 });
  process.env[envName] = String(apiKey);
  delete provider.apiKey;
}

function validateProviderInput(body, { requireId = true } = {}) {
  const errors = [];
  const out = {};

  if (requireId) {
    const id = String(body.id || "").trim().toLowerCase();
    if (!id) errors.push("id الزامی است.");
    else if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(id)) {
      errors.push("id باید با حرف کوچک یا عدد شروع شود و فقط شامل a-z، 0-9، - و _ باشد (حداکثر ۴۱ کاراکتر).");
    } else out.id = id;
  }

  const name = String(body.name ?? "").trim();
  if (!name) errors.push("name الزامی است.");
  else if (name.length > 80) errors.push("name طولانی‌تر از ۸۰ کاراکتر است.");
  else out.name = name;

  const type = String(body.type || "openai-compatible").trim().toLowerCase();
  if (type !== "openai-compatible") {
    errors.push("نوع فعلاً فقط 'openai-compatible' پشتیبانی می‌شود.");
  } else out.type = type;

  const baseUrl = String(body.baseUrl || "").trim();
  if (!baseUrl) errors.push("baseUrl الزامی است.");
  else if (!isSafeProviderBaseUrl(baseUrl)) errors.push("آدرس Provider باید HTTPS معتبر باشد و نباید به localhost یا شبکه خصوصی اشاره کند.");
  else out.baseUrl = baseUrl.replace(/\/+$/, "");

  if (body.apiKey !== undefined) {
    const apiKey = String(body.apiKey || "").trim();
    if (apiKey.length > 10000) errors.push("apiKey طولانی‌تر از حد مجاز است.");
    else out.apiKey = apiKey;
  }

  if (body.apiKeyEnvVars !== undefined) {
    if (!Array.isArray(body.apiKeyEnvVars)) {
      errors.push("apiKeyEnvVars باید آرایه باشد.");
    } else {
      out.apiKeyEnvVars = body.apiKeyEnvVars
        .filter((v) => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => /^[A-Z][A-Z0-9_]{1,55}_(?:API_KEY|TOKEN)$/.test(v));
    }
  }

  if (body.enabled !== undefined) out.enabled = Boolean(body.enabled);

  if (body.order !== undefined) {
    const order = Number.parseInt(body.order, 10);
    out.order = Number.isFinite(order) ? order : 0;
  }

  return { errors, data: out };
}

async function testProviderConnection(instance, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(instance.modelsUrl(), {
      headers: instance.headers(instance.getApiKey()),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    const latency = Date.now() - startedAt;
    if (!response.ok) {
      return { ok: false, latency, error: `HTTP ${response.status}`, body: data };
    }
    const models = Array.isArray(data?.data) ? data.data : [];
    return { ok: true, latency, modelsCount: models.length };
  } catch (error) {
    return {
      ok: false,
      latency: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createAdminRouter({ env, getProviders, reloadProviders }) {
  const router = express.Router();

  // GET /api/admin/providers
  router.get("/", async (_req, res) => {
    try {
      const data = await readProvidersFile();
      const providers = data.providers.map((p) => sanitizeProviderForAdmin(p, env));
      res.json({
        success: true,
        providers,
        meta: {
          file: "server/data/providers.json",
          count: providers.length,
          defaultProvider: env.DEFAULT_AI_PROVIDER || "",
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "خواندن providers.json ناموفق بود.",
      });
    }
  });

  // GET /api/admin/providers/:id
  router.get("/:id", async (req, res) => {
    try {
      const data = await readProvidersFile();
      const entry = data.providers.find((p) => p.id === req.params.id);
      if (!entry) {
        return res.status(404).json({ success: false, error: "Provider یافت نشد." });
      }
      res.json({ success: true, provider: sanitizeProviderForAdmin(entry, env) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/providers
  router.post("/", async (req, res) => {
    const { errors, data: cleaned } = validateProviderInput(req.body || {});
    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }
    try {
      const file = await readProvidersFile();
      if (file.providers.some((p) => p.id === cleaned.id)) {
        return res.status(409).json({
          success: false,
          error: `Provider با شناسه «${cleaned.id}» از قبل وجود دارد.`,
        });
      }
      if (cleaned.order === undefined) {
        const maxOrder = file.providers.reduce((m, p) => Math.max(m, p.order ?? 0), -1);
        cleaned.order = maxOrder + 1;
      }
      if (cleaned.enabled === undefined) cleaned.enabled = true;
      if (cleaned.apiKey) await storeProviderApiKey(cleaned, cleaned.apiKey);
      delete cleaned.apiKey;

      file.providers.push(cleaned);
      await writeProvidersFile(file);
      await reloadProviders();
      res.status(201).json({
        success: true,
        provider: sanitizeProviderForAdmin(cleaned, env),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/admin/providers/:id
  router.put("/:id", async (req, res) => {
    const { errors, data: cleaned } = validateProviderInput(
      { ...(req.body || {}), id: req.params.id },
      { requireId: false }
    );
    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }
    try {
      const file = await readProvidersFile();
      const index = file.providers.findIndex((p) => p.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ success: false, error: "Provider یافت نشد." });
      }
      const merged = { ...file.providers[index], ...cleaned };
      if (cleaned.apiKey) await storeProviderApiKey(merged, cleaned.apiKey);
      delete merged.apiKey;
      delete cleaned.apiKey;
      file.providers[index] = merged;
      await writeProvidersFile(file);
      await reloadProviders();
      res.json({ success: true, provider: sanitizeProviderForAdmin(merged, env) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/admin/providers/:id
  router.delete("/:id", async (req, res) => {
    try {
      const file = await readProvidersFile();
      const before = file.providers.length;
      file.providers = file.providers.filter((p) => p.id !== req.params.id);
      if (file.providers.length === before) {
        return res.status(404).json({ success: false, error: "Provider یافت نشد." });
      }
      await writeProvidersFile(file);
      await reloadProviders();
      res.json({ success: true, deletedId: req.params.id });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/providers/:id/test
  router.post("/:id/test", async (req, res) => {
    const providers = getProviders();
    const instance = providers[req.params.id];
    if (!instance) {
      return res.status(404).json({
        success: false,
        error: "Provider فعال با این شناسه پیدا نشد (ممکن است کلید تنظیم نشده یا غیرفعال باشد).",
      });
    }
    if (!instance.getApiKey()) {
      return res.status(400).json({
        success: false,
        error: "کلید API برای این Provider تنظیم نشده است.",
      });
    }
    const result = await testProviderConnection(instance);
    res.status(result.ok ? 200 : 502).json({
      success: result.ok,
      providerId: req.params.id,
      latency: result.latency,
      modelsCount: result.modelsCount,
      ...(result.ok ? {} : { error: result.error }),
    });
  });

  return router;
}