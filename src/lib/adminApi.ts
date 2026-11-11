import { getAdminHeaders } from "./adminAuth";

// src/lib/adminApi.ts

export type AdminProvider = {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  enabled: boolean;
  order: number;
  hasApiKey: boolean;
  apiKeyPreview: string;
  apiKeySource: "file" | "env" | "none";
  apiKeyEnvVars: string[];
};

export type AdminProvidersResponse = {
  success: boolean;
  providers: AdminProvider[];
  meta: { file: string; count: number; defaultProvider: string };
};

export type CreateProviderInput = {
  id: string;
  name: string;
  type?: string;
  baseUrl: string;
  apiKey?: string;
  apiKeyEnvVars?: string[];
  enabled?: boolean;
  order?: number;
};

export type TestResult = {
  success: boolean;
  latency: number;
  modelsCount?: number;
  error?: string;
};

async function jsonOrThrow(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const msg =
      data?.error ||
      (Array.isArray(data?.errors) ? data.errors.join(" • ") : null) ||
      `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return data;
}

// هر GET با پارامتر یکتا می‌رود تا هیچ cache‌ای (مرورگر، پروکسی، Vite) دخالت نکند.
function noCacheUrl(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}_t=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listProviders(): Promise<AdminProvidersResponse> {
  const res = await fetch(noCacheUrl("/api/admin/providers"), {
    cache: "no-store",
    headers: getAdminHeaders({ "Cache-Control": "no-cache", Pragma: "no-cache" }),
  });
  return jsonOrThrow(res);
}

export async function createProvider(input: CreateProviderInput): Promise<AdminProvider> {
  const res = await fetch("/api/admin/providers", {
    method: "POST",
    headers: getAdminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow(res);
  return data.provider;
}

export async function updateProvider(
  id: string,
  input: Partial<CreateProviderInput>
): Promise<AdminProvider> {
  const res = await fetch(`/api/admin/providers/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getAdminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow(res);
  return data.provider;
}

export async function deleteProvider(id: string): Promise<void> {
  const res = await fetch(`/api/admin/providers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getAdminHeaders(),
  });
  await jsonOrThrow(res);
}

export async function testProvider(id: string): Promise<TestResult> {
  const res = await fetch(`/api/admin/providers/${encodeURIComponent(id)}/test`, {
    method: "POST",
    cache: "no-store",
    headers: getAdminHeaders(),
  });
  return res.json().catch(() => ({ success: false, latency: 0, error: "پاسخ نامعتبر" }));
}