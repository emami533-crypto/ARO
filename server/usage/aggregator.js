// server/usage/aggregator.js
import { readUsageLog } from "./store.js";

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

export async function computeSummary(sinceMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - sinceMs;
  const records = (await readUsageLog(0)).filter((r) => r.timestamp >= cutoff);

  const total = records.length;
  const success = records.filter((r) => r.status === "success").length;
  const failed = records.filter((r) => r.status === "failed").length;
  const aborted = records.filter((r) => r.status === "aborted").length;
  const partial = records.filter((r) => r.status === "partial_failure").length;
  const successRate = total ? (success / total) * 100 : 0;

  const latencies = records
    .filter((r) => r.status === "success" && r.latencyMs > 0)
    .map((r) => r.latencyMs);

  const totalTokens = records.reduce((s, r) => s + (r.totalTokens || 0), 0);
  const totalCost = records.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const visionRequests = records.filter((r) => r.hasImage).length;
  const autoModeRequests = records.filter((r) => r.autoMode).length;
  const withFallback = records.filter((r) => (r.fallbackAttempt || 0) > 0).length;

  return {
    windowHours: Math.round(sinceMs / (60 * 60 * 1000)),
    since: new Date(cutoff).toISOString(),
    total,
    success,
    failed,
    aborted,
    partial,
    successRate: Math.round(successRate * 10) / 10,
    avgLatencyMs: Math.round(avg(latencies)),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    totalTokens,
    totalCost,
    visionRequests,
    autoModeRequests,
    requestsWithFallback: withFallback,
  };
}

export async function groupBy(field, sinceMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - sinceMs;
  const records = (await readUsageLog(0)).filter((r) => r.timestamp >= cutoff);

  const groups = new Map();
  for (const r of records) {
    const key = String(r[field] || "(unknown)");
    if (!groups.has(key)) {
      groups.set(key, { key, count: 0, success: 0, failed: 0, latencies: [], tokens: 0 });
    }
    const g = groups.get(key);
    g.count++;
    if (r.status === "success") {
      g.success++;
      if (r.latencyMs > 0) g.latencies.push(r.latencyMs);
    } else if (r.status === "failed") {
      g.failed++;
    }
    g.tokens += r.totalTokens || 0;
  }

  const out = [];
  for (const g of groups.values()) {
    out.push({
      [field]: g.key,
      count: g.count,
      success: g.success,
      failed: g.failed,
      successRate: g.count ? Math.round((g.success / g.count) * 1000) / 10 : 0,
      avgLatencyMs: Math.round(avg(g.latencies)),
      totalTokens: g.tokens,
    });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

export async function recentRecords(limit = 50) {
  const records = await readUsageLog(limit);
  return records.reverse();
}