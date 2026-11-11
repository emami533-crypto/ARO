// server/providers/loader.js
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "providers.json");

function getDefaultProvidersData() {
  return {
    version: 1,
    providers: [
      { id: "1xai", name: "1xAI", type: "openai-compatible",
        baseUrl: "https://1xai.ir/v1", apiKey: "",
        apiKeyEnvVars: ["ONEXAI_API_KEY", "X1AI_API_KEY"], enabled: true, order: 0 },
      { id: "openrouter", name: "OpenRouter", type: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1", apiKey: "",
        apiKeyEnvVars: ["OPENROUTER_API_KEY"], enabled: true, order: 1 },
      { id: "xkiro", name: "Xkiro", type: "openai-compatible",
        baseUrl: "https://api.xkiro.com/v1", apiKey: "",
        apiKeyEnvVars: ["XKIRO_API_KEY"], enabled: true, order: 2 },
      { id: "groq", name: "Groq", type: "openai-compatible",
        baseUrl: "https://api.groq.com/openai/v1", apiKey: "",
        apiKeyEnvVars: ["GROQ_API_KEY"], enabled: true, order: 3 },
      { id: "mistral", name: "Mistral AI", type: "openai-compatible",
        baseUrl: "https://api.mistral.ai/v1", apiKey: "",
        apiKeyEnvVars: ["MISTRAL_API_KEY"], enabled: true, order: 4 },
      { id: "freebuff", name: "Freebuff", type: "openai-compatible",
        baseUrl: "https://freebuff.llm.pm/v1", apiKey: "",
        apiKeyEnvVars: ["FREEBUFF_TOKEN"], enabled: true, order: 5 },
      { id: "sambanova", name: "SambaNova", type: "openai-compatible",
        baseUrl: "https://api.sambanova.ai/v1", apiKey: "",
        apiKeyEnvVars: ["SAMBANOVA_API_KEY"], enabled: true, order: 6 },
      { id: "cloudflare", name: "Cloudflare Workers AI", type: "openai-compatible",
        baseUrl: "https://api.cloudflare.com/client/v4/accounts/{{CLOUDFLARE_ACCOUNT_ID}}/ai/v1",
        apiKey: "", apiKeyEnvVars: ["CLOUDFLARE_API_KEY"], enabled: true, order: 7 },
    ],
  };
}

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

export async function readProvidersFile() {
  await ensureDataDir();
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.providers)) {
      throw new Error("providers.json: missing 'providers' array.");
    }
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") {
      const defaults = getDefaultProvidersData();
      await writeProvidersFile(defaults);
      return defaults;
    }
    throw err;
  }
}

export async function writeProvidersFile(data) {
  await ensureDataDir();
  const ordered = {
    version: data.version || 1,
    providers: [...data.providers].map(({ apiKey, ...provider }) => provider).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  };
  await writeFile(DATA_FILE, JSON.stringify(ordered, null, 2), "utf8");
  return ordered;
}

function resolveTemplate(str, env) {
  if (!str) return "";
  return String(str).replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, varName) => {
    const value = env[varName];
    return value == null ? "" : String(value);
  });
}

export function resolveApiKey(entry, env) {
  if (!entry) return "";
  const envVars = Array.isArray(entry.apiKeyEnvVars) ? entry.apiKeyEnvVars : [];
  for (const varName of envVars) {
    const value = env[varName];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function maskApiKey(key) {
  if (!key) return "";
  const s = String(key);
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function isBaseUrlUsable(baseUrl) {
  if (!baseUrl) return false;
  if (!/^https?:\/\//i.test(baseUrl)) return false;
  // detect double slash or empty templated placeholder
  if (baseUrl.includes("//accounts//")) return false;
  return true;
}

export async function buildProviderInstances(env) {
  const data = await readProvidersFile();
  const { createOpenAICompatibleAdapter } = await import("./adapters/openai-compatible.js");
  const instances = {};

  for (const entry of data.providers) {
    if (!entry || !entry.id) continue;
    if (entry.enabled === false) continue;

    const resolvedBaseUrl = resolveTemplate(entry.baseUrl, env).replace(/\/+$/, "");
    if (!isBaseUrlUsable(resolvedBaseUrl)) continue;

    const apiKey = resolveApiKey(entry, env);

    if (entry.type === "openai-compatible") {
      instances[entry.id] = createOpenAICompatibleAdapter({
        id: entry.id,
        name: entry.name || entry.id,
        baseUrl: resolvedBaseUrl,
        getApiKey: () => resolveApiKey(entry, env),
      });
    }
    // adapterهای بیشتر در آینده
  }

  return instances;
}

export function sanitizeProviderForAdmin(entry, env) {
  const apiKey = resolveApiKey(entry, env);
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    baseUrl: entry.baseUrl,
    enabled: entry.enabled !== false,
    order: entry.order ?? 0,
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: maskApiKey(apiKey),
    apiKeySource: apiKey ? "env" : "none",
    apiKeyEnvVars: Array.isArray(entry.apiKeyEnvVars) ? entry.apiKeyEnvVars : [],
  };
}