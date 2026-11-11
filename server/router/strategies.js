// server/router/strategies.js

import { getModelScore } from "./benchmarks.js";

export const VALID_STRATEGIES = [
  "manual", "auto-fast", "auto-quality", "auto-vision", "auto-cheap", "auto-balanced",
];

const QUALITY_TIERS = [
  { regex: /opus|gpt-5(\.|$)|gpt-6|o3\b|o4\b|-pro\b|sonnet-4\.5|sonnet-5/i, score: 100 },
  { regex: /sonnet|gpt-4o(?!-mini)|gpt-4\.1(?!-mini)|gemini-\d+.*-pro\b/i, score: 80 },
  { regex: /gpt-4(?!-mini)|gemini-\d+.*-flash(?!-lite)|mistral-large/i, score: 60 },
  { regex: /mini|haiku|flash-lite|lite|nano|small/i, score: 35 },
];

const COST_TIERS = [
  { regex: /:free\b/i, cost: 0 },
  { regex: /mini|haiku|flash|nano|lite|small/i, cost: 30 },
  { regex: /sonnet|gpt-4o(?!-mini)|gpt-4\.1|gemini.*pro/i, cost: 60 },
  { regex: /opus|gpt-5|gpt-6|o3|o4|-pro\b/i, cost: 100 },
];
const INTERNAL_ROUTER_PATTERNS = [
  /^openrouter\/free$/i,
  /^openrouter\/auto$/i,
  /^openrouter\/auto-beta$/i,
  /^openrouter\/auto-code$/i,
  /^openrouter\/fusion$/i,
  /^openrouter\/pareto-code$/i,
  /^openrouter\/bodybuilder$/i,
];

const COMPLEXITY_TARGETS = [
  { max: 20, target: 30 },
  { max: 40, target: 45 },
  { max: 65, target: 65 },
  { max: 85, target: 80 },
  { max: 100, target: 95 },
];

// Internal routers inside providers (not real models).
// These must be excluded — they hide the actual model and cause unpredictable token usage.


// Reasoning models: they consume hundreds of tokens for even "hello".
const REASONING_MODEL_PATTERNS = [
  /-reasoning\b/i, /-thinking\b/i, /-r1\b/i, /-r2\b/i,
  /\bo1(-|\b)/i, /\bo3(-|\b)/i, /\bo4(-|\b)/i,
  /\bdeepseek-r[12]/i,
  /nano-omni.*reasoning/i,
  /thinkingmachines\//i,
  /nemotron.*lightning/i,
  /nemotron.*nano.*reasoning/i,
  /xingchen/i,           // ← جدید: تجربه نشان داد reasoning دارد
  /xing4\.0/i,           // ← جدید
  /-reason/i,            // ← جدید
];

// Lightweight and fast models: ideal for simple prompts.
const LIGHTWEIGHT_MODEL_PATTERNS = [
  /flash/i, /mini/i, /nano/i, /lite/i, /small/i, /lightning/i, /tiny/i,
];
// ===== تشخیص پروژه‌های بزرگ (برای اولویت کیفیت در tier رایگان) =====
// وقتی پیام «یک سایت بساز» است، حتی اگر مدل رایگان باشد،
// باید مدل بزرگ‌تری انتخاب شود که بتواند فایل کامل تولید کند.
const PROJECT_GENERATION_INTENT = /(بساز|ایجاد کن|تولید کن|طراحی کن|بازنویسی|بنویس|پیاده‌سازی کن|کد بنویس|build|create|generate|implement|design|develop|write)/i;

const PROJECT_NOUNS = /(سایت|صفحه|پروژه|اپلیکیشن|برنامه|داشبورد|ماشین.?حساب|فرم|رابط|وبسایت|وب.?سایت|بازی|کامپوننت|قالب|website|web.?app|page|project|app|application|dashboard|calculator|form|component|landing|portfolio|game|ui|interface)/i;

// ===== تشخیص مدل‌های قوی به صورت کاملاً داینامیک =====
// بدون هیچ نام مدل یا Provider.
// فقط از داده‌های قابل اندازه‌گیری استفاده می‌کند:
//   ۱. contextLength (خود Provider اعلام می‌کند)
//   ۲. capabilities (Vision، ToolCalling — نشانگر مدل بزرگ)
//   ۳. در حالت نامشخص → خنثی

function isStrongModel(entry) {
  if (!entry) return false;

  const contextLength = Number(entry.contextLength) || 0;
  const caps = entry.capabilities || {};

  // ۱. contextLength — قوی‌ترین نشانگر
  //    مدل‌های بزرگ معمولاً context بزرگ دارند
  if (contextLength >= 32000) return true;
  if (contextLength > 0 && contextLength < 8192) return false;

  // ۲. Capabilities — نشانگر غیرمستقیم
  //    مدل‌های بزرگ معمولاً Vision + ToolCalling دارند
  const capScore =
    (caps.imageInput ? 1 : 0) +
    (caps.toolCalling ? 1 : 0) +
    (caps.audioInput ? 1 : 0);

  if (capScore >= 2) return true; // حداقل ۲ قابلیت پیشرفته
  if (capScore === 0 && !caps.streaming) return false; // مدل خیلی پایه

  // ۳. در حالت نامشخص → خنثی
  return false;
}

function isProjectGenerationRequest(text) {
  if (!text) return false;
  return PROJECT_GENERATION_INTENT.test(text) && PROJECT_NOUNS.test(text);
}


// ===== توابع کمکی برای qualityScore =====

function qualityScoreByPrice(entry) {
  // قیمت بر اساس دلار به ازای هر ۱ میلیون توکن خروجی
  const completionPrice = entry?.pricing?.completion;
  if (completionPrice == null) return null;
  const pricePerM = Number(completionPrice) * 1_000_000;
  if (pricePerM <= 0) return null; // رایگان: با قیمت نمی‌شود قضاوت کرد
  // log10: $0.01 → ~30, $0.1 → ~52, $1 → ~74, $10 → ~96
  return Math.min(100, Math.max(20, 20 + Math.log10(pricePerM + 1) * 24));
}

function qualityScoreByContext(entry) {
  const ctx = Number(entry?.contextLength) || 0;
  if (ctx <= 0) return null;
  if (ctx >= 1_000_000) return 85;
  if (ctx >= 200_000) return 75;
  if (ctx >= 128_000) return 65;
  if (ctx >= 32_000) return 50;
  if (ctx >= 8_000) return 35;
  return 25;
}

function qualityScoreByRegex(modelId) {
  const id = String(modelId || "").toLowerCase();
  for (const tier of QUALITY_TIERS) {
    if (tier.regex.test(id)) return tier.score;
  }
  return 50;
}

function costScoreByPrice(entry) {
  const completionPrice = entry?.pricing?.completion;
  if (completionPrice == null) return null;
  const pricePerM = Number(completionPrice) * 1_000_000;
  if (pricePerM === 0) return 0; // صریحاً رایگان
  if (pricePerM < 0) return null;
  return Math.min(100, Math.max(10, Math.log10(pricePerM + 1) * 25));
}

function costScoreByRegex(modelId) {
  const id = String(modelId || "").toLowerCase();
  for (const tier of COST_TIERS) {
    if (tier.regex.test(id)) return tier.cost;
  }
  return 50;
}
function qualityScore(entry) {
  // ۱. بالاترین اولویت: امتیاز از منابع بین‌المللی (Hormouz, RankLLMs, ...)
  if (typeof entry === 'object' && entry.provider && entry.modelId) {
    const benchmarkScore = getModelScore(entry.provider, entry.modelId);
    if (benchmarkScore != null) return benchmarkScore;
  }

  // ۲. اولویت دوم: امتیاز بر اساس قیمت
  if (typeof entry === 'object') {
    const byPrice = qualityScoreByPrice(entry);
    if (byPrice !== null) return byPrice;
  }

  // ۳. اولویت سوم: امتیاز بر اساس طول Context
  if (typeof entry === 'object') {
    const byContext = qualityScoreByContext(entry);
    if (byContext !== null) return byContext;
  }

  // ۴. آخرین راه‌حل: regexهای قدیمی
  const id = typeof entry === 'string' ? entry : entry.modelId;
  const lowerId = String(id || "").toLowerCase();
  for (const tier of QUALITY_TIERS) {
    if (tier.regex.test(lowerId)) return tier.score;
  }
  return 50;
}

function costScore(entry) {
  if (typeof entry === "object" && entry !== null) {
    const byPrice = costScoreByPrice(entry);
    if (byPrice !== null) return byPrice;
    return costScoreByRegex(entry.modelId);
  }
  return costScoreByRegex(entry);
}

function latencyScore(latencyMs) {
  if (!latencyMs || latencyMs <= 0) return 50;
  return Math.max(0, 100 - Math.min(100, latencyMs / 100));
}

function targetQualityFor(complexityScore) {
  if (complexityScore == null) return null;
  for (const t of COMPLEXITY_TARGETS) {
    if (complexityScore <= t.max) return t.target;
  }
  return 95;
}

function complexityAdjustment(quality, complexityScore, strategy, isProjectGeneration) {
  if (complexityScore == null) return 0;
  if (strategy === "auto-quality" || strategy === "auto-fast" || strategy === "auto-vision") {
    return 0;
  }
  // برای پروژه‌ها، کیفیت بالاتر همیشه بهتر است (جریمه نکن)
  if (isProjectGeneration) return 0;
  const target = targetQualityFor(complexityScore);
  if (target == null) return 0;
  const diff = quality - target;
  if (diff < -10) return diff * 3;
  if (diff > 20) return -(diff - 20) * 4;
  return 0;
}

// ===== تشخیص reasoning بر اساس رفتار واقعی مدل =====
// reasoningRatio از usage.completion_tokens_details.reasoning_tokens / completion_tokens محاسبه می‌شود.
// اگر ≥ 0.4 (۴۰٪ توکن‌ها) reasoning بود → مدل «reasoning-heavy» است.
// در غیر این صورت یا اگر داده‌ای نبود → فرض می‌کنیم reasoning نیست (بدون جریمه).
const REASONING_RATIO_THRESHOLD = 0.4;

function isReasoningModel(entry) {
  if (!entry || typeof entry !== "object") return false;
  const ratio = entry.reasoningRatio;
  if (typeof ratio !== "number" || !isFinite(ratio)) return false;
  return ratio >= REASONING_RATIO_THRESHOLD;
}

// ===== تشخیص مدل سبک بر اساس latency + reasoningRatio =====
// مدل سبک = سریع (< 2000ms) و بدون reasoning سنگین (< 15%)
// اگر داده کافی نبود → فرض می‌کنیم سبک نیست (بدون bonus)
const LIGHTWEIGHT_MAX_LATENCY_MS = 2000;
const LIGHTWEIGHT_MAX_REASONING_RATIO = 0.15;

function isLightweightModel(entry) {
  if (!entry || typeof entry !== "object") return false;
  const latency = Number(entry.latency) || 0;
  const ratio = entry.reasoningRatio;
  if (latency <= 0) return false;
  if (typeof ratio !== "number") return false;
  return latency < LIGHTWEIGHT_MAX_LATENCY_MS && ratio < LIGHTWEIGHT_MAX_REASONING_RATIO;
}

function suitabilityAdjustment(entry, complexityScore, strategy) {
  if (complexityScore == null) return 0;
  if (strategy === "auto-quality" || strategy === "auto-vision") return 0;

  const reasoning = isReasoningModel(entry);
  const lightweight = isLightweightModel(entry);
  let delta = 0;

  if (complexityScore <= 20) {
    if (reasoning) delta -= 60;
    if (lightweight) delta += 15;
  } else if (complexityScore <= 60) {
    if (reasoning) delta -= 20;
  }

  return delta;
}

export function scoreCandidate(entry, strategy, request, weights = {}) {
  const w = { quality: 0.4, cost: 0.3, latency: 0.3, ...weights };
  const q = qualityScore(entry);
  const c = costScore(entry);
  const l = latencyScore(entry.latency);
  const freeBonus = /:free\b/i.test(entry.modelId) ? 20 : 0;
  const cx = request?.complexity ?? null;
  const cxAdj = complexityAdjustment(q, cx, strategy, request?.isProjectGeneration === true);

  switch (strategy) {
    case "auto-fast":
      return 1000 + l * 10 - c * 0.1;
    case "auto-quality":
      return 1000 + q * 10 + l * 0.5 - c * 0.1;
               case "auto-cheap": {
      const suitAdj = suitabilityAdjustment(entry, cx, strategy);
      const strongBoost = request?.isProjectGeneration && isStrongModel(entry) ? 200 : 0;
      const weakPenalty = request?.isProjectGeneration && !isStrongModel(entry) ? -100 : 0;
      return 1000 - c * 10 + q * 0.5 + l * 0.3 + freeBonus + cxAdj + suitAdj + strongBoost + weakPenalty;
    }
    case "auto-vision":
      return 1000 + q * 0.6 + l * 0.4 - c * 0.3 + freeBonus;
    case "auto-balanced":
    default: {
      const suitAdj = suitabilityAdjustment(entry, cx, strategy);
      return 1000 + q * w.quality - c * w.cost + l * w.latency + freeBonus + cxAdj + suitAdj;
    }
  }
}
// ===== کف توانایی برای پروژه‌ها =====
// مدل باید حداقل یکی از این شرایط را داشته باشد:
// - contextLength >= 32000 (بتواند چند فایل را با هم پردازش کند)
// - toolCalling داشته باشد (نشانه‌ی مدل بزرگ و واقعی)
// - vision داشته باشد (نشانه‌ی مدل پیشرفته)
// و نباید nano/tiny/small/lite باشد
const PROJECT_MIN_CONTEXT = 32000;
const TINY_MODEL_NAMES = [/nano/i, /tiny/i, /\bsmall\b/i, /\blite\b/i];

function meetsCapabilityFloor(entry) {
  const contextLength = Number(entry?.contextLength) || 0;
  const hasToolCalling = entry?.capabilities?.toolCalling === true;
  const hasVision = entry?.capabilities?.imageInput === true;
  const id = String(entry?.modelId || "").toLowerCase();
  const isTiny = TINY_MODEL_NAMES.some((re) => re.test(id));

  // مدل‌های نانو/تینی هرگز برای پروژه مناسب نیستند
  if (isTiny) return false;

  // اگر context کافی دارد، قبول
  if (contextLength >= PROJECT_MIN_CONTEXT) return true;

  // اگر toolCalling یا vision دارد (نشانه مدل واقعی)، قبول
  if (hasToolCalling || hasVision) return true;

  // اگر context خیلی کوچک دارد (< 32000)، رد
  if (contextLength > 0 && contextLength < PROJECT_MIN_CONTEXT) return false;

  // اگر هیچ اطلاعاتی نداریم، محافظه‌کارانه قبول کن (تا fallback کار کند)
  return true;
}
export function rankCandidates(candidates, strategy, request, weights = {}) {
  const isProject = request?.isProjectGeneration === true;

  // ← جدید: اگر همه‌ی مدل‌ها ok:false هستند، احتمالاً مشکل شبکه است
  // به‌جای فیلتر کردن همه، اجازه بده امتحان شوند
  const anyHealthy = candidates.some((c) => c.ok === true);
  if (!anyHealthy && candidates.length > 0) {
    console.warn(`[Router] ⚠️ All ${candidates.length} models are ok:false — likely network issue. Trying them anyway.`);
  }

  // فیلتر پایه
  let filtered = candidates.filter((entry) => {
    // فقط اگر مدل سالم داریم، توسط ok فیلتر کن
    if (anyHealthy && !entry.ok) return false;
    const id = String(entry.modelId || "");
    if (INTERNAL_ROUTER_PATTERNS.some((re) => re.test(id))) return false;
    if (
  request.hasImage &&
  String(process.env.VISION_STRICT || "false").toLowerCase() === "true" &&
  !entry.capabilities?.imageInput
) {
  return false;
}
    return true;
  });

  // ← جدید: برای پروژه‌ها، کف توانایی را اعمال کن
  if (isProject) {
    const capable = filtered.filter(meetsCapabilityFloor);
    if (capable.length >= 1) {
      console.log(
        `[Capability Floor] Project mode: ${filtered.length} → ${capable.length} capable models`
      );
      filtered = capable;
    } else {
      // اگر هیچ مدلی از کف عبور نکرد، به همه برگرد (fallback)
      console.warn(
        `[Capability Floor] No model passed the floor — falling back to all ${filtered.length} models`
      );
    }
  }

 return filtered
  .map((entry) => {
    let score = scoreCandidate(entry, strategy, request, weights);
    // Vision soft bonus: مدل vision +150، بقیه -30 (حذف نمی‌شوند)
    if (request.hasImage === true) {
      const hasVision = entry.capabilities?.imageInput === true;
      score += hasVision ? 150 : -30;
    }
    return { entry, score };
  })
  .sort((a, b) => b.score - a.score)
  .map((x) => x.entry);
}
export function explainChoice(entry, strategy, request) {
  const q = qualityScore(entry);
  const c = costScore(entry);
  const free = /:free\b/i.test(entry.modelId) ? " (رایگان)" : "";
  const latency = entry.latency > 0 ? ` • ${entry.latency}ms` : "";
  const cx = request?.complexity ?? null;
  const cxLabel = cx != null ? ` • پیچیدگی ${cx}` : "";

  if (strategy === "auto-fast") return `سریع‌ترین${latency}`;
  if (strategy === "auto-quality") return `کیفیت ${q}/100${free}`;
  if (strategy === "auto-cheap") return `هزینه ${c}/100${free}${cxLabel}`;
  if (strategy === "auto-vision") return `Vision • کیفیت ${q}${free}`;
  return `متعادل • کیفیت ${q} • هزینه ${c}${free}${latency}${cxLabel}`;
}
export { isProjectGenerationRequest, isStrongModel };