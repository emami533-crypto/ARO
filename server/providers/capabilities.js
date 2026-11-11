// server/providers/capabilities.js
// تشخیص قابلیت مدل‌ها با کلیدواژه‌های بهبودیافته.
// ساختار خروجی با یک استاندارد واحد و قابل override دستی.

const VISION_KEYWORDS = [
  // OpenAI
  "gpt-4", "gpt-4o", "gpt-4.1", "gpt-5", "gpt-6",
  "o3", "o4",
  // Anthropic — کل خانواده
  "claude",
  // Google
  "gemini",
  // Meta
  "llama-3.2", "llama-4",
  // Mistral
  "pixtral",
  // Open source
  "llava", "qwen-vl", "qwen2-vl", "qwen2.5-vl", "qwen3-vl",
  "deepseek-vl", "internvl", "cogvlm", "molmo",
  // عمومی
  "vision", "omni", "multimodal",
];

const TOOL_KEYWORDS = [
  "gpt-4", "gpt-4o", "gpt-4.1", "gpt-5", "gpt-6",
  "o3", "o4",
  "claude", "gemini",
  "mistral-large", "qwen",
];

const AUDIO_INPUT_KEYWORDS = [
  "whisper", "audio", "omni", "realtime", "transcribe", "speech",
];

const AUDIO_OUTPUT_KEYWORDS = [
  "tts", "speech", "audio-preview",
];

const IMAGE_OUTPUT_KEYWORDS = [
  "dall-e", "flux", "stable-diffusion", "sdxl",
  "gpt-image", "image-generation", "imagen",
  "gemini-3-pro-image", "gemini-3.1-flash-image",
  "gemini-2.5-flash-image", "gemini-3.1-flash-lite-image",
];

const EMBEDDING_KEYWORDS = ["embedding", "ada-002"];

const CAPABILITY_OVERRIDES = {
  // برای موارد نادر:
  // "providerId:modelId": { imageInput: true, toolCalling: true },
};

function matchesAny(id, keywords) {
  return keywords.some((k) => id.includes(k));
}

export function detectCapabilities(modelId, overrides = {}) {
  const id = String(modelId || "").toLowerCase();

  const isEmbedding = matchesAny(id, EMBEDDING_KEYWORDS);
  const isImageGen = matchesAny(id, IMAGE_OUTPUT_KEYWORDS);
  const isTranscribe = id.includes("transcribe");
  const isSpecializedAudio = isTranscribe || id.includes("-tts") || id.includes("search-api");
  const isAudioOut = matchesAny(id, AUDIO_OUTPUT_KEYWORDS);

  return {
    textInput: overrides.textInput ?? true,
    textOutput: overrides.textOutput ?? !isEmbedding,
    imageInput:
  overrides.imageInput ??
  (matchesAny(id, VISION_KEYWORDS) && !isEmbedding && !isSpecializedAudio),
    imageOutput: overrides.imageOutput ?? isImageGen,
    videoInput: overrides.videoInput ?? false,
    audioInput:
      overrides.audioInput ??
      (matchesAny(id, AUDIO_INPUT_KEYWORDS) || isTranscribe),
    audioOutput: overrides.audioOutput ?? isAudioOut,
    toolCalling:
      overrides.toolCalling ??
      (matchesAny(id, TOOL_KEYWORDS) &&
        !isEmbedding &&
        !isImageGen &&
        !isAudioOut &&
        !isTranscribe),
    streaming: overrides.streaming ?? !isEmbedding,
  };
}

export function getModelCapabilities(providerId, modelId) {
  const key = `${String(providerId || "").toLowerCase()}:${String(modelId || "")}`;
  const overrides = CAPABILITY_OVERRIDES[key] || {};
  return detectCapabilities(modelId, overrides);
}