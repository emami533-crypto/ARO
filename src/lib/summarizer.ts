// src/lib/summarizer.ts
import type { ChatMessage } from "../types";

export type SummaryResult = {
  text: string;
  messageCount: number;
  uptoMessageId: number;
};

type SummarizeOptions = {
  provider: string;
  model: string;
  autoMode?: boolean;
};

/**
 * خلاصه‌سازی پیام‌های قدیمی با استفاده از مدل.
 * پیام‌های ارسالی به این تابع باید از قبل فیلتر شده باشند.
 */
export async function generateSummary(
  messages: ChatMessage[],
  opts: SummarizeOptions,
  signal?: AbortSignal
): Promise<SummaryResult> {
  if (messages.length < 2) {
    throw new Error("برای خلاصه‌سازی حداقل ۲ پیام لازم است.");
  }

  const payload = {
    provider: opts.provider,
    model: opts.model,
    autoMode: opts.autoMode === true,
    messages: messages.map((m) => ({
      role: m.role,
      content: (m.text || "").slice(0, 4000),
    })),
  };

  const response = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || `خلاصه‌سازی ناموفق بود (${response.status})`);
  }

  const data = await response.json();
  if (!data?.success || !data?.summary) {
    throw new Error(data?.error || "پاسخ خلاصه‌سازی نامعتبر بود.");
  }

  const lastMessageId = messages[messages.length - 1]?.id ?? 0;

  return {
    text: data.summary,
    messageCount: messages.length,
    uptoMessageId: lastMessageId,
  };
}