const ADMIN_TOKEN_KEY = "aiPlayground.adminToken";

export function getAdminHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {});
  let token = "";
  try { token = sessionStorage.getItem(ADMIN_TOKEN_KEY) || ""; } catch { /* storage may be unavailable */ }
  if (!token) {
    token = window.prompt("توکن مدیریت (AI_ADMIN_TOKEN) را وارد کنید:")?.trim() || "";
    if (token) {
      try { sessionStorage.setItem(ADMIN_TOKEN_KEY, token); } catch { /* session-only fallback */ }
    }
  }
  if (token) headers.set("x-admin-token", token);
  return headers;
}

export function clearAdminToken(): void {
  try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* ignore */ }
}
