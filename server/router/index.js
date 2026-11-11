// server/router/index.js
import { rankCandidates, explainChoice, VALID_STRATEGIES, isProjectGenerationRequest } from "./strategies.js";
import { readRouterConfig } from "./config.js";
import { analyzeComplexity } from "./complexity.js";

export async function resolveStrategy({ body, config }) {
  const cfg = config || (await readRouterConfig());
  const requested = String(body?.strategy || "").toLowerCase();

  if (VALID_STRATEGIES.includes(requested) && requested !== "manual") {
    return { strategy: requested, config: cfg };
  }
  if (body?.autoMode === true) {
    return { strategy: cfg.defaultStrategy || "auto-balanced", config: cfg };
  }
  return { strategy: "manual", config: cfg };
}

export async function planAttempts({
  strategy,
  config,
  primaryProvider,
  primaryModel,
  healthCache,
  hasImage,
  messages,
}) {
  const primary = (primaryProvider && primaryModel)
    ? { provider: primaryProvider, model: primaryModel, latency: 0 }
    : null;

  if (strategy === "manual") {
    if (!primary) {
      return { strategy, planned: [], rationale: "حالت manual نیاز به provider و model دارد.", complexity: null };
    }
    return { strategy, planned: [primary], rationale: "انتخاب دستی کاربر", complexity: null };
  }

  // ─── تحلیل پیچیدگی ───
  let complexity = null;
  if (messages && Array.isArray(messages) && (strategy === "auto-balanced" || strategy === "auto-cheap")) {
    try {
      complexity = analyzeComplexity(messages, { includeImages: hasImage });
    } catch (err) {
      console.warn("[router] complexity analysis failed:", err.message);
    }
  }

  // ─── ساخت candidates از healthCache ───
    const candidates = Object.values(healthCache.models).map((m) => ({
    provider: m.provider,
    model: m.modelId,
    modelId: m.modelId,
    latency: m.latency || 0,
    ok: m.ok !== false,
    capabilities: m.capabilities,
    contextLength: m.contextLength || 0,
    reasoningRatio: m.reasoningRatio,  // ← جدید
  }));

  // ─── تشخیص پروژه ───
  const lastUserMessage = Array.isArray(messages)
    ? [...messages].reverse().find((m) => m.role === "user")?.content
    : "";
  const lastUserText = typeof lastUserMessage === "string"
    ? lastUserMessage
    : Array.isArray(lastUserMessage)
      ? lastUserMessage.filter((p) => p?.type === "text").map((p) => p.text).join(" ")
      : "";
  const isProjectGeneration = isProjectGenerationRequest(lastUserText);

  console.log(`[Router Debug] candidates=${candidates.length}, healthy=${candidates.filter(c => c.ok).length}, isProject=${isProjectGeneration}`);

  // ─── رتبه‌بندی ───
  const ranked = rankCandidates(
    candidates,
    strategy,
    { hasImage, complexity: complexity?.score ?? null, isProjectGeneration },
    config.weights || {}
  );

  console.log(`[Router Debug] ranked=${ranked.length}`);

  const max = Math.max(1, Math.min(10, config.maxAttempts || 5));
  const planned = [];
  const seen = new Set();
  const providersInPlan = new Set();

  // پاس ۱: حداقل یک مدل از هر Provider
  for (const r of ranked) {
    if (planned.length >= max) break;
    if (providersInPlan.size >= 3) break;
    const key = `${r.provider}:${r.modelId}`;
    if (seen.has(key)) continue;
    if (providersInPlan.has(r.provider)) continue;

    planned.push({
      provider: r.provider,
      model: r.modelId,
      latency: r.latency,
      reason: "provider diversity",
    });
    seen.add(key);
    providersInPlan.add(r.provider);
  }

  // پاس ۲: پر کردن بقیه
  for (const r of ranked) {
    if (planned.length >= max) break;
    const key = `${r.provider}:${r.modelId}`;
    if (seen.has(key)) continue;
    planned.push({
      provider: r.provider,
      model: r.modelId,
      latency: r.latency,
      reason: "fill",
    });
    seen.add(key);
  }

  // ─── تضمین مدل‌های رایگان برای auto-cheap ───
  if (strategy === "auto-cheap" || (isProjectGeneration && strategy === "auto-balanced")) {
    const freeInPlan = planned.filter((p) => /:free\b/i.test(p.model)).length;
    const needed = Math.max(0, 2 - freeInPlan);
    if (needed > 0) {
      const allFree = Object.values(healthCache.models)
        .filter((m) => /:free\b/i.test(m.modelId || "") && m.ok !== false)
        .filter((m) => !planned.some((p) => p.provider === m.provider && p.model === m.modelId))
        .sort((a, b) => {
          const score = (m) =>
            (m.capabilities?.toolCalling ? 200 : 0) +
            (m.capabilities?.imageInput ? 100 : 0) +
            (Number(m.contextLength) || 0) / 500;
          return score(b) - score(a);
        })
        .slice(0, needed);

      for (const fm of allFree) {
        planned.push({
          provider: fm.provider,
          model: fm.modelId,
          latency: fm.latency || 0,
          reason: "تضمین رایگان",
        });
      }
      if (allFree.length > 0) {
        console.log(`[Router] Added ${allFree.length} free models as guaranteed fallback`);
      }
    }
  }

  // ─── اگر planned خالی است ───
  if (planned.length === 0) {
    if (primary) {
      return { strategy, planned: [primary], rationale: "استفاده از primary", complexity };
    }
    if (ranked.length > 0) {
      const top = ranked[0];
      console.log(`[Router Emergency] Using top-ranked: ${top.provider}:${top.modelId}`);
      return {
        strategy,
        planned: [{ provider: top.provider, model: top.modelId, latency: top.latency || 0, reason: "emergency" }],
        rationale: "emergency fallback",
        complexity,
      };
    }
    // ← اگر هیچ مدلی نیست، برگردان با پیام واضح (نه throw)
    return {
      strategy,
      planned: [],
      rationale: "healthCache خالی است",
      complexity,
    };
  }

    console.log(`[Router Return] strategy=${strategy}, planned.length=${planned.length}, planned[0]=${planned[0] ? `${planned[0].provider}:${planned[0].model}` : 'EMPTY'}`);
  const result = {
    strategy,
    planned,
    rationale: `Planned ${planned.length} models`,
    complexity,
  };
  console.log(`[Router Return] result.planned.length=${result.planned.length}, result keys: ${Object.keys(result).join(',')}`);
  return result;
}