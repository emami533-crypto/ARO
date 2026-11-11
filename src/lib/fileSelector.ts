// src/lib/fileSelector.ts
import { estimateTokens } from "./tokens";

export type SelectorInput = {
  files: Record<string, string>;
  activeFile: string;
  userPrompt: string;
  contextBudget: number; // به توکن
  maxOutputReserve?: number;
};

export type SelectorOutput = {
  included: Array<{ path: string; content: string; reason: string; tokens: number }>;
  skipped: Array<{ path: string; reason: string; size: number }>;
  totalTokens: number;
  budget: number;
};



function mentionsFile(prompt: string, path: string): boolean {
  if (!prompt) return false;
  const lower = prompt.toLowerCase();
  const fileName = path.split("/").pop() || path;
  const pathLower = path.toLowerCase();
  const fileNameLower = fileName.toLowerCase();
  // نام کامل فایل
  if (lower.includes(fileNameLower)) return true;
  // مسیر کامل
  if (lower.includes(pathLower)) return true;
  // نام بدون پسوند (اگر حداقل ۴ کاراکتر باشد)
  const stem = fileNameLower.replace(/\.[^.]+$/, "");
  if (stem.length >= 4 && new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) return true;
  return false;
}

function extractReferences(content: string): string[] {
  const refs = new Set<string>();
  if (!content) return [];

  // import/require در JS/TS
  const importRe = /(?:import\s+[^'"]+from\s+|import\s+|require\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const m of content.matchAll(importRe)) {
    const ref = m[1];
    if (ref.startsWith(".")) refs.add(ref.replace(/^\.\//, "").replace(/^\.\.\//, ""));
  }

  // <script src="...">، <link href="...">، <img src="...">
  const htmlRe = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  for (const m of content.matchAll(htmlRe)) {
    const ref = m[1];
    if (!/^(https?:|data:|blob:|\/\/|#|mailto:|javascript:)/i.test(ref)) {
      refs.add(ref.replace(/^\.\//, "").replace(/^\//, ""));
    }
  }

  // CSS url(...)
  const cssRe = /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  for (const m of content.matchAll(cssRe)) {
    const ref = m[1];
    if (!/^(https?:|data:|blob:|\/\/)/i.test(ref)) {
      refs.add(ref.replace(/^\.\//, "").replace(/^\//, ""));
    }
  }

  return [...refs];
}

function resolveRef(ref: string, fromFile: string, allPaths: string[]): string | null {
  // مسیر نسبی از پوشه‌ی فایل مبدأ
  const baseParts = fromFile.split("/");
  baseParts.pop();
  const targetParts = [...baseParts];
  for (const part of ref.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!targetParts.length) return null; targetParts.pop(); }
    else targetParts.push(part);
  }
  const candidate = targetParts.join("/");

  if (allPaths.includes(candidate)) return candidate;

  // تطابق با نام بدون مسیر
  const baseName = candidate.split("/").pop() || candidate;
  const exact = allPaths.find((p) => p === candidate);
  if (exact) return exact;
  const byBase = allPaths.find((p) => p.split("/").pop() === baseName);
  if (byBase) return byBase;
  return null;
}

export function selectFilesForContext(input: SelectorInput): SelectorOutput {
  const { files, activeFile, userPrompt, contextBudget } = input;
  const budget = Math.max(500, Math.min(contextBudget, 100000));
  const allPaths = Object.keys(files);
  const textPaths = allPaths.filter((p) => !files[p].startsWith("data:"));

  const scores = new Map<string, { score: number; reason: string }>();
  for (const p of textPaths) scores.set(p, { score: 0, reason: "" });

  // اولویت ۱: فایل فعال
  if (activeFile && files[activeFile] && !files[activeFile].startsWith("data:")) {
    scores.set(activeFile, { score: 1000, reason: "فایل فعال" });
  }

  // اولویت ۲: فایل‌های ذکرشده در پیام
  for (const p of textPaths) {
    if (p === activeFile) continue;
    if (mentionsFile(userPrompt, p)) {
      scores.set(p, { score: 800, reason: "ذکرشده در پیام" });
    }
  }

  // اولویت ۳: فایل‌های ارجاع‌داده‌شده توسط اولویت ۱ و ۲
  const highPriority = [...scores.entries()].filter(([, v]) => v.score >= 800).map(([p]) => p);
  for (const fromPath of highPriority) {
    const refs = extractReferences(files[fromPath] || "");
    for (const ref of refs) {
      const resolved = resolveRef(ref, fromPath, textPaths);
      if (resolved && !scores.get(resolved)?.score) {
        scores.set(resolved, { score: 600, reason: `ارجاع از ${fromPath}` });
      }
    }
  }

  // اولویت ۴: فایل‌های کوچک (اگر هنوز امتیاز نگرفته‌اند)
  for (const p of textPaths) {
    const current = scores.get(p);
    if (current && current.score > 0) continue;
    const size = files[p].length;
    if (size <= 5000) {
      scores.set(p, { score: 400, reason: "فایل کوچک" });
    } else {
      scores.set(p, { score: 200, reason: "فایل بزرگ" });
    }
  }

  // مرتب‌سازی بر اساس امتیاز نزولی، سپس اندازه صعودی (کم‌هزینه‌ترها اول)
  const sorted = [...scores.entries()]
    .filter(([, v]) => v.score > 0)
    .sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      return files[a[0]].length - files[b[0]].length;
    });

  // انتخاب بر اساس بودجه
  const included: SelectorOutput["included"] = [];
  const skipped: SelectorOutput["skipped"] = [];
  let used = 0;

  for (const [path, meta] of sorted) {
    const content = files[path];
    // تخمین: خودِ فایل + سرصفحه
    const contentTokens = estimateTokens(content) + estimateTokens(`\n--- FILE: ${path} ---\n`);
    if (used + contentTokens > budget) {
      skipped.push({ path, reason: "از بودجه بیشتر است", size: content.length });
      continue;
    }
    included.push({ path, content, reason: meta.reason, tokens: contentTokens });
    used += contentTokens;
  }

  // فایل‌های باینری و ناموجود
  for (const p of allPaths) {
    if (files[p].startsWith("data:")) {
      skipped.push({ path: p, reason: "فایل باینری", size: 0 });
    }
  }

  return { included, skipped, totalTokens: used, budget };
}