// server/usage/store.js
import { appendFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const LOG_FILE = path.join(DATA_DIR, "usage-log.jsonl");

const MAX_RECORDS = Number.parseInt(process.env.USAGE_LOG_MAX_RECORDS || "10000", 10);

let writeQueue = Promise.resolve();

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

function generateId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createUsageRecord(fields = {}) {
  return {
    id: generateId(),
    timestamp: Date.now(),
    provider: "",
    model: "",
    status: "unknown",
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    hasImage: false,
    streamed: false,
    errorMessage: null,
    fallbackAttempt: 0,
    autoMode: false,
    strategy: null,
    complexityScore: null,
    complexityTier: null,
    reasoningTokens: null,
    cost: null,
    ...fields,
  };
}

async function rotateIfNeeded() {
  try {
    const raw = await readFile(LOG_FILE, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length <= MAX_RECORDS) return;
    const kept = lines.slice(-MAX_RECORDS);
    await writeFile(LOG_FILE, kept.join("\n") + "\n", "utf8");
  } catch { /* ignore */ }
}

export async function appendUsageRecord(record) {
  await ensureDataDir();
  writeQueue = writeQueue.then(async () => {
    try {
      await appendFile(LOG_FILE, JSON.stringify(record) + "\n", "utf8");
      if (Math.random() < 0.01) {
        await rotateIfNeeded();
      }
    } catch (err) {
      console.warn("Failed to append usage record:", err.message);
    }
  });
  return writeQueue;
}

export async function readUsageLog(limit = 0) {
  try {
    const raw = await readFile(LOG_FILE, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const slice = limit > 0 ? lines.slice(-limit) : lines;
    return slice
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}