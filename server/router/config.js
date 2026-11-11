// server/router/config.js
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VALID_STRATEGIES } from "./strategies.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const CONFIG_FILE = path.join(DATA_DIR, "router-config.json");

const DEFAULT_CONFIG = {
  version: 1,
  defaultStrategy: "auto-balanced",
   "maxAttempts": 5,
  weights: { quality: 0.4, cost: 0.3, latency: 0.3 },
};

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

export async function readRouterConfig() {
  await ensureDataDir();
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    if (err.code === "ENOENT") {
      await writeRouterConfig(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeRouterConfig(config) {
  await ensureDataDir();
  const merged = { ...DEFAULT_CONFIG, ...config };
  await writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

export function validateRouterConfigPatch(patch) {
  const out = {};
  const errors = [];
  if (patch.defaultStrategy !== undefined) {
    if (!VALID_STRATEGIES.includes(patch.defaultStrategy)) {
      errors.push(`defaultStrategy باید یکی از ${VALID_STRATEGIES.join(", ")} باشد.`);
    } else {
      out.defaultStrategy = patch.defaultStrategy;
    }
  }
  if (patch.maxAttempts !== undefined) {
    const n = Number.parseInt(patch.maxAttempts, 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) errors.push("maxAttempts بین ۱ تا ۱۰.");
    else out.maxAttempts = n;
  }
  if (patch.weights !== undefined) {
    if (typeof patch.weights !== "object" || patch.weights === null) {
      errors.push("weights باید آبجکت باشد.");
    } else {
      const w = {};
      for (const k of ["quality", "cost", "latency"]) {
        const v = Number(patch.weights[k]);
        if (Number.isFinite(v) && v >= 0 && v <= 1) w[k] = v;
      }
      out.weights = w;
    }
  }
  return { errors, data: out };
}