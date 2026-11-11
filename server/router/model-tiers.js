// server/router/model-tiers.js
/**
 * Model Tier Classifier
 * از روی نام Provider و مدل، tier مناسب را تشخیص می‌دهد.
 * قابل override با فایل data/model-tiers.json (در صورت وجود).
 *
 * Tierها (از ارزان به گران):
 *   local → free → economic → premium → premium-max
 */

const TIER_ORDER = ["local", "free", "economic", "premium", "premium-max"];

// Providerهایی که رایگان در نظر گرفته می‌شوند (قابل ویرایش)
const FREE_PROVIDERS = new Set([
  "openrouter",   // مدل‌های :free
  "groq",         // سهمیه رایگان سخاوتمندانه
  "freebuff",
  "sambanova",    // سهمیه رایگان
  "cloudflare",   // workers ai
]);

// الگوهای نام مدل که نشان‌دهنده‌ی رایگان بودن هستند
const FREE_MODEL_PATTERNS = [
  /:free$/i,
  /-free$/i,
  /\bfree\b/i,
];

// الگوهای مدل‌های اقتصادی
const ECONOMIC_MODEL_PATTERNS = [
  /mini/i, /flash/i, /lite/i, /small/i, /haiku/i,
  /gpt-4o-mini/i, /gpt-4\.1-mini/i,
  /gemini.*flash/i, /claude.*haiku/i,
  /deepseek.*chat/i,
];

// الگوهای مدل‌های premium
const PREMIUM_MODEL_PATTERNS = [
  /gpt-4o(?!-mini)/i, /gpt-4\.1(?!-mini)/i, /gpt-5/i, /gpt-6/i,
  /o1(?!-mini)/i, /o3(?!-mini)/i, /o4/i,
  /claude.*(opus|sonnet)/i,
  /gemini.*pro(?!.*flash)/i,
  /deepseek.*(r1|reasoner)/i,
];

// الگوهای premium-max (مدل‌های سنگین‌وزن/تخصصی)
const PREMIUM_MAX_PATTERNS = [
  /o3-pro/i, /o1-pro/i, /gpt-5-turbo/i,
  /claude.*opus-4/i,
  /gemini.*ultra/i,
];

function matchesAny(str, patterns) {
  return patterns.some((p) => p.test(str));
}

/**
 * tier یک مدل را تشخیص می‌دهد.
 * @param {string} providerId
 * @param {string} modelId
 * @param {object} [overrides]  { "provider:model": "economic" } از data/model-tiers.json
 */
export function classifyModel(providerId, modelId, overrides = {}) {
  const key = `${providerId}:${modelId}`;
  if (overrides[key]) return overrides[key];

  const id = String(modelId || "");
  const prov = String(providerId || "").toLowerCase();

  // premium-max اول (بالاترین اولویت)
  if (matchesAny(id, PREMIUM_MAX_PATTERNS)) return "premium-max";
  if (matchesAny(id, PREMIUM_MODEL_PATTERNS)) return "premium";

  // economic
  if (matchesAny(id, ECONOMIC_MODEL_PATTERNS)) return "economic";

  // free (الگوی نام یا provider رایگان)
  if (matchesAny(id, FREE_MODEL_PATTERNS) || FREE_PROVIDERS.has(prov)) {
    return "free";
  }

  // default بر اساس provider:
  // AvalAI معمولاً اقتصادی/تجاری است؛ بقیه تجاری
  if (prov === "avalai") return "economic";
  return "premium";
}

/**
 * آیا یک tier حداقل به اندازه‌ی tier هدف هست؟
 */
export function tierAtLeast(actual, required) {
  return TIER_ORDER.indexOf(actual) >= TIER_ORDER.indexOf(required);
}

/**
 * tier بعدی (برای fallback).
 */
export function nextTier(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

export { TIER_ORDER };