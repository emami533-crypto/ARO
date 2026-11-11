// src/lib/tokens.ts
// تخمین توکن‌ها بدون نیاز به tokenizer (تقریب کافی برای UI)

/**
 * تخمین تعداد توکن بر اساس ترکیب فارسی/انگلیسی.
 * فارسی: ~۲ کاراکتر/توکن • انگلیسی: ~۴ کاراکتر/توکن • سایر: ~۳
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let persianCount = 0;
  let latinCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x0600 && code <= 0x06ff) persianCount++;
    else if (code >= 0x20 && code <= 0x7e) latinCount++;
  }
  const otherCount = text.length - persianCount - latinCount;
  return Math.ceil(persianCount / 2 + latinCount / 4 + otherCount / 3);
}

type MessageLike = {
  text?: string;
  attachments?: Array<{ type?: string }>;
};

/**
 * تخمین توکن برای مجموعه پیام‌ها (با در نظر گرفتن attachmentها).
 * هر پیام ۴ توکن اضافه برای role marker.
 */
export function estimateMessagesTokens(messages: MessageLike[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.text || "") + 4;
    if (msg.attachments) {
      for (const att of msg.attachments) {
        if (att.type?.startsWith("image/")) total += 1000;
        else total += 500;
      }
    }
  }
  return total;
}

/**
 * تخمین توکن فایل‌های پروژه. فایل‌های باینری نادیده گرفته می‌شوند.
 */
export function estimateWorkspaceTokens(files: Record<string, string>): number {
  let total = 0;
  for (const [path, content] of Object.entries(files)) {
    if (content.startsWith("data:")) continue;
    total += estimateTokens(`\n--- FILE: ${path} ---\n${content}\n`);
  }
  return total;
}

/**
 * تخمین کل توکن ورودی برای یک درخواست چت.
 */
export function estimateTotalInputTokens(opts: {
  prompt: string;
  attachments: Array<{ type?: string }>;
  messages: MessageLike[];
  files: Record<string, string>;
  systemPromptOverhead?: number;
}): number {
  const promptTokens = estimateTokens(opts.prompt);
  const attachTokens = estimateMessagesTokens([{ text: "", attachments: opts.attachments }]);
  const historyTokens = estimateMessagesTokens(opts.messages);
  const workspaceTokens = estimateWorkspaceTokens(opts.files);
  const systemTokens = opts.systemPromptOverhead ?? 500;
  return promptTokens + attachTokens + historyTokens + workspaceTokens + systemTokens;
}

/**
 * درصد استفاده از context window (0 تا 1).
 */
export function usagePercent(estimated: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(1, estimated / limit);
}