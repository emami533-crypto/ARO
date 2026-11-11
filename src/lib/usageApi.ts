import { getAdminHeaders } from "./adminAuth";

// src/lib/usageApi.ts

const API_BASE = "/api/admin/usage";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", headers: getAdminHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export type UsageSummary = {
  windowHours: number;
  since: string;
  total: number;
  success: number;
  failed: number;
  aborted: number;
  partial: number;
  successRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalTokens: number;
  totalCost?: number;
  visionRequests: number;
  autoModeRequests: number;
  requestsWithFallback: number;
};

export type ModelStat = {
  model: string;
  count: number;
  success: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
};

export type TierStat = {
  complexityTier: string;
  count: number;
  success: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
};

export type UsageRecord = {
  id: string;
  timestamp: number;
  provider: string;
  model: string;
  status: string;
  strategy?: string | null;
  complexityScore?: number | null;
  complexityTier?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  reasoningTokens?: number | null;
  cost?: number | null;
  latencyMs: number;
  hasImage: boolean;
  autoMode: boolean;
  errorMessage?: string | null;
};

export async function getSummary(hours: number) {
  return fetchJson<{ summary: UsageSummary }>(`/summary?hours=${hours}`);
}

export async function getByModel(hours: number) {
  return fetchJson<{ models: ModelStat[] }>(`/by-model?hours=${hours}`);
}

export async function getByTier(hours: number) {
  return fetchJson<{ tiers: TierStat[] }>(`/by-tier?hours=${hours}`);
}

export async function getRecent(limit: number) {
  return fetchJson<{ records: UsageRecord[] }>(`/recent?limit=${limit}`);
}