// server/providers/adapters/openai-compatible.js
// آداپتر مشترک برای Providerهایی که با OpenAI API سازگارند.
// فقط Base URL و API Key لازم است؛ بقیه رفتار یکسان است.

export function createOpenAICompatibleAdapter(opts) {
  const {
    id,
    name,
    baseUrl,
    getApiKey,
    extraHeaders,
    chatPath = "/chat/completions",
    modelsPath = "/models",
  } = opts;

  if (!id || !name || !baseUrl || typeof getApiKey !== "function") {
    throw new Error("openai-compatible adapter: id, name, baseUrl and getApiKey are required.");
  }

  const cleanBase = () => String(baseUrl).replace(/\/+$/, "");

  return {
    id,
    name,
    baseUrl: cleanBase(),

    getApiKey,

    headers(apiKey) {
      const base = { Authorization: `Bearer ${apiKey}` };
      if (typeof extraHeaders === "function") {
        return { ...base, ...extraHeaders(apiKey) };
      }
      return base;
    },

    chatUrl: () => `${cleanBase()}${chatPath}`,
    modelsUrl: () => `${cleanBase()}${modelsPath}`,
  };
}