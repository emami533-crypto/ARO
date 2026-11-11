// server/router/complexity.js
/**
 * Complexity Analyzer — scores request complexity from 0 to 100.
 * Pure function. Two languages (Persian + English).
 * Returns score, tier, breakdown, and detected signals.
 */

const DEFAULT_WEIGHTS = {
  reasoning: 0.25,
  coding: 0.20,
  accuracy: 0.20,
  contextVolume: 0.15,
  tools: 0.10,
  errorSensitivity: 0.10,
};

// ===== تشخیص قصد تولید پروژه =====
// وقتی کاربر می‌گوید «یک X بساز»، complexity ورودی کم است ولی خروجی سنگین.
// این توابع، این ناهماهنگی را جبران می‌کنند.
const PROJECT_ACTION_VERBS = [
  // فارسی
  "بساز", "بسازید", "ایجاد کن", "ایجاد کنید", "تولید کن", "تولید کنید",
  "طراحی کن", "طراحی کنید", "بنویس", "بنویسید", "کد بنویس", "کد بنویسید",
  "پیاده‌سازی کن", "پیاده‌سازی کنید", "بازنویسی کن", "اصلاح کن", "تغییر بده",
  "اضافه کن", "درست کن", "درست کنید", "بسازیم",
  // انگلیسی
  "build", "create", "make", "generate", "design", "implement", "write",
  "code", "develop", "construct", "redesign", "modify", "add", "fix",
];

const PROJECT_NOUNS = [
  // فارسی
  "سایت", "صفحه", "کد", "پروژه", "اپلیکیشن", "برنامه", "داشبورد",
  "ماشین حساب", "فرم", "رابط کاربری", "رابط", "وبسایت", "وب سایت",
  "بازی", "کامپوننت", "قالب", "تم", "پنل", "سیستم",
  // انگلیسی
  "website", "web app", "webpage", "page", "code", "project", "app",
  "application", "dashboard", "calculator", "form", "component", "game",
  "ui", "interface", "landing", "portfolio", "blog", "shop", "store",
  "chat", "todo", "login", "signup", "admin", "panel", "template",
];

function hasProjectGenerationIntent(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const hasVerb = PROJECT_ACTION_VERBS.some((v) => lower.includes(v));
  const hasNoun = PROJECT_NOUNS.some((n) => lower.includes(n));
  return hasVerb && hasNoun;
}

function projectGenerationBoost(text) {
  if (!hasProjectGenerationIntent(text)) return 0;
  
  let boost = 30; // پایه: هر تولید پروژه حداقل +۳۰
  const lower = text.toLowerCase();
  
  // پروژه‌های پیچیده‌تر
  if (/بازی|game|داشبورد|dashboard|چند.?صفحه|multi.?page|فروشگاه|shop|store|admin|پنل/.test(lower)) {
    boost += 15;
  }
  
  // چند ویژگی (با ویرگول یا "و" یا "and")
  const featureCount = (text.match(/[،,]| and | و /g) || []).length;
  if (featureCount >= 3) boost += 10;
  if (featureCount >= 6) boost += 10;
  
  // نشانگرهای کیفیت
  if (/کامل|حرفه.?ای|complete|full|professional|advanced|complex|پیچیده/.test(lower)) {
    boost += 10;
  }
  
  return boost;
}

const KEYWORDS = {
  reasoning: {
    strong: [
      "analyze", "analyse", "compare", "evaluate", "prove", "deduce", "infer",
      "reason", "why does", "explain why", "trade-off", "tradeoff", "implications",
      "strategy", "strategic", "architecture", "design pattern", "root cause",
      "تحلیل", "مقایسه", "ارزیابی", "استدلال", "اثبات", "چرا", "دلیل",
      "نتیجه‌گیری", "راهبرد", "استراتژی", "معماری", "طراحی سیستم",
      "ریشه‌یابی", "پیامد", "مصالحه", "تعادل بین",
    ],
    weak: [
      "explain", "describe", "summarize", "summarise", "overview",
      "توضیح", "شرح", "خلاصه", "مرور",
    ],
  },
  coding: {
    strong: [
      "implement", "refactor", "debug", "fix the bug", "unit test",
      "algorithm", "complexity", "optimize performance", "migration",
      "database schema", "api design", "async", "race condition", "memory leak",
      "کد بنویس", "پیاده‌سازی", "ریفکتور", "دیباگ", "رفع باگ", "تست واحد",
      "الگوریتم", "بهینه‌سازی", "مهاجرت", "طراحی دیتابیس", "طراحی api",
      "شرط مسابقه", "نشتی حافظه", "همگام‌سازی",
      "design system", "system design", "payment system", "payment flow",
      "microservice", "monolith", "distributed system", "event-driven",
      "طراحی سیستم", "طراحی معماری", "معماری نرم‌افزار", "سیستم توزیع‌شده",
      "طراحی پایگاه داده", "طراحی رابط برنامه", "تراکنش پایگاه داده",
    ],
    weak: [
      "code", "function", "class", "component", "html", "css", "javascript",
      "typescript", "python", "react", "node",
      "کد", "تابع", "کلاس", "کامپوننت", "برنامه",
    ],
  },
  accuracy: {
    strong: [
      "medical", "legal", "financial", "tax", "contract", "diagnosis",
      "compliance", "gdpr", "hipaa", "clinical", "dosage", "surgery",
      "پزشکی", "حقوقی", "مالی", "مالیاتی", "قرارداد", "تشخیص",
      "انطباق", "بالینی", "دوز دارو", "جراحی", "قانون",
      "payment", "transaction", "settlement", "pci", "pci-dss", "sox",
      "پرداخت", "تراکنش", "تسویه", "استاندارد امنیتی", "حسابرسی",
    ],
    weak: [
      "precise", "exact", "accurate", "fact-check", "verify",
      "دقیق", "صحت", "راستی‌آزمایی", "بررسی صحت",
    ],
  },
  tools: {
    strong: [
      "search the web", "browse", "fetch data", "call api", "query database",
      "run code", "execute", "tool call", "function call",
      "جستجوی وب", "مرور وب", "دریافت داده", "فراخوانی api", "کوئری دیتابیس",
      "اجرای کد", "ابزار", "فراخوانی تابع",
    ],
    weak: [
      "calculate", "compute", "convert", "format",
      "محاسبه", "تبدیل", "قالب‌بندی",
    ],
  },
  errorSensitivity: {
    strong: [
      "production", "deploy", "critical", "mission-critical", "security",
      "authentication", "authorization", "encryption", "sql injection",
      "xss", "csrf", "password", "secret", "api key",
      "مهم", "حیاتی", "امنیتی", "احراز هویت", "مجوز", "رمزنگاری",
      "تزریق sql", "کلید api", "رمز عبور", "محرمانه",
    ],
    weak: [
      "important", "careful", "double-check",
      "مهم است", "دقت کن", "دوباره بررسی",
    ],
  },
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(text, list) {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of list) {
    if (kw.includes(" ")) {
      if (lower.includes(kw)) count++;
    } else {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(kw)}([^\\p{L}\\p{N}]|$)`, "u");
      if (re.test(lower)) count++;
    }
  }
  return count;
}

function totalMessageChars(messages) {
  if (!Array.isArray(messages)) return 0;
  let n = 0;
  for (const m of messages) {
    if (typeof m?.content === "string") n += m.content.length;
    else if (Array.isArray(m?.content)) {
      for (const part of m.content) {
        if (part?.type === "text" && typeof part.text === "string") n += part.text.length;
        else if (part?.type === "image_url") n += 2000;
      }
    }
  }
  return n;
}

function countMessages(messages) {
  return Array.isArray(messages) ? messages.length : 0;
}

function hasImageAttachments(messages) {
  if (!Array.isArray(messages)) return false;
  for (const m of messages) {
    if (!Array.isArray(m?.content)) continue;
    for (const part of m.content) {
      if (part?.type === "image_url") return true;
    }
  }
  return false;
}

function scoreDimension(keywordHits, weightStrong = 30, weightWeak = 10, cap = 100) {
  const raw = keywordHits.strong * weightStrong + keywordHits.weak * weightWeak;
  return Math.min(cap, raw);
}

function scoreContextVolume(chars, messageCount) {
  let sizeScore = 0;
  if (chars <= 500) sizeScore = 5;
  else if (chars <= 2000) sizeScore = 10 + ((chars - 500) / 1500) * 20;
  else if (chars <= 8000) sizeScore = 30 + ((chars - 2000) / 6000) * 30;
  else if (chars <= 30000) sizeScore = 60 + ((chars - 8000) / 22000) * 25;
  else sizeScore = Math.min(100, 85 + ((chars - 30000) / 70000) * 15);

  const depthBonus = Math.min(20, Math.max(0, (messageCount - 2) * 2));
  return Math.min(100, sizeScore + depthBonus * 0.5);
}

export function scoreToTier(score) {
  if (score <= 20) return "local";
  if (score <= 40) return "free";
  if (score <= 65) return "economic";
  if (score <= 85) return "premium";
  return "premium-max";
}

export function analyzeComplexity(messages, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const lastUserText =
    options.lastUserText ??
    (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === "user") {
          if (typeof messages[i].content === "string") return messages[i].content;
          if (Array.isArray(messages[i].content)) {
            return messages[i].content
              .map((p) => (p?.type === "text" ? p.text : ""))
              .join(" ");
          }
        }
      }
      return "";
    })();

  const chars = totalMessageChars(messages);
  const messageCount = countMessages(messages);
  const hasImages = options.includeImages ?? hasImageAttachments(messages);

  const hits = {
    reasoning: {
      strong: countMatches(lastUserText, KEYWORDS.reasoning.strong),
      weak: countMatches(lastUserText, KEYWORDS.reasoning.weak),
    },
    coding: {
      strong: countMatches(lastUserText, KEYWORDS.coding.strong),
      weak: countMatches(lastUserText, KEYWORDS.coding.weak),
    },
    accuracy: {
      strong: countMatches(lastUserText, KEYWORDS.accuracy.strong),
      weak: countMatches(lastUserText, KEYWORDS.accuracy.weak),
    },
    tools: {
      strong: countMatches(lastUserText, KEYWORDS.tools.strong),
      weak: countMatches(lastUserText, KEYWORDS.tools.weak),
    },
    errorSensitivity: {
      strong: countMatches(lastUserText, KEYWORDS.errorSensitivity.strong),
      weak: countMatches(lastUserText, KEYWORDS.errorSensitivity.weak),
    },
  };

  const reasoningScore = scoreDimension(hits.reasoning, 30, 10);
  const codingScore = scoreDimension(hits.coding, 30, 10);
  const accuracyScore = scoreDimension(hits.accuracy, 35, 12);
  const toolsScore = scoreDimension(hits.tools, 30, 8);
  const errorScore = scoreDimension(hits.errorSensitivity, 35, 12);
  const contextScore = scoreContextVolume(chars, messageCount);

  let finalScore =
    reasoningScore * weights.reasoning +
    codingScore * weights.coding +
    accuracyScore * weights.accuracy +
    contextScore * weights.contextVolume +
    toolsScore * weights.tools +
    errorScore * weights.errorSensitivity;

  if (hasImages) finalScore = Math.min(100, finalScore + 10);

  // Multi-signal amplifier: if 3+ strong signals from different categories, real
  // complexity is nonlinear compared to plain summation.
  const strongSignalCount =
    (hits.reasoning.strong > 0 ? 1 : 0) +
    (hits.coding.strong > 0 ? 1 : 0) +
    (hits.accuracy.strong > 0 ? 1 : 0) +
    (hits.tools.strong > 0 ? 1 : 0) +
    (hits.errorSensitivity.strong > 0 ? 1 : 0);

  if (strongSignalCount >= 3) {
    const amplifier = (strongSignalCount - 2) * 8;
    finalScore = Math.min(100, finalScore + amplifier);
  }

     // ---- تشخیص قصد تولید پروژه ----
  const genIntent = hasProjectGenerationIntent(lastUserText);

  // ---- boost برای پیام‌های بسیار کوتاه و ساده (سلام/تشکر) ----
  // (اگر قصد تولید پروژه وجود دارد، این cap را اعمال نکن)
  if (!genIntent) {
    const simpleGreeting = /^\s*(سلام|درود|hi|hello|hey|thanks|مرسی|ممنون|خوبی|چطوری)/i.test(lastUserText);
    if (simpleGreeting && lastUserText.length < 40) {
      finalScore = Math.min(finalScore, 8);
    }
  }

  // ---- boost برای قصد تولید پروژه ----
  // چون خروجی ممکن است هزاران توکن باشد، complexity واقعی بالا می‌رود
  if (genIntent) {
    finalScore = Math.min(100, finalScore + projectGenerationBoost(lastUserText));
  }

  finalScore = Math.round(Math.max(0, Math.min(100, finalScore)));
  return {
    score: finalScore,
    tier: scoreToTier(finalScore),
    breakdown: {
      reasoning: Math.round(reasoningScore),
      coding: Math.round(codingScore),
      accuracy: Math.round(accuracyScore),
      contextVolume: Math.round(contextScore),
      tools: Math.round(toolsScore),
      errorSensitivity: Math.round(errorScore),
    },
    signals: {
      reasoning: extractSignals(lastUserText, KEYWORDS.reasoning),
      coding: extractSignals(lastUserText, KEYWORDS.coding),
      accuracy: extractSignals(lastUserText, KEYWORDS.accuracy),
      tools: extractSignals(lastUserText, KEYWORDS.tools),
      errorSensitivity: extractSignals(lastUserText, KEYWORDS.errorSensitivity),
    },
    meta: { chars, messageCount, hasImages },
  };
}

function extractSignals(text, keywordSet) {
  const found = new Set();
  const lower = text.toLowerCase();
  for (const kw of [...keywordSet.strong, ...keywordSet.weak]) {
    if (lower.includes(kw)) found.add(kw);
    if (found.size >= 8) break;
  }
  return [...found];
}

export { DEFAULT_WEIGHTS, KEYWORDS };