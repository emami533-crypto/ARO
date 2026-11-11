// server/index.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import { buildProviders, getModelCapabilities } from "./providers/index.js";
import { createAdminRouter } from "./providers/admin-router.js";
import { createUsageAdminRouter } from "./usage/admin-router.js";
import { appendUsageRecord, createUsageRecord } from "./usage/store.js";
import { resolveStrategy, planAttempts } from "./router/index.js";
import { createRouterAdminRouter } from "./router/admin-router.js";
import { readRouterConfig } from "./router/config.js";
import { requireAdminToken } from "./middleware/admin-auth.js";
import { refreshBenchmarks } from "./router/benchmarks.js";
import { createSandboxRouter } from "./sandbox/admin-router.js";
import { cleanupOrphanedSandboxResources } from "./sandbox/manager.js";

dotenv.config();

const app = express();
// ← دیباگ: لاگ همه درخواست‌ها
app.use((req, res, next) => {
  console.log(`[GLOBAL] ${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

const PORT = Number.parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "127.0.0.1";
const REQUEST_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "120000", 10));
const MAX_OUTPUT_TOKENS = Math.max(1, Number.parseInt(process.env.AI_MAX_OUTPUT_TOKENS || "800", 10));
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "50mb";
const MAX_ATTEMPT_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 3000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableNetworkError(message) {
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|socket hang up/i.test(String(message || ""));
}

const ALLOWED_ORIGINS = (
  process.env.AI_ALLOWED_ORIGINS ||
  "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// ---- Providers: dynamic, reloadable ----
let PROVIDERS = {};

async function reloadProviders() {
  PROVIDERS = await buildProviders(process.env);
  return PROVIDERS;
}

await reloadProviders();
// دریافت امتیازات بین‌المللی مدل‌ها در پس‌زمینه (از منابع مختلف)
void refreshBenchmarks(
  process.env.HORMOUS_API_KEY 
  || PROVIDERS?.hormouz?.getApiKey?.() 
  || null
);
void cleanupOrphanedSandboxResources();

const healthCache = {
  timestamp: 0,
  models: {},
};

const CACHE_TTL = 60 * 60 * 1000;
const rateBuckets = new Map();

function getClientAddress(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimit({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${getClientAddress(req)}`;
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      return res.status(429).json({
        success: false,
        error: "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
      });
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateBuckets) {
    if (value.resetAt <= now) rateBuckets.delete(key);
  }
}, 60000).unref();

app.disable("x-powered-by");

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
  })
);

app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.use("/api", rateLimit({ windowMs: 60000, max: 90, keyPrefix: "api" }));
app.use("/api/sandbox", rateLimit({ windowMs: 60000, max: 120, keyPrefix: "sandbox" }), createSandboxRouter());

function isVisionModelId(modelId, providerId = "") {
  return getModelCapabilities(providerId, modelId).imageInput;
}

function heuristicContextLength(modelId) {
  const id = String(modelId || "").toLowerCase();

  if (/grok-4\.20|grok-4\.3/.test(id)) return 2000000;
  if (/grok-4-1|grok-4\.1/.test(id)) return 256000;
  if (/grok-4-fast/.test(id)) return 2000000;
  if (/grok-4|grok-code/.test(id)) return 256000;
  if (/grok-3/.test(id)) return 131072;
  if (/grok/.test(id)) return 131072;

  if (/kimi-k3|kimi-k2|kimi-latest/.test(id)) return 256000;
  if (/kimi/.test(id)) return 128000;

  if (/minimax-m3|minimax-m2\.5/.test(id)) return 1000000;
  if (/minimax/.test(id)) return 204800;

  if (/qwen3\.8|qwen3\.7|qwen3\.6|qwen3\.5|qwen3-coder/.test(id)) return 991000;
  if (/qwen3-max|qwen3-vl/.test(id)) return 252000;
  if (/qwen-plus|qwen-flash/.test(id)) return 129000;
  if (/qwen-max/.test(id)) return 30720;
  if (/qwen2\.5|qwen3/.test(id)) return 32768;
  if (/qwen/.test(id)) return 32768;

  if (/gpt-4\.1|gpt-5|gpt-6|o1|o3|o4/.test(id)) return 200000;
  if (/gpt-4o|gpt-4-turbo/.test(id)) return 128000;
  if (/gpt-4/.test(id)) return 8192;
  if (/gpt-3\.5/.test(id)) return 16384;

  if (/claude/.test(id)) return 200000;
  if (/gemini/.test(id)) return 1000000;
  if (/llama-3\.2|llama-4/.test(id)) return 128000;
  if (/llama/.test(id)) return 8192;
  if (/mistral-large/.test(id)) return 128000;
  if (/mistral/.test(id)) return 32768;
  if (/deepseek/.test(id)) return 64000;
  if (/command-r/.test(id)) return 128000;
  if (/nemotron/.test(id)) return 254000;
  if (/hy3|hy4/.test(id)) return 65536;

  return 8192;
}

function getProvider(providerId) {
  const config = PROVIDERS[String(providerId || "").toLowerCase()];
  if (!config) return { error: "سرویس‌دهنده نامعتبر است." };
  const apiKey = config.getApiKey();
  if (!apiKey) return { error: `کلید API برای ${config.name} در فایل .env یا providers.json تنظیم نشده است.` };
  return { config, apiKey };
}

function isValidMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 100) return false;
  return messages.every((message) => {
    if (!message || !["system", "user", "assistant"].includes(message.role)) return false;
    if (typeof message.content === "string") return message.content.length <= 2000000;
    if (!Array.isArray(message.content)) return false;
    if (message.content.length > 100) return false;
    return message.content.every((part) => {
      if (!part || typeof part !== "object") return false;
      if (part.type === "text") {
        return typeof part.text === "string" && part.text.length <= 2000000;
      }
      if (part.type === "image_url") {
        return typeof part.image_url?.url === "string" && part.image_url.url.length <= 30000000;
      }
      return false;
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const upstreamSignal = options.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) controller.abort(upstreamSignal.reason);
  else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Provider request timed out")), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

// --------------------------------------------------
// ADMIN ROUTER
// --------------------------------------------------

app.use("/api/admin", requireAdminToken, (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(
  "/api/admin/providers",
  createAdminRouter({
    env: process.env,
    getProviders: () => PROVIDERS,
    reloadProviders,
  })
);
app.get("/api/admin/debug-health", (_req, res) => {
  const models = healthCache.models || {};
  const entries = Object.entries(models);
  const INTERNAL_ROUTER_RE = /^openrouter\/(free|auto|auto-beta|auto-code|fusion|pareto-code|bodybuilder)$/i;
const healthy = entries.filter(([key, m]) => {
  if (m?.ok === false) return false;
  const id = key.split(":").slice(1).join(":");
  if (INTERNAL_ROUTER_RE.test(id)) return false;   // ← حذف internal routers از debug
  return true;
});
const withImageInput = healthy.filter(([, m]) => m?.capabilities?.imageInput === true);
  const byProvider = {};
  for (const [key, m] of healthy) {
    const p = m?.provider || key.split(":")[0] || "unknown";
    byProvider[p] = (byProvider[p] || 0) + 1;
  }

  res.json({
    total: entries.length,
    healthy: healthy.length,
    withImageInput: withImageInput.length,  
    byProvider,
    healthySamples: healthy.slice(0, 30).map(([key, m]) => ({
  key,
  provider: m?.provider,
  ok: m?.ok,
  imageInput: m?.capabilities?.imageInput,
  caps: m?.capabilities,
  contextLength: m?.contextLength,       
  reasoningRatio: m?.reasoningRatio,
})),
  });
});

app.use("/api/admin/usage", createUsageAdminRouter());
app.use("/api/admin/router", createRouterAdminRouter());

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "ARO Backend is running",
    provider: process.env.DEFAULT_AI_PROVIDER || "1xai",
    configuredProviders: Object.keys(PROVIDERS).filter((id) => Boolean(PROVIDERS[id].getApiKey())),
    timestamp: new Date().toISOString(),
  });
});

// --------------------------------------------------
// PROVIDERS (public — only those with keys)
// --------------------------------------------------

app.get("/api/providers", (_req, res) => {
  const providers = Object.entries(PROVIDERS)
    .filter(([, config]) => Boolean(config.getApiKey()))
    .map(([id, config]) => ({ id, name: config.name }));

  const configuredDefault = String(process.env.DEFAULT_AI_PROVIDER || "").toLowerCase();
  const defaultProvider = providers.some((item) => item.id === configuredDefault)
    ? configuredDefault
    : providers[0]?.id || "";

  res.json({ success: true, providers, defaultProvider });
});

// --------------------------------------------------
// MODELS
// --------------------------------------------------

app.get("/api/models", async (req, res) => {
  const providerId = String(req.query.provider || "").toLowerCase();
  const selected = getProvider(providerId);
  if (selected.error) {
    return res.status(400).json({ success: false, error: selected.error });
  }
  try {
    const response = await fetchWithTimeout(selected.config.modelsUrl(), {
      headers: selected.config.headers(selected.apiKey),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        data.error?.message || data.message || `خطای Provider (HTTP ${response.status})`
      );
    }
    const models = (Array.isArray(data.data) ? data.data : [])
      .filter((item) => item?.id)
      .map((item) => {
        const id = String(item.id);
        const capabilities = getModelCapabilities(providerId, id);
        const rawContext =
          Number(item.context_length) ||
          Number(item.context_window) ||
          Number(item.max_context_length) ||
          Number(item.max_input_tokens) ||
          0;
        const contextLength = rawContext > 0 ? rawContext : heuristicContextLength(id);
        return {
          id,
          name: String(item.name || id),
          isVision: capabilities.imageInput,
          contextLength,
          capabilities,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, models });
  } catch (error) {
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : "دریافت مدل‌ها ناموفق بود.",
    });
  }
});

// --------------------------------------------------
// SUMMARIZE (non-streaming)
// --------------------------------------------------

app.post(
  "/api/summarize",
  rateLimit({ windowMs: 5 * 60 * 1000, max: 15, keyPrefix: "summarize" }),
  async (req, res) => {
    const { provider, model, messages, autoMode } = req.body || {};

    if (
      typeof provider !== "string" ||
      typeof model !== "string" ||
      !provider.trim() ||
      !model.trim()
    ) {
      return res.status(400).json({ success: false, error: "provider و model الزامی هستند." });
    }

    if (!isValidMessages(messages) || messages.length < 2) {
      return res.status(400).json({ success: false, error: "پیام‌ها برای خلاصه‌سازی معتبر نیستند." });
    }

    const requested = getProvider(provider);
    if (requested.error) {
      return res.status(400).json({ success: false, error: requested.error });
    }

    const summarySystem = `You are a context summarizer. Produce a compact, dense summary of the conversation below.

RULES:
- Preserve: user goals, technical decisions, file names, code patterns, constraints, and open issues.
- Drop: greetings, filler, apologies, redundant explanations, and the assistant's preamble.
- Format: 5-10 bullet points, each under 20 words.
- Language: match the dominant language of the conversation (Persian or English).
- Do NOT invent facts. Do NOT add recommendations.
- Output ONLY the summary, no headers, no preface.`;

    const summaryMessages = [
      { role: "system", content: summarySystem },
      {
        role: "user",
        content:
          "Summarize this conversation:\n\n" +
          messages
            .map(
              (m) =>
                `${m.role === "user" ? "USER" : "ASSISTANT"}: ${typeof m.content === "string" ? m.content : "[multimodal]"}`
            )
            .join("\n\n"),
      },
    ];

    try {
      const response = await fetchWithTimeout(
        requested.config.chatUrl(),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...requested.config.headers(requested.apiKey),
          },
          body: JSON.stringify({
            model,
            messages: summaryMessages,
            stream: false,
            max_tokens: 800,
            temperature: 0.3,
          }),
        },
        60000
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(
          `Provider ${provider} returned HTTP ${response.status}` +
            (errorBody ? `: ${errorBody.slice(0, 300)}` : "")
        );
      }

      const data = await response.json();
      const summaryText =
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text ||
        "";

      if (!summaryText || typeof summaryText !== "string") {
        throw new Error("پاسخ خلاصه‌سازی خالی بود.");
      }

      res.json({
        success: true,
        summary: summaryText.trim(),
        usage: data?.usage || null,
      });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "خلاصه‌سازی ناموفق بود.",
      });
    }
  }
);

// --------------------------------------------------
// TEST ALL MODELS
// --------------------------------------------------

app.post(
  "/api/test-all-models",
  requireAdminToken,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 3, keyPrefix: "model-tests" }),
  async (_req, res) => {
    if (Date.now() - healthCache.timestamp < CACHE_TTL && Object.keys(healthCache.models).length) {
      return res.json({ success: true, fromCache: true, results: healthCache.models });
    }

    const tasks = [];

    for (const [provider, config] of Object.entries(PROVIDERS)) {
      const apiKey = config.getApiKey();
      if (!apiKey) continue;
      try {
        const response = await fetchWithTimeout(config.modelsUrl(), { headers: config.headers(apiKey) }, 15000);
        const data = await response.json().catch(() => ({}));
               if (response.ok && Array.isArray(data.data)) {
          for (const model of data.data) {
            if (!model?.id) continue;
            const modelId = String(model.id);
            // ← جدید: فقط مدل‌های رایگان یا کاربر را تست کن (سریع‌تر)
            const isFree = /:free\b/i.test(modelId);
            const userChose = String(process.env.TEST_ONLY_FREE_MODELS || "true") === "true" ? isFree : true;
            if (!userChose) continue;
            // ← تشخیص metadata
const modalities =
  model.input_modality ||
  model.architecture?.input_modalities ||
  model.modality || [];
const metaVision =
  Array.isArray(modalities) &&
  modalities.some((m) => /image|vision/i.test(String(m)));
const rawContext =
  Number(model.context_length) ||
  Number(model.context_window) ||
  Number(model.max_context_length) ||
  Number(model.max_input_tokens) ||
  0;
tasks.push({
  provider,
  modelId,
  config,
  apiKey,
  metaVision,
  contextLength: rawContext > 0 ? rawContext : heuristicContextLength(modelId),
});
          }
        }
      } catch (error) {
        console.warn(
          `Could not fetch models for ${provider}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

       const results = {};
    const concurrency = 5;

    // ← جدید: شروع فوری healthCache (incremental)
    healthCache.timestamp = Date.now();
    healthCache.models = {};

    for (let index = 0; index < tasks.length; index += concurrency) {
      // ← جدید: اگر کلاینت قطع شد، تست را متوقف کن
      if (_req.aborted) {
        console.log(`[test-all-models] Client aborted at ${index}/${tasks.length}`);
        break;
      }

      const batch = tasks.slice(index, index + concurrency);
      await Promise.all(
        batch.map(async (task) => {
          const startedAt = Date.now();
          const key = `${task.provider}:${task.modelId}`;
          try {
                        const response = await fetchWithTimeout(
              task.config.chatUrl(),
              {
                method: "POST",
                headers: { "Content-Type": "application/json", ...task.config.headers(task.apiKey) },
                body: JSON.stringify({
                  model: task.modelId,
                  messages: [{ role: "user", content: "ping" }],
                  max_tokens: 32,
                  stream: false,
                }),
              },
              8000
            );

            // ← جدید: خواندن body برای استخراج usage
            let reasoningRatio;
            if (response.ok) {
              const json = await response.json().catch(() => null);
              const usage = json?.usage;
              if (
                usage?.completion_tokens > 0 &&
                usage?.completion_tokens_details?.reasoning_tokens != null
              ) {
                reasoningRatio = usage.completion_tokens_details.reasoning_tokens / usage.completion_tokens;
              }
            }

            results[key] = (() => {
  const base = getModelCapabilities(task.provider, task.modelId) || {};
  const existing = healthCache.models[key] || {};
  const existingVision = existing.capabilities?.imageInput === true;
  return {
    ok: response.ok,
    latency: Date.now() - startedAt,
    provider: task.provider,
    modelId: task.modelId,
    capabilities: {
      streaming: true,
      toolCalling: false,
      ...base,
      imageInput: base.imageInput === true || task.metaVision === true || existingVision,
    },
    contextLength: task.contextLength,
    ...(!response.ok ? { error: `HTTP ${response.status}` } : {}),
  };
})();
          } catch (error) {
  results[key] = {
    ok: false,
    latency: Date.now() - startedAt,
    provider: task.provider,
    modelId: task.modelId,
    capabilities: (() => {
      const base = getModelCapabilities(task.provider, task.modelId) || {};
      return {
        streaming: true,
        toolCalling: false,
        ...base,
        imageInput: base.imageInput === true || task.metaVision === true,
      };
    })(),
    contextLength: task.contextLength,   // ← اضافه کن
    error: error instanceof Error ? error.message : "Request failed",
  };
}
          // ← جدید: به‌روزرسانی فوری healthCache (incremental)
         
        })
      );
    }

    healthCache.timestamp = Date.now();
    res.json({ success: true, fromCache: false, results });
  }
);

// --------------------------------------------------
// CHAT
// --------------------------------------------------

app.post("/api/chat", async (req, res) => {
  console.log(`[Chat Handler] NEW handler running for request`);
  const chatStartedAt = Date.now();
  const { provider, model, messages, autoMode } = req.body || {};
  const requestedStrategy = String(req.body?.strategy || "").toLowerCase();

  // Smart Mode: در autoMode، provider و model اختیاری هستند
  const needsProvider = autoMode !== true;
  if (needsProvider) {
    if (
      typeof provider !== "string" ||
      typeof model !== "string" ||
      !provider.trim() ||
      !model.trim()
    ) {
      return res.status(400).json({ success: false, error: "سرویس‌دهنده و مدل باید مشخص باشند." });
    }
  }

  if (!isValidMessages(messages)) {
    console.log(`[Chat Debug] isValidMessages FAILED.`);
    return res.status(400).json({
      success: false,
      error: "ساختار پیام‌ها نامعتبر است یا حجم آن‌ها بیش از حد مجاز است.",
    });
  }

  if (needsProvider) {
    const requested = getProvider(provider);
    if (requested.error) {
      return res.status(400).json({ success: false, error: requested.error });
    }
  }

  const hasImage = messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "image_url")
  );

  const routerConfig = await readRouterConfig();
  const { strategy } = await resolveStrategy({
    body: { strategy: requestedStrategy, autoMode },
    config: routerConfig,
  });

  // ---- فراخوانی planAttempts با try/catch ----
  let plan;
  try {
    plan = await planAttempts({
      strategy,
      config: routerConfig,
      primaryProvider: provider ? String(provider).toLowerCase() : "",
      primaryModel: model || "",
      healthCache,
      hasImage,
      messages,
    });
  } catch (err) {
    console.warn("[chat] planAttempts failed:", err instanceof Error ? err.message : err);
    return res.status(503).json({
      success: false,
      error: err instanceof Error ? err.message : "مسیریابی ناموفق بود.",
    });
  }

  // ---- دیباگ ----
  console.log(`[Chat AfterPlan] plan keys: ${plan ? Object.keys(plan).join(',') : 'N/A'}`);
  console.log(`[Chat AfterPlan] plan.planned is Array? ${Array.isArray(plan?.planned)}`);
  console.log(`[Chat AfterPlan] plan.planned.length=${plan?.planned?.length}`);

  const attempts = plan?.planned;

  // ---- اگر attempts خالی است: 503 ----
  if (!attempts || attempts.length === 0) {
    console.log(`[Chat 503] attempts is empty!`);
    const cacheEmpty = Object.keys(healthCache.models).length === 0;
    return res.status(503).json({
      success: false,
      error: cacheEmpty
        ? "مدل‌ها هنوز آماده نیستند. لطفاً ۱۵-۳۰ ثانیه صبر کنید و دوباره تلاش کنید."
        : "هیچ مدل سالمی در دسترس نیست. لطفاً «تست همه سرویس‌دهنده‌ها» را اجرا کنید.",
    });
  }   // ← 🔴 این } حیاتی است!

  // ---- حالا attempts خالی نیست، ادامه بده ----
  res.setHeader("X-Router-Strategy", strategy);
  res.setHeader("X-Router-Attempts", String(attempts.length));
  if (plan.complexity) {
    res.setHeader("X-Router-Complexity", String(plan.complexity.score));
    res.setHeader("X-Router-Tier", plan.complexity.tier);
  }

  let chatStatus = "failed";
  let chatError = null;
  let chatAttempt = 0;
  let effectiveProvider = provider ? String(provider).toLowerCase() : "";
  let effectiveModel = model || "";
  let capturedUsage = null;
  let capturedActualModel = null;
  let capturedContent = "";           // ← جدید: متن پاسخ مدل
  let capturedReasoning = "";         // ← جدید: reasoning (برای مدل‌های thinking)
  let lastError = null;
  const pendingFallbacks = [];

  try {
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      if (!attempt.provider || !attempt.model) {
        lastError = new Error("هدف مسیریابی نامعتبر.");
        continue;
      }
      const selected = getProvider(attempt.provider);
      if (selected.error) {
        lastError = new Error(selected.error);
        continue;
      }

      capturedActualModel = null;
      capturedUsage = null;

      const upstreamController = new AbortController();
      const abortUpstream = () => upstreamController.abort(new Error("Client disconnected"));
      req.once("aborted", abortUpstream);
      res.once("close", () => {
        if (!res.writableEnded) upstreamController.abort(new Error("Client disconnected"));
      });

      let attemptSucceeded = false;
      let attemptError = null;

      try {
        let response = null;
        for (let retry = 0; retry <= MAX_ATTEMPT_RETRIES; retry += 1) {
          try {
            if (retry > 0) {
              await sleep(RETRY_DELAYS_MS[retry - 1] || 3000);
            }

            const r = await fetchWithTimeout(selected.config.chatUrl(), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...selected.config.headers(selected.apiKey),
              },
              body: JSON.stringify({
                model: attempt.model,
                messages,
                stream: true,
                max_tokens: MAX_OUTPUT_TOKENS,
                stream_options: { include_usage: true },
              }),
              signal: upstreamController.signal,
            });

            if (r.ok) {
              response = r;
              break;
            }

            const errorBody = await r.text().catch(() => "");
            const retriable = r.status === 429 || r.status >= 500;

            if (retriable && retry < MAX_ATTEMPT_RETRIES) {
              lastError = new Error(`HTTP ${r.status} (retrying)`);
              continue;
            }

            if (r.status === 402 && /insufficient|credit|balance|afford/i.test(errorBody)) {
              throw new Error(`موجودی حساب ${attempt.provider} کافی نیست.`);
            }
            if (r.status === 401) {
              throw new Error(`کلید API برای ${attempt.provider} نامعتبر است.`);
            }
            if (r.status === 429) {
              throw new Error(`محدودیت نرخ ${attempt.provider} پر شده است.`);
            }

            throw new Error(
              `Provider ${attempt.provider} returned HTTP ${r.status}` +
                (errorBody ? `: ${errorBody.slice(0, 300)}` : "")
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            if (retry < MAX_ATTEMPT_RETRIES && isRetriableNetworkError(msg)) {
              lastError = err;
              continue;
            }
            throw err;
          }
        }

        if (!response || !response.ok) {
          throw lastError || new Error("All retries failed");
        }

        if (!response.body) {
          throw new Error("Provider returned an empty response stream.");
        }

        if (!res.headersSent) {
          res.status(200);
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          res.flushHeaders?.();
          for (const fb of pendingFallbacks) {
            res.write(`data: ${JSON.stringify(fb)}\n\n`);
          }
        }

        const streamTimeout = setTimeout(() => {
          upstreamController.abort(new Error("Provider stream timed out"));
        }, REQUEST_TIMEOUT_MS);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (res.destroyed || upstreamController.signal.aborted) break;

            if (!res.write(value)) {
              await new Promise((resolve) => res.once("drain", resolve));
            }

            try {
              lineBuffer += decoder.decode(value, { stream: true });
              const lines = lineBuffer.split("\n");
              lineBuffer = lines.pop() || "";
              for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                                try {
                  const chunk = JSON.parse(data);
                  if (!capturedActualModel && typeof chunk.model === "string" && chunk.model.length > 0) {
                    capturedActualModel = chunk.model;
                  }
                  if (chunk.usage && (chunk.usage.total_tokens || chunk.usage.prompt_tokens || chunk.usage.completion_tokens)) {
                    capturedUsage = chunk.usage;
                  }
                  // ← جدید: جمع‌آوری متن پاسخ
                  const delta = chunk?.choices?.[0]?.delta;
                  if (typeof delta?.content === "string") {
                    capturedContent += delta.content;
                  }
                  if (typeof delta?.reasoning === "string") {
                    capturedReasoning += delta.reasoning;
                  }
                } catch { /* ignore */ }
              }
            } catch { /* ignore */ }
          }
        } finally {
          clearTimeout(streamTimeout);
          reader.releaseLock();
        }

        if (!res.destroyed && !res.writableEnded) res.end();
        attemptSucceeded = true;
      } catch (err) {
        attemptError = err;
        lastError = err;

        if (upstreamController.signal.aborted && (req.aborted || res.destroyed)) {
          chatStatus = "aborted";
          chatAttempt = index;
          effectiveProvider = attempt.provider;
          effectiveModel = attempt.model;
          req.removeListener("aborted", abortUpstream);
          return;
        }

        console.warn(`Chat attempt ${index + 1} failed (${attempt.provider}/${attempt.model}):`, err instanceof Error ? err.message : err);


const errorText = err instanceof Error ? err.message : "";
const isVisionNetworkError =
  hasImage === true &&
  /file could not be fetched|media could not be downloaded|invalid_request_file|no endpoints found that support image|access denied by security policy|upstream returned HTTP 400.*file/i.test(errorText);

const existingKey = `${attempt.provider}:${attempt.model}`;
const existing = healthCache.models[existingKey] || {};
const baseCaps = getModelCapabilities(attempt.provider, attempt.model) || {};

healthCache.models[existingKey] = {
  ...existing,                                       // ← contextLength، reasoningRatio، و غیره حفظ
  ok: isVisionNetworkError ? true : false,
  latency: Date.now() - chatStartedAt,
  provider: attempt.provider,
  modelId: attempt.model,
  error: errorText || "provider error",
  capabilities: {
    streaming: true,
    toolCalling: false,
    ...baseCaps,
    ...(existing.capabilities || {}),                // ← imageInput:true از metadata حفظ
  },
};
  // یادگیری از موفقیت (با آنالیز متن پاسخ)
  learnVisionCapability(attempt.provider, attempt.model, {
    hasImage,
    succeeded: true,
    responseContent: capturedContent,
    responseReasoning: capturedReasoning,
  });


if (res.headersSent) {
          if (!res.destroyed && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ error: { message: err instanceof Error ? err.message : "Provider request failed" } })}\n\n`);
            res.end();
          }
          chatStatus = "partial_failure";
          chatAttempt = index;
          chatError = err instanceof Error ? err.message : "stream error";
          effectiveProvider = attempt.provider;
          effectiveModel = attempt.model;
          req.removeListener("aborted", abortUpstream);
          return;
        }
      } finally {
        req.removeListener("aborted", abortUpstream);
      }

           if (attemptSucceeded) {
  chatStatus = "success";
  chatAttempt = index;
  effectiveProvider = attempt.provider;
  effectiveModel = attempt.model;

  const existingKey = `${attempt.provider}:${attempt.model}`;
  const existing = healthCache.models[existingKey] || {};

  let newReasoningRatio = existing.reasoningRatio;
  if (
    capturedUsage?.completion_tokens > 0 &&
    capturedUsage?.completion_tokens_details?.reasoning_tokens != null
  ) {
    newReasoningRatio = capturedUsage.completion_tokens_details.reasoning_tokens / capturedUsage.completion_tokens;
  }

  const baseCaps = getModelCapabilities(attempt.provider, attempt.model) || {};
  const caps = {
    streaming: true,
    toolCalling: false,
    ...existing.capabilities,
    ...baseCaps,
    imageInput:
      baseCaps.imageInput === true ||
      existing.capabilities?.imageInput === true,
  };

  healthCache.models[existingKey] = {
    ...existing,
    ok: true,
    latency: Date.now() - chatStartedAt,
    provider: attempt.provider,
    modelId: attempt.model,
    capabilities: caps,
    reasoningRatio: newReasoningRatio,
  };

  // ← یادگیری از موفقیت (باید content پاس شود)
  console.log(`[Vision Pre-Learn] key=${existingKey} hasImage=${hasImage} contentLen=${capturedContent.length} preview="${capturedContent.slice(0, 40)}"`);
  learnVisionCapability(attempt.provider, attempt.model, {
    hasImage,
    succeeded: true,
    responseContent: capturedContent,
    responseReasoning: capturedReasoning,
  });

  return;
}

      if (index + 1 < attempts.length && strategy !== "manual") {
        const next = attempts[index + 1];
        pendingFallbacks.push({
          type: "fallback",
          from: { provider: attempt.provider, model: attempt.model },
          to: { provider: next.provider, model: next.model },
          reason: attemptError instanceof Error ? attemptError.message : "provider error",
          attempt: index + 1,
        });
      }

      if (strategy === "manual") {
        chatAttempt = index;
        chatError = attemptError instanceof Error ? attemptError.message : "provider error";
        effectiveProvider = attempt.provider;
        effectiveModel = attempt.model;
        break;
      }
    }

    if (!res.headersSent && !res.destroyed) {
      res.status(502).json({
        success: false,
        error: lastError instanceof Error ? lastError.message : "ارسال درخواست به مدل ناموفق بود.",
      });
    }

    if (chatStatus === "failed" && !chatError) {
      chatError = lastError instanceof Error ? lastError.message : "all attempts failed";
      chatAttempt = Math.max(0, attempts.length - 1);
    }
  } finally {
    void appendUsageRecord(
      createUsageRecord({
        provider: effectiveProvider,
        model: capturedActualModel || effectiveModel,
        status: chatStatus,
        latencyMs: Date.now() - chatStartedAt,
        promptTokens: capturedUsage?.prompt_tokens ?? null,
        completionTokens: capturedUsage?.completion_tokens ?? null,
        totalTokens: capturedUsage?.total_tokens ?? null,
        reasoningTokens: capturedUsage?.completion_tokens_details?.reasoning_tokens ?? null,
        cost: capturedUsage?.cost ?? null,
        hasImage,
        streamed: true,
        errorMessage: chatError ? String(chatError).slice(0, 500) : null,
        fallbackAttempt: chatAttempt,
        autoMode: autoMode === true,
        strategy,
        complexityScore: plan.complexity?.score ?? null,
        complexityTier: plan.complexity?.tier ?? null,
      })
    ).catch((err) => {
      console.warn("Usage record failed:", err instanceof Error ? err.message : err);
    });
  }
});

// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------

app.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ success: false, error: "حجم درخواست بیش از حد مجاز است." });
  }
  if (error?.message === "Origin is not allowed by CORS") {
    return res.status(403).json({ success: false, error: "مبدأ درخواست مجاز نیست." });
  }
  console.error("Unhandled API error:", error);
  res.status(500).json({ success: false, error: "خطای داخلی سرور رخ داد." });
});
// ← جدید: پر کردن فوری healthCache با fetch /models (بدون ping)
async function prePopulateHealthCache() {
  console.log("[startup] Pre-populating health cache (models list only, no ping)...");
  try {
    let count = 0;
    for (const [provider, config] of Object.entries(PROVIDERS)) {
      const apiKey = config.getApiKey();
      if (!apiKey) continue;
      try {
        // ← Retry برای 403/429 با backoff
let response = null;
let lastError = null;
for (let attempt = 0; attempt < 3; attempt++) {
  if (attempt > 0) {
    const delay = 2000 * Math.pow(2, attempt - 1);  // 2s, 4s
    console.log(`[startup] Retrying ${provider} /models in ${delay}ms (attempt ${attempt + 1}/3)...`);
    await new Promise((r) => setTimeout(r, delay));
  }
  try {
    response = await fetchWithTimeout(
      config.modelsUrl(),
      { headers: config.headers(apiKey) },
      15000
    );
    if (response.ok) break;
    if (response.status !== 403 && response.status !== 429 && response.status !== 502 && response.status < 500) {
      break; // خطای غیرقابل retry (401, 404, ...)
    }
    lastError = `HTTP ${response.status}`;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    response = null;
  }
}

if (!response || !response.ok) {
  console.warn(`[startup] Pre-populate failed for ${provider}: ${lastError || (response && `HTTP ${response.status}`)}`);
  continue;
}

const data = await response.json().catch(() => ({}));
if (!Array.isArray(data.data)) {
  console.warn(`[startup] Pre-populate for ${provider}: no models returned`);
  continue;
}
        for (const model of data.data) {
          if (!model?.id) continue;
          const modelId = String(model.id);
          const key = `${provider}:${modelId}`;

          // ← تشخیص vision از metadata
          const modalities =
            model.input_modality ||
            model.architecture?.input_modalities ||
            model.modality || [];
          const metaVision =
            Array.isArray(modalities) &&
            modalities.some((m) => /image|vision/i.test(String(m)));

          const base = getModelCapabilities(provider, modelId) || {};
          const caps = {
            streaming: true,
            toolCalling: false,
            ...base,
            imageInput: base.imageInput === true || metaVision === true,
          };

          // ← context از provider، اگر نبود heuristic
          const rawContext =
            Number(model.context_length) ||
            Number(model.context_window) ||
            Number(model.max_context_length) ||
            Number(model.max_input_tokens) ||
            0;

          healthCache.models[key] = {
            ok: true,
            latency: 0,
            provider,
            modelId,
            capabilities: caps,
            contextLength: rawContext > 0 ? rawContext : heuristicContextLength(modelId),
          };
          count++;
        }
      } catch (error) {
        console.warn(
          `[startup] Pre-populate failed for ${provider}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
    healthCache.timestamp = Date.now();
    console.log(`[startup] Pre-populated ${count} models (optimistic). Background test will refine.`);
  } catch (error) {
    console.warn("[startup] Pre-populate failed:", error instanceof Error ? error.message : error);
  }
}
// ===== یادگیری Vision از رفتار واقعی مدل (بدون نام هاردکد) =====
// - اگر درخواست تصویری موفق شد → قطعاً vision دارد
// - اگر provider گفت "does not support vision" → قطعاً ندارد
// - اگر provider گفت "File could not be fetched" / "invalid_request_file" → vision دارد
//   (چون تلاش کرد تصویر را پردازش کند، فقط شبکه‌اش خطا داد)
function learnVisionCapability(providerId, modelId, { hasImage, succeeded, errorMessage, responseContent, responseReasoning }) {
  console.log(`[Vision Learn CALLED] ${providerId}:${modelId} hasImage=${hasImage} succeeded=${succeeded} contentLen=${responseContent?.length ?? 0}`);
  if (!hasImage) return;
  const key = `${providerId}:${modelId}`;
  const entry = healthCache.models[key];
  if (!entry) return;

  const caps = entry.capabilities || {};
  const msg = String(errorMessage || "").toLowerCase();
  const resp = String(responseContent || "").toLowerCase();
  const respReason = String(responseReasoning || "").toLowerCase();

  let learned = null;

  if (succeeded) {
    // رد شده قبلاً، دست نزن
    if (entry.visionRejected === true) {
      learned = null;
    }
    // مدل خودش گفت نمی‌بیند → vision ندارد
    else if (resp && /can'?t see|don'?t see|no image|without (an )?image|image (not|wasn'?t) (provided|attached|included)|unable to (see|view)|cannot (see|view)|no image (provided|attached)/i.test(resp)) {
      learned = false;
      entry.visionRejected = true;
    }
    // reasoning گفت نمی‌بیند
    else if (!resp && respReason && /can'?t see|don'?t see|no image|unable to (see|view)/i.test(respReason)) {
      learned = false;
      entry.visionRejected = true;
    }
    // پاسخ واقعی دارد و انکار نکرد → vision دارد
    else if (resp || respReason) {
      learned = true;
    }
    // پاسخ خالی → نمی‌دانیم
    else {
      learned = null;
    }
  } else if (/does not support vision|unsupported_model_feature|vision.*not.*support|no endpoints.*support image|not support.*image.*input|image.*input.*not.*support/i.test(msg)) {
    learned = false;
    entry.visionRejected = true;
  } else if (/file could not be fetched|invalid_request_file|upstream returned HTTP 400.*file|media could not be downloaded|failed to (download|fetch|retrieve) (the )?image|image (could not be|failed to be) (fetched|downloaded|retrieved)|access denied by security policy/i.test(msg)) {
    learned = true;
  }

  if (learned === null) return;
  if (caps.imageInput === learned) return;

  entry.capabilities = { ...caps, imageInput: learned };
  console.log(
    `[Vision Learn] ${key} → imageInput=${learned}` +
    (errorMessage ? ` (reason: ${errorMessage.slice(0, 80)})` : "") +
    (resp && /can'?t see|don'?t see|no image/i.test(resp) ? ` (resp: "${resp.slice(0, 60)}")` : "")
  );
}
// ← تابع populate (تست واقعی، فقط مدل‌های رایگان)

async function populateHealthCacheOnStartup() {
  if (Object.keys(healthCache.models).length > 0 && Date.now() - healthCache.timestamp < CACHE_TTL) {
    console.log("[startup] Health cache already populated, skipping auto-test.");
    return;
  }

  console.log("[startup] Auto-populating health cache in background...");
  setTimeout(async () => {
    try {
      // همان منطق endpoint /api/test-all-models، ولی بدون HTTP
      const tasks = [];
      for (const [provider, config] of Object.entries(PROVIDERS)) {
        const apiKey = config.getApiKey();
        if (!apiKey) continue;
        try {
          let response = null;
let lastError = null;
for (let attempt = 0; attempt < 3; attempt++) {
  if (attempt > 0) {
    const delay = 2000 * Math.pow(2, attempt - 1);
    await new Promise((r) => setTimeout(r, delay));
  }
  try {
    response = await fetchWithTimeout(config.modelsUrl(), { headers: config.headers(apiKey) }, 15000);
    if (response.ok) break;
    if (response.status !== 403 && response.status !== 429 && response.status !== 502 && response.status < 500) {
      break;
    }
    lastError = `HTTP ${response.status}`;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    response = null;
  }
}

if (response && response.ok) {
  const data = await response.json().catch(() => ({}));
  if (Array.isArray(data.data)) {
    for (const model of data.data) {
    if (!model?.id) continue;
    const modelId = String(model.id);
    const modalities =
      model.input_modality ||
      model.architecture?.input_modalities ||
      model.modality || [];
    const metaVision =
      Array.isArray(modalities) &&
      modalities.some((m) => /image|vision/i.test(String(m)));
    const rawContext =
      Number(model.context_length) ||
      Number(model.context_window) ||
      Number(model.max_context_length) ||
      Number(model.max_input_tokens) ||
      0;
    tasks.push({
      provider,
      modelId,
      config,
      apiKey,
      metaVision,
      contextLength: rawContext > 0 ? rawContext : heuristicContextLength(modelId),
    });
  }
}
      } else {
      console.warn(`[startup] Could not fetch models for ${provider}: ${lastError || (response ? `HTTP ${response.status}` : "unknown error")}`);
    }
  } catch (error) {
    console.warn(`[startup] Could not fetch models for ${provider}:`, error instanceof Error ? error.message : error);
  }
      }

      const results = {};
      const concurrency = 5;
      for (let index = 0; index < tasks.length; index += concurrency) {
        const batch = tasks.slice(index, index + concurrency);
        await Promise.all(
          batch.map(async (task) => {
            const startedAt = Date.now();
            const key = `${task.provider}:${task.modelId}`;
            try {
              const response = await fetchWithTimeout(
                task.config.chatUrl(),
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...task.config.headers(task.apiKey) },
                  body: JSON.stringify({
                    model: task.modelId,
                    messages: [{ role: "user", content: "ping" }],
                    max_tokens: 16,
                    stream: false,
                  }),
                },
                8000
              );
                                         results[key] = {
                ok: response.ok,
                latency: Date.now() - startedAt,
                provider: task.provider,
                modelId: task.modelId,
                capabilities: (() => {
  const base = getModelCapabilities(task.provider, task.modelId) || {};
  return {
    streaming: true,
    toolCalling: false,
    ...base,
    imageInput: base.imageInput === true || task.metaVision === true,
  };
})(),
                contextLength: task.contextLength, // ← جدید
                ...(!response.ok ? { error: `HTTP ${response.status}` } : {}),
              };
            } catch (error) {
              results[key] = {
                ok: false,
                latency: Date.now() - startedAt,
                provider: task.provider,
                modelId: task.modelId,
                capabilities: (() => {
  const base = getModelCapabilities(task.provider, task.modelId) || {};
  return {
    streaming: true,
    toolCalling: false,
    ...base,
    imageInput: base.imageInput === true || task.metaVision === true,
  };
})(),
                error: error instanceof Error ? error.message : "Request failed",
              };
            }
            healthCache.models[key] = results[key];
          })
        );
      }
            healthCache.timestamp = Date.now();
      const healthy = Object.values(results).filter((r) => r.ok).length;
      
      // ← جدید: اگر همه پینگ‌ها fail شدند، خزانه‌ی prePopulate را نابود نکن
      if (healthy === 0 && Object.keys(healthCache.models).length > 0) {
        console.warn(`[startup] ⚠️ All ${Object.keys(results).length} pings failed. Keeping optimistic ok:true from prePopulate (likely network issue).`);
        // results را نادیده بگیر، healthCache را دست نزن
      } else {
        for (const key in results) {
          healthCache.models[key] = results[key];
        }
      }
      
      console.log(`[startup] Health cache populated: ${healthy}/${Object.keys(results).length} healthy models.`);
    } catch (error) {
      console.warn("[startup] Failed to populate health cache:", error instanceof Error ? error.message : error);
    }
  }, 3000);
}

const server = app.listen(PORT, HOST, () => {
  console.log(`ARO Backend running at http://${HOST}:${PORT}`);
  console.log(`Default provider: ${process.env.DEFAULT_AI_PROVIDER || "1xai"}`);
  console.log(
    "Configured providers:",
    Object.keys(PROVIDERS).filter((id) => Boolean(PROVIDERS[id].getApiKey()))
  );
  console.log("Admin API: http://" + HOST + ":" + PORT + "/api/admin/providers");

    
  // ← جدید: Pre-populate فوری (بدون ping) تا درخواست‌های اولیه 500 نگیرند
  void prePopulateHealthCache();
  // ← بعد از ۳ ثانیه، تست واقعی شروع شود (به‌روزرسانی ok/latency)
  void populateHealthCacheOnStartup();
});


server.requestTimeout = REQUEST_TIMEOUT_MS + 10000;
server.headersTimeout = Math.max(server.requestTimeout + 5000, 60000);

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));