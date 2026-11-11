// server/router/benchmarks.js
const CACHE_TTL = 6 * 60 * 60 * 1000; // کش ۶ ساعته
let benchmarkCache = new Map();
let lastFetchTime = 0;

// تعریف منابع به ترتیب اولویت
const BENCHMARK_SOURCES = [
 {
  name: "RankLLMs",
  fetch: async () => {
    const res = await fetch("https://api.rankllms.com/api/v1/leaderboard");
    if (!res.ok) throw new Error(`RankLLMs HTTP ${res.status}`);
    const payload = await res.json();
    // پاسخ ممکن است { data: [...] } یا مستقیماً [...] باشد
    const list = Array.isArray(payload) 
      ? payload 
      : (Array.isArray(payload?.data) ? payload.data : []);
    return list
      .filter(m => m && (m.model_slug || m.id))
      .map(m => ({
        id: m.model_slug || m.id,
        score: m.overall_score ?? m.score ?? null,
      }))
      .filter(m => m.score != null);
  },
},
  {
    name: "Hormouz",
    fetch: async (apiKey) => {
      if (!apiKey) throw new Error("Hormouz API key missing");
      // فرض بر این است که Hormouz در پاسخ خود امتیازات را برمی‌گرداند
      const res = await fetch("https://api.hormouz.net/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Hormouz HTTP ${res.status}`);
      const data = await res.json();
      return data.data.map(m => ({
        id: `${m.vendor}/${m.id}`,
        score: m.benchmarks?.intelligence || 50, // نمره پیش‌فرض اگر موجود نبود
      }));
    },
  },
  {
    name: "MRMP Bench",
    fetch: async () => {
      // MRMP Bench API عمومی ندارد، اما می‌توان از داده‌های استاتیک استفاده کرد
      // این بخش باید با داده‌های واقعی از وب‌سایت MRMP پر شود
      return []; 
    },
  },
];

export async function refreshBenchmarks(hormouzApiKey) {
  if (Date.now() - lastFetchTime < CACHE_TTL && benchmarkCache.size > 0) return;

  const newCache = new Map();

  // به ترتیب منابع را امتحان کن
  for (const source of BENCHMARK_SOURCES) {
    try {
      const results = await source.fetch(hormouzApiKey);
      for (const item of results) {
        if (!newCache.has(item.id)) {
          newCache.set(item.id, { score: item.score, source: source.name });
        }
      }
      console.log(`[Benchmarks] Loaded ${results.length} scores from ${source.name}`);
      // اگر حداقل یک منبع موفق شد، می‌توانیم ادامه دهیم
      if (newCache.size > 0) break; 
    } catch (error) {
      console.warn(`[Benchmarks] Failed to fetch from ${source.name}:`, error.message);
      // به سراغ منبع بعدی برو
    }
  }

  if (newCache.size > 0) {
    benchmarkCache = newCache;
    lastFetchTime = Date.now();
    console.log(`[Benchmarks] Total ${benchmarkCache.size} model scores cached.`);
  } else {
    console.warn("[Benchmarks] All sources failed. Using fallback scoring.");
  }
}

export function getModelScore(provider, modelId) {
  // چند فرمت ممکن را امتحان کن
  const candidates = [
    `${provider}/${modelId}`,     // e.g., hormouz/nvidia/nemotron:free
    modelId,                       // e.g., nvidia/nemotron:free (Hormouz)
    String(modelId).toLowerCase(), // lowercase
  ];
  let cached = null;
  for (const key of candidates) {
    if (benchmarkCache.has(key)) {
      cached = benchmarkCache.get(key);
      break;
    }
  }
  if (!cached) return null;

  if (cached.score != null) return cached.score;
  if (cached.intelligenceIndex != null) return cached.intelligenceIndex;
  if (cached.designElo != null) return Math.min(100, Math.max(0, (cached.designElo - 800) / 8));
  return null;
}