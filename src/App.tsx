import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";

import {
  ArrowUp, Bot, Braces, Check, ChevronDown, Code2, Copy, Download, Eye,
  FileCode2, FileText, Folder, FolderOpen, Globe, History,
    Image as ImageIcon, Menu, MessageSquare, MoreHorizontal, Package, Paperclip, ExternalLink,
  Pencil, Plus, RotateCcw, Search, Settings2, Sparkles, Square,
    Trash2, Upload, X, Zap, CheckCircle2, XCircle, TrendingUp
} from "lucide-react";

import { strFromU8, unzipSync } from "fflate";
import { jsonrepair } from "jsonrepair";
import { loadAll, saveProjects, saveCurrentProjectId, loadSettings, saveSettings, clearAllStorage, saveSnapshot, getSnapshots } from "./lib/storage";
import type { ChatMessage, Project, Store, AppSettings, Attachment, Snapshot, FallbackEvent, ProjectSummary, RouterMeta } from "./types";
import { AvatarLayer } from "./components/AvatarLayer";
import { SettingsModal } from "./components/SettingsModal";
import { UsageDashboard } from "./components/UsageDashboard";
import { ProviderManagerModal } from "./components/ProviderManagerModal";
import { estimateTokens, estimateMessagesTokens, usagePercent } from "./lib/tokens";
import { generateSummary } from "./lib/summarizer";
import { exportProjectToZip, exportFilesOnly, importProjectFromZip } from "./lib/projectArchive";
import { selectFilesForContext } from "./lib/fileSelector";
import { CodeEditor } from "./components/CodeEditor";
import { SandboxPanel } from "./components/SandboxPanel";

import "./App.css";

/* ============================================================
   Types
   ============================================================ */

type ProviderOption = { id: string; name: string };

type ModelOption = {
  id: string;
  name: string;
  contextLength?: number | null;
  accessTier?: string | null;
  isVision?: boolean;
};

type ProjectFile = { path: string; content: string };

type ProjectUpdate = {
  type: "project_update";
  message?: string;
  files: ProjectFile[];
};

/* ============================================================
   Constants
   ============================================================ */

const SAMPLE_PROJECT_ID = "sample-project";
const PROJECT_COLORS = ["purple", "blue", "green", "orange"];
const DEFAULT_TITLE = "پروژه جدید";

const initialFiles: Record<string, string> = {
  "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My AI Project</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main class="hero">
    <div class="hero-content">
      <div class="eyebrow"><span class="sparkle">✦</span> BUILT WITH AI</div>
      <h1>Ideas deserve<br /><span>a place to grow.</span></h1>
      <p>Turn your imagination into something real. Start building your next great idea today.</p>
      <button id="demoButton">Explore the workspace <span>→</span></button>
      <div class="hero-footer"><span class="status-dot"></span>Your creative workspace is ready</div>
    </div>
    <div class="visual-card">
      <div class="visual-orb">✦</div>
      <div class="visual-lines"><span></span><span></span><span></span></div>
      <div class="visual-caption">MAKE SOMETHING AMAZING</div>
    </div>
  </main>
  <script src="./script.js"></script>
</body>
</html>`,
  "styles.css": `* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; font-family: Inter, Arial, sans-serif;
  color: #202238;
  background: radial-gradient(circle at 78% 20%, #eee9ff 0, transparent 35%), linear-gradient(135deg, #faf9ff, #f2f4ff);
}
.hero {
  min-height: 100vh; max-width: 1100px; margin: auto; padding: 90px 60px;
  display: flex; align-items: center; justify-content: space-between; gap: 50px;
}
.hero-content { max-width: 540px; }
.eyebrow { color: #7357e8; font-size: 12px; font-weight: 800; letter-spacing: 2px; display: inline-flex; align-items: center; gap: 9px; }
.sparkle { font-size: 20px; }
h1 { font-size: clamp(42px, 6vw, 68px); line-height: 1.08; letter-spacing: -3px; margin: 25px 0; }
h1 span { color: #8065ee; }
.hero-content p { color: #777b91; line-height: 1.8; font-size: 16px; max-width: 430px; }
button { margin-top: 25px; border: 0; border-radius: 12px; padding: 15px 22px; background: #785ce8; color: white; font-weight: 700; font-size: 14px; cursor: pointer; }
button span { margin-left: 18px; }
.hero-footer { margin-top: 35px; color: #85899c; font-size: 12px; }
.status-dot { display: inline-block; width: 8px; height: 8px; background: #35bb8b; border-radius: 50%; margin-right: 8px; }
.visual-card {
  width: 340px; height: 390px; border-radius: 28px; background: linear-gradient(145deg, #866ef0, #4b36a6);
  box-shadow: 0 30px 70px #7257df38; display: flex; flex-direction: column; align-items: center;
  justify-content: center; transform: rotate(3deg); color: white;
}
.visual-orb { width: 125px; height: 125px; border: 1px solid #ffffff70; background: #ffffff17; border-radius: 35px; display: grid; place-items: center; font-size: 70px; box-shadow: 0 0 60px #ffffff30; }
.visual-lines { width: 120px; margin-top: 45px; display: grid; gap: 10px; }
.visual-lines span { height: 5px; border-radius: 8px; background: #ffffff65; }
.visual-lines span:nth-child(2) { width: 75%; }
.visual-lines span:nth-child(3) { width: 50%; }
.visual-caption { margin-top: 35px; font-size: 10px; letter-spacing: 3px; opacity: .75; }
@media (max-width: 760px) {
  .hero { padding: 65px 25px; flex-direction: column; align-items: flex-start; }
  .visual-card { width: 100%; max-width: 340px; height: 280px; align-self: center; }
}`,
  "script.js": "",
};

const suggestions = [
  { icon: Code2, title: "ساخت وب‌سایت", description: "یک وب‌سایت واکنش‌گرا طراحی کن", prompt: "Build a modern responsive website for a technology startup." },
  { icon: Braces, title: "تولید کد", description: "کد بنویس یا کد موجود را بهبود بده", prompt: "Help me write clean and maintainable JavaScript code." },
  { icon: Globe, title: "بررسی یک ایده", description: "ایده‌ات را به پروژه تبدیل کن", prompt: "Help me turn my idea into a complete web application." },
  { icon: Sparkles, title: "طراحی رابط کاربری", description: "یک رابط حرفه‌ای طراحی کن", prompt: "Design a professional dashboard with a modern user interface." },
];

/* ============================================================
   Helpers — paths & parsing
   ============================================================ */

function normalizeProjectPath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || normalized.length > 240) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes("\0"))) return null;
  return normalized;
}
function parseProjectUpdate(text: string, userPrompt = ""): {
  message: string;
  update: ProjectUpdate | null;
  error: string;
} {
  const startMarker = "<<<AI_PLAYGROUND_PROJECT>>>";
  const endMarker = "<<<END_AI_PLAYGROUND_PROJECT>>>";
  const start = text.indexOf(startMarker);
  
  const isProjectRequest =
    /\b(create|build|make|develop|design|implement|generate|modify|update|edit|fix|write|code|website|web app|application|page|site|component|layout|dashboard)\b/i.test(userPrompt) ||
    /(بساز|ایجاد کن|طراحی کن|طراحی وب|طراحی سایت|طراحی صفحه|طراحی رابط|طراحی جدید|تولید کن|برنامه|وب.?سایت|وبسایت|سایت|صفحه|پروژه|کدنویسی|کد بنویس|تغییر بده|اصلاح کن|بازنویسی|مجدد|داشبورد|محیط|رابط)/i.test(userPrompt);

  function fixDoubleEscaping(content: string): string {
    const literalNewlines = (content.match(/\\n/g) || []).length;
    const realNewlines = (content.match(/\n/g) || []).length;
    if (literalNewlines > 3 && literalNewlines > realNewlines * 2) {
      return content
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
    }
    return content;
  }

  function validateFiles(rawFiles: unknown[]): ProjectFile[] {
    if (rawFiles.length > 80) throw new Error("تعداد فایل‌های دریافتی بیش از حد مجاز است.");
    const files: ProjectFile[] = [];
    const seenPaths = new Set<string>();
    let totalSize = 0;

    for (const item of rawFiles) {
      if (!item || typeof item !== "object" || typeof (item as ProjectFile).path !== "string" || typeof (item as ProjectFile).content !== "string") continue;
      const file = item as ProjectFile;
      const path = normalizeProjectPath(file.path);
      if (!path || seenPaths.has(path)) continue;

      let fixedContent = fixDoubleEscaping(file.content);

      if (path.endsWith(".html")) {
        const lowerContent = fixedContent.toLowerCase();
        if (!lowerContent.includes("<html") && !lowerContent.includes("<body") && !lowerContent.includes("<!doctype")) {
          console.warn(`[Parser] Blocked non-HTML content inside HTML file: ${path}`);
          throw new Error(`مدل به جای کدهای HTML، کدهای دیگری را در فایل ${path} قرار داده است.`);
        }
      }

      if (path.endsWith(".css")) {
        const lowerContent = fixedContent.toLowerCase();
        if (lowerContent.includes("<html") || lowerContent.includes("<!doctype")) {
          throw new Error(`مدل به جای کدهای CSS، کدهای HTML را در فایل ${path} قرار داده است.`);
        }
      }

      if (fixedContent.length > 200_000) throw new Error(`حجم فایل بیش از حد مجاز است: ${path}`);
      totalSize += fixedContent.length;
      if (totalSize > 1_000_000) throw new Error("حجم مجموع فایل‌ها بیش از حد مجاز است.");
      seenPaths.add(path);
      files.push({ path, content: fixedContent });
    }
    return files;
  }

  if (start !== -1) {
    const end = text.indexOf(endMarker, start + startMarker.length);

    if (end === -1) {
      const partialJson = text.slice(start + startMarker.length).trim();
      
      try {
        const repairedText = jsonrepair(partialJson);
        const parsed = JSON.parse(repairedText);
        if (parsed?.type === "project_update" && Array.isArray(parsed.files)) {
          const files = validateFiles(parsed.files);
          if (files.length > 0) {
            return {
              message: "⚠️ پاسخ مدل به دلیل محدودیت توکن ناقص ماند، اما فایل‌های تولیدشده بازیابی شدند.",
              update: { type: "project_update", files },
              error: "",
            };
          }
        }
      } catch (e) {
        console.warn("[Parser] jsonrepair failed on partial stream", e);
      }

      return {
        message: text.slice(0, start).trim() || "پاسخ مدل ناقص ماند.",
        update: null,
        error: "پاسخ مدل قبل از تکمیل فایل‌ها قطع شد.",
      };
    }

    const jsonText = text.slice(start + startMarker.length, end).trim();
    const message = (text.slice(0, start) + text.slice(end + endMarker.length)).trim();
    
    try {
      const repairedText = jsonrepair(jsonText);
      const parsed = JSON.parse(repairedText);
      if (parsed?.type !== "project_update" || !Array.isArray(parsed.files)) throw new Error("ساختار اطلاعات پروژه معتبر نیست.");
      const files = validateFiles(parsed.files);
      return { message: message || parsed.message, update: { type: "project_update", message: parsed.message, files }, error: "" };
    } catch (error) {
      return { message: message || "پردازش اطلاعات پروژه ناموفق بود.", update: null, error: error instanceof Error ? error.message : "خطا در پردازش پروژه." };
    }
  }

  const jsonBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const block of jsonBlocks) {
    try {
      const repairedBlock = jsonrepair(block[1].trim());
      const parsed = JSON.parse(repairedBlock);
      if (parsed?.type === "project_update" && Array.isArray(parsed.files)) {
        const files = validateFiles(parsed.files);
        return { message: parsed.message || "پروژه با موفقیت تولید شد.", update: { type: "project_update", message: parsed.message, files }, error: "" };
      }
    } catch { /* ignore */ }
  }

  const blocks = [...text.matchAll(/```([a-zA-Z0-9_+#.-]*)\s*\r?\n([\s\S]*?)```/g)];
  if (blocks.length > 0) {
    const extractedFiles: ProjectFile[] = [];
    const usedPaths = new Set<string>();
    let hasExplicitPath = false;

    for (let i = 0; i < blocks.length; i++) {
      const language = blocks[i][1].toLowerCase();
      const content = blocks[i][2].trim();
      if (!content) continue;

      const before = text.slice(Math.max(0, blocks[i].index! - 250), blocks[i].index!);
      const pathMatch = before.match(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?([\w./-]+\.(?:html?|css|js|jsx|ts|tsx|json))\b(?:\*\*)?\s*:?\s*$/i);
      let path = pathMatch?.[1];
      if (path) hasExplicitPath = true;

      if (!path && isProjectRequest) {
        const defaults: Record<string, string> = { html: "index.html", htm: "index.html", css: "styles.css", javascript: "script.js", js: "script.js", typescript: "script.ts", ts: "script.ts", jsx: "App.jsx", tsx: "App.tsx", json: "package.json" };
        path = defaults[language];
      }

      if (!path || usedPaths.has(path)) continue;
      const safePath = normalizeProjectPath(path);
      if (!safePath) continue;
      usedPaths.add(safePath);
      extractedFiles.push({ path: safePath, content });
    }

    const shouldApply = isProjectRequest || hasExplicitPath || extractedFiles.length >= 2;

    if (shouldApply && extractedFiles.length > 0) {
      return {
        message: isProjectRequest
          ? "کدهای تولیدشده استخراج و وارد پروژه شدند."
          : `${extractedFiles.length} فایل از پاسخ شناسایی و به پروژه اضافه شد.`,
        update: { type: "project_update", files: validateFiles(extractedFiles) },
        error: "",
      };
    }
  }

  if (isProjectRequest) {
    const htmlMatch =
      text.match(/<!DOCTYPE html[\s\S]*?<\/html>/i) ||
      text.match(/<html[\s>][\s\S]*?<\/html>/i);
    if (htmlMatch && htmlMatch[0].length > 100) {
      return {
        message: "کد HTML از پاسخ استخراج شد.",
        update: { type: "project_update", files: validateFiles([{ path: "index.html", content: htmlMatch[0] }]) },
        error: "",
      };
    }
  }

  return { message: text.trim(), update: null, error: "" };
}


function resolvePreviewPath(fromFile: string, reference: string): string | null {
  const cleanReference = reference.trim();
  if (!cleanReference || cleanReference.startsWith("#") || /^(https?:|data:|blob:|\/\/|mailto:|javascript:)/i.test(cleanReference)) return null;
  const pathOnly = cleanReference.split(/[?#]/)[0].replace(/\\/g, "/");
  if (!pathOnly || pathOnly.startsWith("/")) return null;
  const baseParts = fromFile.split("/");
  baseParts.pop();
  for (const part of pathOnly.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!baseParts.length) return null; baseParts.pop(); }
    else baseParts.push(part);
  }
  return baseParts.join("/");
}

/* ============================================================
   Helpers — binary / assets
   ============================================================ */

function isBinaryPath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|ico|bmp|avif|woff2?|ttf|otf|eot|mp3|mp4|webm|wav|ogg|pdf)$/i.test(path);
}

function mimeFromExt(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    ico: "image/x-icon", bmp: "image/bmp", avif: "image/avif",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    eot: "application/vnd.ms-fontobject",
    mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm",
    wav: "audio/wav", ogg: "audio/ogg", pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

function bufToBase64(buf: Uint8Array): string {
  let bin = "";
  const chunk = 0x2000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function makeDataUrl(path: string, content: string): string | null {
  if (!content) return null;
  if (content.startsWith("data:")) return content;
  if (/\.svg$/i.test(path)) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
  }
  return null;
}

function resolveAssetPath(
  raw: string,
  files: Record<string, string>,
  fromFile: string
): string | null {
  if (!raw || raw.startsWith("#") || /^(https?:|data:|blob:|\/\/|mailto:|javascript:)/i.test(raw)) return null;
  const pathOnly = raw.split(/[?#]/)[0].replace(/\\/g, "/");

  const resolved = resolvePreviewPath(fromFile, pathOnly);
  if (resolved && files[resolved] !== undefined) return resolved;

  const cleaned = pathOnly.replace(/^\.\//, "").replace(/^\//, "");
  if (files[cleaned] !== undefined) return cleaned;

  const lowered = cleaned.toLowerCase();
  for (const p of Object.keys(files)) {
    if (p.toLowerCase() === lowered) return p;
  }

  const base = cleaned.split("/").pop()?.toLowerCase();
  if (base) {
    for (const p of Object.keys(files)) {
      if (p.split("/").pop()?.toLowerCase() === base) return p;
    }
  }
  return null;
}

function inlineCssAssets(css: string, files: Record<string, string>, fromFile: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _q, raw) => {
    if (!raw || /^(https?:|data:|blob:|\/\/)/i.test(raw)) return match;
    const resolved = resolveAssetPath(raw, files, fromFile);
    if (!resolved) return match;
    const data = makeDataUrl(resolved, files[resolved]);
    if (!data) return match;
    return `url("${data}")`;
  });
}

function inlineHtmlAssets(html: string, files: Record<string, string>, htmlPath: string): string {
  html = html.replace(
    /(<(?:img|video|audio|source)\b[^>]*?\bsrc\s*=\s*)(['"])([^'"]+)\2/gi,
    (match, prefix, _q, src) => {
      if (/^(https?:|data:|blob:|\/\/)/i.test(src)) return match;
      const resolved = resolveAssetPath(src, files, htmlPath);
      if (!resolved) return match;
      const data = makeDataUrl(resolved, files[resolved]);
      if (!data) return match;
      return `${prefix}"${data}"`;
    }
  );

  html = html.replace(
    /(<video\b[^>]*?\bposter\s*=\s*)(['"])([^'"]+)\2/gi,
    (match, prefix, _q, src) => {
      if (/^(https?:|data:|blob:|\/\/)/i.test(src)) return match;
      const resolved = resolveAssetPath(src, files, htmlPath);
      if (!resolved) return match;
      const data = makeDataUrl(resolved, files[resolved]);
      if (!data) return match;
      return `${prefix}"${data}"`;
    }
  );

  html = html.replace(
    /(<(?:img|source)\b[^>]*?\bsrcset\s*=\s*)(['"])([^'"]+)\2/gi,
    (match, prefix, _q, srcset: string) => {
  if (!srcset) return match;
  const parts = srcset.split(",").map((s) => s.trim()).filter(Boolean);
      const out = parts.map((part) => {
        const segments = part.split(/\s+/);
        const url = segments[0];
        const rest = segments.slice(1);
        if (!url || /^(https?:|data:|blob:|\/\/)/i.test(url)) return part;
        const resolved = resolveAssetPath(url, files, htmlPath);
        if (!resolved) return part;
        const data = makeDataUrl(resolved, files[resolved]);
        if (!data) return part;
        return [data, ...rest].join(" ");
      });
      return `${prefix}"${out.join(", ")}"`;
    }
  );

  html = html.replace(
    /(<[^>]*?\bstyle\s*=\s*)(['"])([^'"]*url\([^)]+\)[^'"]*)\2/gi,
    (match, prefix, _q, styleContent) => {
      const inlined = inlineCssAssets(styleContent, files, htmlPath);
      if (inlined === styleContent) return match;
      return `${prefix}"${inlined}"`;
    }
  );

  return html;
}

/* ============================================================
   createPreview
   ============================================================ */

function createPreview(files: Record<string, string>): string {
  const htmlPath =
    files["index.html"] !== undefined ? "index.html"
    : files["public/index.html"] !== undefined ? "public/index.html"
    : Object.keys(files).find((path) => /\.html?$/i.test(path)) || "";

  let html = htmlPath
    ? files[htmlPath]
    : `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>ARO Preview</title></head><body><h1>Project preview</h1><p>Create an index.html file to see your project here.</p></body></html>`;

  const injectedStyles: string[] = [];
  const injectedScripts: string[] = [];
  const usedCss = new Set<string>();
  const usedJs = new Set<string>();

  html = html.replace(/<link\b([^>]*?)href\s*=\s*(['"])(.*?)\2([^>]*)>/gi, (fullTag, before, _quote, href, after) => {
    const relMatch = `${before} ${after}`.match(/\brel\s*=\s*(['"])(.*?)\1/i);
    const rel = relMatch?.[2]?.toLowerCase() || "";
    if (!rel.split(/\s+/).includes("stylesheet")) return fullTag;
    const resolvedPath = resolvePreviewPath(htmlPath, href);
    if (!resolvedPath || files[resolvedPath] === undefined) return fullTag;
    usedCss.add(resolvedPath);
    const inlined = inlineCssAssets(files[resolvedPath], files, resolvedPath);
    injectedStyles.push(`<style>\n${inlined.replace(/<\/style/gi, "<\\/style")}\n</style>`);
    return "";
  });

  html = html.replace(/<script\b([^>]*?)src\s*=\s*(['"])(.*?)\2([^>]*)>\s*<\/script>/gi, (fullTag, _before, _quote, src, _after) => {
    const resolvedPath = resolvePreviewPath(htmlPath, src);
    if (!resolvedPath || files[resolvedPath] === undefined) return fullTag;
    usedJs.add(resolvedPath);
    injectedScripts.push(`<script>\n${files[resolvedPath].replace(/<\/script/gi, "<\\/script")}\n<\/script>`);
    return "";
  });

  for (const candidate of ["styles.css", "style.css"]) {
    if (files[candidate] !== undefined && !usedCss.has(candidate)) {
      const inlined = inlineCssAssets(files[candidate], files, candidate);
      injectedStyles.push(`<style>\n${inlined.replace(/<\/style/gi, "<\\/style")}\n</style>`);
      usedCss.add(candidate);
    }
  }
  for (const candidate of ["script.js", "main.js"]) {
    if (files[candidate] !== undefined && !usedJs.has(candidate)) {
      injectedScripts.push(`<script>\n${files[candidate].replace(/<\/script/gi, "<\\/script")}\n<\/script>`);
      usedJs.add(candidate);
    }
  }

  if (injectedStyles.length) {
    const styles = injectedStyles.join("\n");
    html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${styles}\n</head>`) : `${styles}\n${html}`;
  }
  if (injectedScripts.length) {
    const scripts = injectedScripts.join("\n");
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${scripts}\n</body>`) : html + scripts;
  }

  html = inlineHtmlAssets(html, files, htmlPath);
  return html;
}

/* ============================================================
   buildWorkspaceContext (skips binary)
   ============================================================ */

type WorkspaceContextOptions = {
  activeFile: string;
  userPrompt: string;
  contextBudget: number;
};

type WorkspaceContextResult = {
  text: string;
  includedCount: number;
  skippedCount: number;
  totalTokens: number;
  budget: number;
};

function buildWorkspaceContext(
  files: Record<string, string>,
  opts: WorkspaceContextOptions
): WorkspaceContextResult {
  const selection = selectFilesForContext({
    files,
    activeFile: opts.activeFile,
    userPrompt: opts.userPrompt,
    contextBudget: opts.contextBudget,
  });

  let result = "CURRENT WORKSPACE FILES\n";

  if (selection.included.length === 0) {
    result += "\n[هیچ فایلی در بودجه context جا نشد — پروژه خالی است یا بودجه کافی نیست.]\n";
  } else {
    for (const item of selection.included) {
      result += `\n--- FILE: ${item.path} (${item.reason}) ---\n${item.content}\n`;
    }
  }

  if (selection.skipped.length > 0) {
    result += "\n[فایل‌های زیر در پروژه هستند اما به دلیل محدودیت context ارسال نشدند — اگر لازم است نامشان را ذکر کنید:]\n";
    for (const s of selection.skipped.slice(0, 30)) {
      const sizeKb = s.size > 0 ? ` (${Math.round(s.size / 1024)}KB)` : "";
      result += `- ${s.path}${sizeKb} — ${s.reason}\n`;
    }
    if (selection.skipped.length > 30) {
      result += `- و ${selection.skipped.length - 30} فایل دیگر\n`;
    }
  }

  return {
    text: result,
    includedCount: selection.included.length,
    skippedCount: selection.skipped.length,
    totalTokens: selection.totalTokens,
    budget: selection.budget,
  };
}
function sanitizeStreamingText(text: string): string {
  const startMarker = "<<<AI_PLAYGROUND_PROJECT>>>";
  const endMarker = "<<<END_AI_PLAYGROUND_PROJECT>>>";
  const start = text.indexOf(startMarker);
  if (start === -1) return text;
  const end = text.indexOf(endMarker, start);
  const before = text.slice(0, start).trim();
  const after = end === -1 ? "" : text.slice(end + endMarker.length).trim();
  const parts: string[] = [];
  if (before) parts.push(before);
  parts.push("🔨 در حال ساخت پروژه...");
  if (after) parts.push(after);
  return parts.join("\n\n");
}

/* ============================================================
   Import ZIP
   ============================================================ */

async function importZipFile(file: File): Promise<{ files: Record<string, string>; title: string }> {
  const arrayBuf = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);

  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error(
      "فایل انتخاب‌شده ZIP معتبر نیست. مطمئن شوید فایل با پسوند .zip ذخیره شده است."
    );
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("invalid zip")) {
      throw new Error(
        "فایل ZIP قابل خواندن نیست. ممکن است رمزگذاری‌شده (AES) باشد یا با ابزار ناسازگار ساخته شده باشد. لطفاً با 7-Zip به‌صورت «ZIP بدون رمز» دوباره بسازید."
      );
    }
    throw new Error(`خواندن ZIP ناموفق بود: ${msg}`);
  }

  const allPaths = Object.keys(entries).filter((p) => !p.endsWith("/"));
  if (!allPaths.length) throw new Error("فایل ZIP خالی است.");

  const firstSegs = new Set(allPaths.map((p) => p.split("/")[0]));
  const prefix =
    firstSegs.size === 1 && allPaths.every((p) => p.includes("/"))
      ? allPaths[0].split("/")[0] + "/"
      : "";

  const files: Record<string, string> = {};
  for (const [rawPath, data] of Object.entries(entries)) {
    if (rawPath.endsWith("/")) continue;
    const path = rawPath.startsWith(prefix) ? rawPath.slice(prefix.length) : rawPath;
    const clean = normalizeProjectPath(path);
    if (!clean) continue;
    if (clean.startsWith("__MACOSX/") || clean.endsWith(".DS_Store")) continue;

    if (isBinaryPath(clean)) {
      const b64 = bufToBase64(data);
      files[clean] = `data:${mimeFromExt(clean)};base64,${b64}`;
    } else {
      try {
        files[clean] = strFromU8(data);
      } catch {
        const b64 = bufToBase64(data);
        files[clean] = `data:${mimeFromExt(clean)};base64,${b64}`;
      }
    }
  }

  if (!Object.keys(files).length) throw new Error("هیچ فایلی در ZIP پیدا نشد.");

  const hasHtml = Object.keys(files).some((p) => /\.html?$/i.test(p));
  if (!hasHtml) {
    const imagePaths = Object.keys(files).filter((p) =>
      /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i.test(p)
    );
    if (imagePaths.length > 0) {
      const items = imagePaths
        .map(
          (p) =>
            `    <figure>\n      <img src="${p}" alt="${p}" />\n      <figcaption>${p}</figcaption>\n    </figure>`
        )
        .join("\n");
      files["index.html"] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Imported Images</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; background: #fbfbf6; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #2c2c3e; }
    h1 { font-size: 20px; margin: 0 0 24px; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
    figure { margin: 0; padding: 12px; background: #fff; border: 1px solid #e2e2ec; border-radius: 10px; overflow: hidden; }
    img { width: 100%; height: auto; display: block; border-radius: 6px; margin-bottom: 8px; background: #f4f4ee; }
    figcaption { font-size: 12px; color: #6a6a7e; word-break: break-all; }
  </style>
</head>
<body>
  <h1>${imagePaths.length} imported image${imagePaths.length === 1 ? "" : "s"}</h1>
  <div class="gallery">
${items}
  </div>
</body>
</html>`;
    }
  }

  return {
    files,
    title: file.name.replace(/\.zip$/i, "").slice(0, 60) || "پروژه وارد‌شده",
  };
}

/* ============================================================
   Project storage
   ============================================================ */

function generateProjectId(): string {
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSampleProject(): Project {
  return {
    id: SAMPLE_PROJECT_ID,
    title: "پروژه نمونه",
    files: { ...initialFiles },
    messages: [],
    activeFile: "index.html",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    color: PROJECT_COLORS[0],
    isSample: true,
  };
}

function createBlankProject(title: string, colorIndex: number): Project {
  return {
    id: generateProjectId(),
    title,
    files: { ...initialFiles },
    messages: [],
    activeFile: "index.html",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    color: PROJECT_COLORS[colorIndex % PROJECT_COLORS.length],
  };
}

/* ============================================================
   App
   ============================================================ */

function App() {
  const [store, setStore] = useState<Store>({ projects: [], currentProjectId: "" });
  const [isHydrated, setIsHydrated] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [codeOpen, setCodeOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [sandboxPreviewUrl, setSandboxPreviewUrl] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState("گفت‌وگوی جدید");

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [provider, setProvider] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");

  const [providersLoading, setProvidersLoading] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const [isSending, setIsSending] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  
  const [isAutoMode, setIsAutoMode] = useState(() => localStorage.getItem("aiPlayground.autoMode") === "true");
    const [isSmartMode, setIsSmartMode] = useState<boolean>(() => {
    return localStorage.getItem("aiPlayground.smartMode") !== "false";
  });
    const [routerStrategy, setRouterStrategy] = useState<"auto-fast" | "auto-quality" | "auto-vision" | "auto-cheap" | "auto-balanced">(
    () => (localStorage.getItem("aiPlayground.routerStrategy") as any) || "auto-balanced"
  );
  useEffect(() => {
    localStorage.setItem("aiPlayground.routerStrategy", routerStrategy);
  }, [routerStrategy]);
  const [allModelsStatus, setAllModelsStatus] = useState<Record<string, { ok: boolean, latency: number, capabilities?: { imageInput?: boolean } }>>({});
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
    
    // ذخیره نتایج تست در localStorage (تا با رفرش صفحه از دست نرود)
  useEffect(() => {
    if (Object.keys(allModelsStatus).length > 0) {
      try {
        localStorage.setItem(
          "aiPlayground.allModelsStatus",
          JSON.stringify({ timestamp: Date.now(), data: allModelsStatus })
        );
      } catch { /* ignore quota */ }
    }
  }, [allModelsStatus]);

  // بازیابی نتایج از localStorage در بارگذاری اولیه (حداکثر ۲۴ ساعت)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("aiPlayground.allModelsStatus");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        setAllModelsStatus(parsed.data || {});
      }
    } catch { /* ignore */ }
  }, []);

  // اجرای خودکار تست وقتی حالت Auto روشن است و نتیجه‌ای موجود نیست
 const hasAutoTestedRef = useRef(false);
useEffect(() => {
  if (!isAutoMode) {
    hasAutoTestedRef.current = false;
    return;
  }
  if (
    isAutoMode &&
    !isTestingAll &&
    !hasAutoTestedRef.current &&
    Object.keys(allModelsStatus).length === 0
  ) {
    hasAutoTestedRef.current = true;
    setNotice("حالت خودکار: در حال آماده‌سازی و تست مدل‌ها...");
    void testAllModels();
  }
}, [isAutoMode, isTestingAll, allModelsStatus]);

  // File Management States
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingFilePath, setRenamingFilePath] = useState<string | null>(null);
  const [renameFileValue, setRenameFileValue] = useState("");
  const [fileMenuOpen, setFileMenuOpen] = useState<string | null>(null);

  // Snapshot States
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [currentAttachments, setCurrentAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarMood, setAvatarMood] = useState<"idle" | "happy" | "thinking" | "surprised" | "sad">("idle");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatWidth, setChatWidth] = useState(560);

  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [settings, setSettings] = useState<AppSettings>({ theme: "light", defaultProvider: "", showAvatar: true });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProviderManagerOpen, setIsProviderManagerOpen] = useState(false); 
  const [isUsageDashboardOpen, setIsUsageDashboardOpen] = useState(false);

  /* ===== Derived ===== */
  const projects = store.projects;
  const currentProjectId = store.currentProjectId;
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? projects[0];
  const files = currentProject?.files ?? {};
  useEffect(() => { setSandboxPreviewUrl(null); }, [currentProject?.id]);
  const messages = currentProject?.messages ?? [];
  const activeFile = currentProject?.activeFile ?? "";
  const isActiveFileBinary = (files[activeFile] ?? "").startsWith("data:");

  /* ===== Setters ===== */
  function setCurrentProjectId(id: string) {
    setStore((s) => ({ ...s, currentProjectId: id }));
  }

  function setFiles(action: SetStateAction<Record<string, string>>) {
    setStore((s) => {
      const target = s.projects.find((p) => p.id === s.currentProjectId);
      if (!target) return s;
      const next =
        typeof action === "function"
          ? (action as (prev: Record<string, string>) => Record<string, string>)(target.files)
          : action;
      if (next === target.files) return s;
      return {
        ...s,
        projects: s.projects.map((p) =>
          p.id === s.currentProjectId
            ? { ...p, files: next, updatedAt: Date.now() }
            : p
        ),
      };
    });
  }

  function setMessages(action: SetStateAction<ChatMessage[]>) {
    setStore((s) => {
      const target = s.projects.find((p) => p.id === s.currentProjectId);
      if (!target) return s;
      const next =
        typeof action === "function"
          ? (action as (prev: ChatMessage[]) => ChatMessage[])(target.messages)
          : action;
      if (next === target.messages) return s;
      return {
        ...s,
        projects: s.projects.map((p) =>
          p.id === s.currentProjectId
            ? { ...p, messages: next, updatedAt: Date.now() }
            : p
        ),
      };
    });
  }

  function setActiveFile(file: string) {
    setStore((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === s.currentProjectId
          ? { ...p, activeFile: file, updatedAt: Date.now() }
          : p
      ),
    }));
  }

  /* ===== Persist ===== */
  useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const loaded = await loadAll();
      const loadedSettings = await loadSettings();
      if (!cancelled) setSettings(loadedSettings);
      if (cancelled) return;

      let projects = loaded.projects;
      let currentProjectId = loaded.currentProjectId;

      if (!projects.some((p) => p.id === SAMPLE_PROJECT_ID)) {
        const sample = createSampleProject();
        projects = [sample, ...projects];
        if (!projects.some((p) => p.id === currentProjectId)) {
          currentProjectId = sample.id;
        }
      }
      if (!projects.some((p) => p.id === currentProjectId)) {
        currentProjectId = projects[0].id;
      }

      setStore({ projects, currentProjectId });
    } catch (err) {
      console.error("Failed to load storage:", err);
      if (cancelled) return;
      const sample = createSampleProject();
      setStore({ projects: [sample], currentProjectId: sample.id });
    } finally {
      if (!cancelled) setIsHydrated(true);
    }
  })();
  return () => { cancelled = true; };
}, []);

const saveTimerRef = useRef<number | null>(null);

useEffect(() => {
  if (!isHydrated) return;
  if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  saveTimerRef.current = window.setTimeout(() => {
    void saveProjects(store.projects).catch((err) => {
      console.error("Failed to save projects:", err);
    });
  }, 300);
  return () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  };
}, [store.projects, isHydrated]);
useEffect(() => {
  if (settings.theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}, [settings.theme]);

useEffect(() => {
  if (!isHydrated) return;
  void saveCurrentProjectId(store.currentProjectId).catch((err) => {
    console.error("Failed to save current project id:", err);
  });
}, [store.currentProjectId, isHydrated]);
  useEffect(() => {
    localStorage.setItem("aiPlayground.autoMode", String(isAutoMode));
  }, [isAutoMode]);
    useEffect(() => {
    localStorage.setItem("aiPlayground.smartMode", String(isSmartMode));
  }, [isSmartMode]);
  
  /* ===== Resize ===== */
  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    resizeState.current = { startX: event.clientX, startWidth: chatWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function handleResizeMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizeState.current) return;
    const delta = event.clientX - resizeState.current.startX;
    const availableWidth = document.documentElement.clientWidth;
    const maxWidth = Math.max(360, availableWidth * 0.65);
    setChatWidth(Math.max(320, Math.min(maxWidth, resizeState.current.startWidth + delta)));
  }
  function handleResizeEnd() { resizeState.current = null; }
  function handleUpdateSettings(newSettings: AppSettings) {
  setSettings(newSettings);
  void saveSettings(newSettings);
  }
  function handleClearData() {
  if (window.confirm("آیا مطمئن هستید؟ تمام پروژه‌ها و تنظیمات شما پاک می‌شود و برنامه مجدداً راه‌اندازی می‌شود.")) {
    clearAllStorage().then(() => {
      window.location.reload();
    });
  }
}

  /* ===== Clipboard ===== */
  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      setNotice("کپی به کلیپ‌بورد ناموفق بود.");
    }
  }

  /* ===== Load providers ===== */
  
  const loadProvidersFromServer = useCallback(async (opts?: { setDefault?: boolean }) => {
    try {
      const response = await fetch("/api/providers", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.providers)) {
        throw new Error(result.error || "دریافت فهرست سرویس‌دهنده‌ها ناموفق بود.");
      }
      if (!result.providers.length) {
        setProviders([]);
        setProvider("");
        return;
      }
      setProviders(result.providers);
      setProvider((current) => {
        const stillExists = result.providers.some((item: ProviderOption) => item.id === current);
        if (stillExists && !opts?.setDefault) return current;
        const defaultId = result.providers.some((item: ProviderOption) => item.id === result.defaultProvider)
          ? result.defaultProvider
          : result.providers[0].id;
        return defaultId;
      });
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : "خطا در دریافت سرویس‌دهنده‌ها.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    setProvidersLoading(true);
    loadProvidersFromServer({ setDefault: true }).finally(() => {
      if (active) setProvidersLoading(false);
    });
    return () => { active = false; };
  }, [loadProvidersFromServer]);

  /* ===== Load models ===== */
  useEffect(() => {
    if (!provider) return;
    let active = true;
    async function loadModels() {
      setModels([]); setModel(""); setModelsLoading(true); setModelsError(""); setModelMenuOpen(false);
      try {
        const response = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "دریافت مدل‌ها ناموفق بود.");
        if (!Array.isArray(result.models) || !result.models.length) throw new Error("برای این سرویس‌دهنده مدلی در دسترس نیست.");
        if (active) { setModels(result.models); setModel(result.models[0].id); }
      } catch (error) {
        if (active) { setModels([]); setModel(""); setModelsError(error instanceof Error ? error.message : "خطا در دریافت مدل‌ها."); }
      } finally {
        if (active) setModelsLoading(false);
      }
    }
    void loadModels();
    return () => { active = false; };
  }, [provider]);

  /* ===== Derived preview & file lists ===== */
  const previewDocument = useMemo(() => createPreview(files), [files]);
  const selectedModel = models.find((item) => item.id === model);
    const estimatedInputTokens = useMemo(() => {
  const limit = selectedModel?.contextLength || 8192;
  const sysTokens = 500;
  const histTokens = estimateMessagesTokens(messages.slice(-28));
  const promptTokens = estimateTokens(prompt);
  const attachTokens = estimateMessagesTokens([{ text: "", attachments: currentAttachments }]);
  const reserve = 800;
  const budget = Math.max(500, Math.floor(limit * 0.7 - sysTokens - histTokens - promptTokens - attachTokens - reserve));
  const selection = selectFilesForContext({
    files,
    activeFile,
    userPrompt: prompt,
    contextBudget: budget,
  });
  return sysTokens + histTokens + promptTokens + attachTokens + selection.totalTokens + reserve;
}, [prompt, currentAttachments, messages, files, activeFile, selectedModel]);

  const modelContextLimit = selectedModel?.contextLength || 8192;
  const tokenUsageRatio = usagePercent(estimatedInputTokens, modelContextLimit);
  const hasImageAttachment = currentAttachments.some(a => a.type.startsWith("image/"));
const isVisionModel = selectedModel?.isVision === true;
const visionError = hasImageAttachment && !isVisionModel && !isAutoMode;

const healthyVisionCount = useMemo(
  () => Object.values(allModelsStatus).filter(s => s.ok && s.capabilities?.imageInput).length,
  [allModelsStatus]
);
const healthyTotalCount = useMemo(
  () => Object.values(allModelsStatus).filter(s => s.ok).length,
  [allModelsStatus]
);
  const sortedFilePaths = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b)), [files]);
  const folderPaths = useMemo(() => {
    const folders = new Set<string>();
    for (const path of sortedFilePaths) {
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/"));
    }
    return [...folders].sort();
  }, [sortedFilePaths]);

  /* ===== Project actions ===== */
  function loadProject(id: string) {
    if (isSending) {
      setNotice("در حین پاسخ‌دهی نمی‌توانید پروژه را عوض کنید.");
      return;
    }
    if (id === currentProjectId) { setProjectMenuOpen(null); return; }
    setCurrentProjectId(id);
    setNotice("");
    setProjectMenuOpen(null);
  }

  function startNewChat() {
    if (isSending) return;
    const newProject = createBlankProject(DEFAULT_TITLE, projects.length);
    setStore((s) => ({
      ...s,
      projects: [newProject, ...s.projects],
      currentProjectId: newProject.id,
    }));
    setPrompt("");
    setNotice("");
    setActiveNav("گفت‌وگوی جدید");
  }

  function startRename(id: string) {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    setRenamingId(id);
    setRenameValue(target.title);
    setProjectMenuOpen(null);
  }

  function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      setRenameValue("");
      return;
    }
    setStore((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === id
          ? { ...p, title: trimmed.slice(0, 80), updatedAt: Date.now() }
          : p
      ),
    }));
    setRenamingId(null);
    setRenameValue("");
  }

  function duplicateProject(id: string) {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const newProject: Project = {
      ...target,
      id: generateProjectId(),
      title: `${target.title} (کپی)`.slice(0, 80),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSample: false,
    };
    setStore((s) => ({
      ...s,
      projects: [newProject, ...s.projects],
      currentProjectId: newProject.id,
    }));
    setProjectMenuOpen(null);
  }

    function deleteProject(id: string) {
    const target = projects.find((p) => p.id === id);
    if (!target || id === SAMPLE_PROJECT_ID) return;
    if (!window.confirm(`پروژه «${target.title}» حذف شود؟`)) return;
    
    const remaining = projects.filter((p) => p.id !== id);
    const nextId = currentProjectId === id ? (remaining[0]?.id ?? SAMPLE_PROJECT_ID) : currentProjectId;

    setStore({ projects: remaining, currentProjectId: nextId });
    
    void saveProjects(remaining).catch(console.error);
    if (nextId !== currentProjectId) void saveCurrentProjectId(nextId).catch(console.error);

    setProjectMenuOpen(null);
  }

  /* ===== File Management ===== */
  function handleCreateFile(e: FormEvent) {
    e.preventDefault();
    const name = newFileName.trim();
    if (!name) return;
    
    const cleanPath = normalizeProjectPath(name);
    if (!cleanPath) {
      setNotice("نام فایل نامعتبر است (از کاراکترهای غیرمجاز استفاده نکنید).");
      return;
    }
    if (files[cleanPath] !== undefined) {
      setNotice("فایلی با این نام از قبل وجود دارد.");
      return;
    }

    setFiles((current) => ({ ...current, [cleanPath]: "" }));
    setActiveFile(cleanPath);
    setIsNewFileModalOpen(false);
    setNewFileName("");
    setNotice(`فایل ${cleanPath} ساخته شد.`);
  }

  function deleteFile(path: string) {
    if (!window.confirm(`آیا از حذف فایل «${path}» مطمئن هستید؟`)) return;
    
    setFiles((current) => {
      const updated = { ...current };
      delete updated[path];
      return updated;
    });

    if (activeFile === path) {
      const remaining = Object.keys(files).filter((p) => p !== path);
      if (remaining.length > 0) setActiveFile(remaining[0]);
    }
    setFileMenuOpen(null);
    setNotice(`فایل ${path} حذف شد.`);
  }

  function commitFileRename(oldPath: string) {
    const newPathRaw = renameFileValue.trim();
    if (!newPathRaw) { setRenamingFilePath(null); return; }
    
    const newPath = normalizeProjectPath(newPathRaw);
    if (!newPath) {
      setNotice("نام جدید نامعتبر است.");
      return;
    }
    if (newPath !== oldPath && files[newPath] !== undefined) {
      setNotice("فایلی با این نام جدید از قبل وجود دارد.");
      return;
    }

    setFiles((current) => {
      const updated = { ...current };
      updated[newPath] = updated[oldPath];
      if (newPath !== oldPath) delete updated[oldPath];
      return updated;
    });

    if (activeFile === oldPath) setActiveFile(newPath);
    setRenamingFilePath(null);
    setRenameFileValue("");
    setNotice("نام فایل تغییر کرد.");
  }

  /* ===== History (Snapshots) ===== */
  async function takeSnapshot(projectId: string, files: Record<string, string>, activeFile: string) {
    const newSnapshot: Snapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      timestamp: Date.now(),
      files: { ...files },
      activeFile
    };
    await saveSnapshot(newSnapshot);
    const updatedSnaps = await getSnapshots(projectId);
    setSnapshots(updatedSnaps);
  }

  async function openHistory() {
    setIsHistoryOpen(true);
    const snaps = await getSnapshots(currentProjectId);
    setSnapshots(snaps);
  }

  function handleRestoreSnapshot(snap: Snapshot) {
    if (window.confirm("آیا مطمئن هستید؟ فایل‌های فعلی با این نسخه جایگزین می‌شوند.")) {
      setFiles(snap.files);
      setActiveFile(snap.activeFile);
      setIsHistoryOpen(false);
      setNotice("پروژه به نسخه انتخاب‌شده بازگردانده شد.");
    }
  }

  /* ===== Import ZIP ===== */
    async function handleImportZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (isSending) {
      setNotice("در حین پاسخ‌دهی نمی‌توانید پروژه وارد کنید.");
      return;
    }

    try {
      setNotice("در حال خواندن فایل ZIP...");
      const bytes = new Uint8Array(await file.arrayBuffer());

      // Try new archive format (with manifest)
      let result: ReturnType<typeof importProjectFromZip> | null = null;
      try {
        result = importProjectFromZip(bytes);
      } catch (err) {
        // If ZIP itself is invalid, fall through to legacy handler for better error
        result = null;
      }

      if (result && result.hasManifest) {
        let restored = result.project;
        const collision = projects.find((p) => p.id === restored.id);
        if (collision) {
          restored = {
            ...restored,
            id: generateProjectId(),
            title: `${restored.title} (بازیابی)`.slice(0, 80),
          };
        }

        setStore((s) => ({
          ...s,
          projects: [restored, ...s.projects],
          currentProjectId: restored.id,
        }));

        const parts = [
          `پشتیبان کامل بازیابی شد: ${result.importedFileCount} فایل + ${result.importedMessageCount} پیام`,
        ];
        if (collision) parts.push("(با شناسه جدید ذخیره شد)");
        if (result.warnings.length > 0) {
          console.warn("Archive warnings:", result.warnings);
          parts.push(`⚠️ ${result.warnings.length} هشدار در Console`);
        }
        setNotice(parts.join(" • "));
        return;
      }

      // Fallback: legacy file-only ZIP → use existing importZipFile
      const { files: imported, title } = await importZipFile(file);
      const count = Object.keys(imported).length;
      const firstHtml =
        Object.keys(imported).find((p) => /\.html?$/i.test(p)) ||
        Object.keys(imported)[0];
      const newProject: Project = {
        id: generateProjectId(),
        title,
        files: imported,
        messages: [],
        activeFile: firstHtml,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
      };
      setStore((s) => ({
        ...s,
        projects: [newProject, ...s.projects],
        currentProjectId: newProject.id,
      }));
      setNotice(`${count} فایل از ZIP وارد شد (بدون گفتگو).`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "واردکردن ZIP ناموفق بود.");
    }
  }
   function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        setNotice("حجم فایل نباید بیشتر از ۵ مگابایت باشد.");
        return;
      }

      if (file.type.startsWith("image/")) {
        const img = new window.Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 768;
          const MAX_HEIGHT = 768;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
                   const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          
          setCurrentAttachments((prev) => [
            ...prev,
            { name: file.name, type: "image/jpeg", dataUrl },
          ]);
          URL.revokeObjectURL(img.src);
        };
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          setCurrentAttachments((prev) => [
            ...prev,
            { name: file.name, type: file.type, dataUrl },
          ]);
        };
        reader.readAsDataURL(file);
      }
    });
    
    e.target.value = "";
  }

function removeAttachment(index: number) {
  setCurrentAttachments((prev) => prev.filter((_, i) => i !== index));
}

  async function testAllModels() {
    if (isTestingAll) return;
    setIsTestingAll(true);
    setNotice("در حال تست تمام مدل‌های تمام سرویس‌دهنده‌ها (ممکن است کمی طول بکشد)...");

    try {
      const response = await fetch("/api/test-all-models", { method: "POST" });
      const data = await response.json();
      
      if (data.success) {
        setAllModelsStatus(data.results);
        setNotice(data.fromCache ? "نتایج از کش خوانده شد (برای جلوگیری از مصرف توکن)." : "تست همه مدل‌ها با موفقیت انجام شد.");
      } else {
        setNotice("خطا در تست مدل‌ها.");
      }
    } catch {
      setNotice("خطا در ارتباط با سرور.");
    } finally {
      setIsTestingAll(false);
    }
  }
  // آیا نیاز به خلاصه‌سازی داریم؟
  const SUMMARIZE_THRESHOLD = 30; // وقتی پیام‌ها از ۳۰ گذشت
  const SUMMARIZE_KEEP_RECENT = 10; // ۱۰ پیام آخر همیشه حفظ می‌شوند

  function computeSummarizationPlan(currentMessages: ChatMessage[], currentSummary?: ProjectSummary) {
    if (currentMessages.length < SUMMARIZE_THRESHOLD) {
      return { shouldSummarize: false, candidates: [] as ChatMessage[], keepRecent: currentMessages };
    }

    const lastSummarizedId = currentSummary?.uptoMessageId ?? 0;
    const newMessages = currentMessages.filter((m) => m.id > lastSummarizedId);

    // به اندازه کافی پیام جدید برای خلاصه کردن هست؟
    if (newMessages.length < SUMMARIZE_KEEP_RECENT + 5) {
      return { shouldSummarize: false, candidates: [] as ChatMessage[], keepRecent: newMessages };
    }

    const candidates = newMessages.slice(0, newMessages.length - SUMMARIZE_KEEP_RECENT);
    const keepRecent = newMessages.slice(newMessages.length - SUMMARIZE_KEEP_RECENT);

    return { shouldSummarize: true, candidates, keepRecent };
  }

  async function maybeSummarizeHistory(
    project: Project,
    providerId: string,
    modelId: string
  ): Promise<ProjectSummary | undefined> {
    const plan = computeSummarizationPlan(project.messages, project.summary);
    if (!plan.shouldSummarize) return project.summary;

    setIsSummarizing(true);
    setNotice(`در حال خلاصه‌سازی ${plan.candidates.length} پیام قدیمی برای آزادسازی context...`);

    try {
      const result = await generateSummary(
        plan.candidates,
        { provider: providerId, model: modelId, autoMode: isAutoMode }
      );

      // اگر خلاصه‌ی قبلی هست، با هم ادغام کن
      const previousText = project.summary?.text || "";
      const mergedText = previousText
        ? `${previousText}\n\n[به‌روزرسانی بعدی]\n${result.text}`
        : result.text;

      const newSummary: ProjectSummary = {
        text: mergedText,
        uptoMessageId: result.uptoMessageId,
        createdAt: Date.now(),
        messageCount: (project.summary?.messageCount || 0) + result.messageCount,
      };

      setStore((s) => ({
        ...s,
        projects: s.projects.map((p) =>
          p.id === project.id ? { ...p, summary: newSummary, updatedAt: Date.now() } : p
        ),
      }));

      setNotice(
        `تاریخچه گفتگو خلاصه شد (${result.messageCount} پیام → ${Math.round(result.text.length / 4)} توکن تقریبی).`
      );
      return newSummary;
    } catch (err) {
      console.warn("Summarization failed:", err);
      setNotice("خلاصه‌سازی ناموفق بود؛ گفتگو با پیام‌های اخیر ادامه می‌یابد.");
      return project.summary;
    } finally {
      setIsSummarizing(false);
    }
  }
  /* ===== Send message ===== */
   async function sendMessage(text: string) {
    if (!text || isSending) return;
    if (!isSmartMode && (!provider || !model)) {
      setNotice("ابتدا یک سرویس‌دهنده و مدل معتبر انتخاب کنید.");
      return;
    }

       const userId = Date.now();
    const assistantId = userId + 1;
    const startProjectId = currentProjectId;
    let strategyUsed: string = isAutoMode ? routerStrategy : "manual";

    // خلاصه‌سازی قبل از ارسال (اگر لازم است)
    const newSummary = currentProject
      ? await maybeSummarizeHistory(currentProject, provider, model)
      : undefined;
    let capturedUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null = null;
    const binaryPaths = new Set(
      Object.entries(files)
        .filter(([, c]) => c.startsWith("data:"))
        .map(([p]) => p)
    );

    void takeSnapshot(startProjectId, files, activeFile);

    const conversation: ChatMessage[] = [
      ...messages, 
      { id: userId, role: "user", text, attachments: currentAttachments.length > 0 ? currentAttachments : undefined }
    ];
    setMessages([...conversation, { id: assistantId, role: "assistant", text: "", parentPrompt: text }]);
    setPrompt(""); setNotice(""); setIsSending(true);
    setCurrentAttachments([]);
    setAvatarMood("thinking");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let receivedContent = false;
    let streamError = "";
    let assistantText = "";
    let finishReason = "";

    try {
      const systemPrompt = `You are the AI assistant inside ARO.

IMPORTANT PROJECT INSTRUCTIONS:

When the user requests creating, building, designing, coding, or modifying a project, you MUST generate the actual project files.

You MUST follow this exact output format:

<<<AI_PLAYGROUND_PROJECT>>>
{
  "type": "project_update",
  "message": "Project description",
  "files": [
    { "path": "index.html", "content": "Complete file content" },
    { "path": "styles.css", "content": "Complete file content" },
    { "path": "script.js", "content": "Complete file content" }
  ]
}
<<<END_AI_PLAYGROUND_PROJECT>>>

Rules:
- Always use valid JSON.
- Never use Markdown code fences around the JSON.
- Always include complete file contents.
- Use relative file paths.
- For a new HTML website, generate index.html, styles.css and script.js.
- For existing projects, preserve existing files and return complete contents of changed files.
- Never delete files unless explicitly requested.
- Do not return code snippets instead of project files.
- Normal questions must receive normal answers without project files.
- Binary assets (images, fonts) are pre-existing and CANNOT be modified — do not try to update them.
- IMPORTANT: When writing multi-line code inside JSON strings, you MUST escape newlines using the "\\n" sequence. Do not use literal line breaks inside JSON string values.
- Respond in the user's language.
- CRITICAL RULE: If the file path ends with ".html", the content MUST start with "<!DOCTYPE html>" or "<html>". NEVER put raw JavaScript or raw CSS directly inside an HTML file.
- CRITICAL RULE: If the file path ends with ".css", the content must be ONLY CSS rules.
- CRITICAL RULE: If the file path ends with ".js", the content must be ONLY JavaScript.
- If the user asks to change a style (like background color), modify ONLY the CSS file (styles.css) or the <style> tag inside index.html. Do NOT rewrite the entire script.js into index.html.
- CRITICAL: Keep the generated code as compact as possible to avoid hitting the output token limit. 
- Omit unnecessary comments, CSS formatting, and boilerplate. 
- If the project is large, combine CSS and JS directly into the HTML file to save tokens and prevent truncation.
- EXTREMELY IMPORTANT: If the user only asks to change a color, font, or style, you MUST ONLY output the "styles.css" file. Do NOT modify or output "index.html" at all.
- EXTREMELY IMPORTANT: The content of "index.html" MUST ALWAYS start with "<!DOCTYPE html>" or "<html>". NEVER put CSS or JavaScript code directly into the HTML file.
- CRITICAL JSON RULES: In JSON string values, use "\\n" for newlines (ONE backslash + n). NEVER use "\\\\n" (two backslashes). Never escape single quotes (') in JSON strings — they don't need escaping.
- For a calculator, ALWAYS include all digit buttons (0-9), decimal point (.), and operators (+, -, ×, ÷, =, C).
- ALWAYS include <script src="./script.js"></script> before </body> if there is a script.js file.
`;


            // محاسبه بودجه context بر اساس مدل
      const currentModelObj = models.find((m) => m.id === model);
      const modelLimit = currentModelObj?.contextLength || 8192;
      const systemPromptTokens = 500;
      const historyTokens = messages.slice(-28).reduce((sum, m) => sum + (m.text?.length || 0) / 3 + 4, 0);
      const promptTokensEstimate = text.length / 3;
      const attachmentsTokens = currentAttachments.reduce((sum, a) => sum + (a.type?.startsWith("image/") ? 1000 : 500), 0);
      const outputReserve = 800;
      const contextBudgetForFiles = Math.max(
        500,
        Math.floor(modelLimit * 0.7 - systemPromptTokens - historyTokens - promptTokensEstimate - attachmentsTokens - outputReserve)
      );

      const workspaceContext = buildWorkspaceContext(files, {
        activeFile,
        userPrompt: text,
        contextBudget: contextBudgetForFiles,
      });

           const effectiveProvider = isSmartMode ? "" : provider;
      const effectiveModel = isSmartMode ? "" : model;
      const effectiveAutoMode = isSmartMode ? true : isAutoMode;
      const effectiveStrategy = isSmartMode
        ? routerStrategy
        : (isAutoMode ? routerStrategy : "manual");

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          provider: effectiveProvider,
          model: effectiveModel,
          autoMode: effectiveAutoMode,
          strategy: effectiveStrategy,
          messages: [
            { role: "system", content: `${systemPrompt}\n\n${workspaceContext.text}` },
            ...(newSummary
              ? [{ role: "system" as const, content: `CONVERSATION SUMMARY (older messages):\n${newSummary.text}` }]
              : []),
            ...conversation.slice(-28).map((m) => {
              let textContent = m.text || "";
              
              if (m.attachments && m.attachments.length > 0) {
                const textFiles = m.attachments.filter(a => !a.type.startsWith("image/"));
                if (textFiles.length > 0) {
                  const fileTexts = textFiles.map(a => {
                    try {
                      const base64Data = a.dataUrl.split(',')[1];
                      const decodedText = atob(base64Data);
                      return `\n\n--- پیوست: ${a.name} ---\n${decodedText}`;
                    } catch {
                      return `\n\n[فایل ${a.name} پیوست شد]`;
                    }
                  }).join("");
                  textContent += fileTexts;
                }
              }

              const imageFiles = m.attachments?.filter(a => a.type.startsWith("image/")) || [];
              
              if (imageFiles.length > 0) {
                const contentArray: any[] = [];
                contentArray.push({ type: "text", text: textContent.trim() !== "" ? textContent : " " });
                
                imageFiles.forEach(img => {
                  contentArray.push({
                    type: "image_url",
                    image_url: { url: img.dataUrl }
                  });
                });
                return { role: m.role, content: contentArray };
              }

              return { role: m.role, content: textContent.trim() !== "" ? textContent : " " };
            }),
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `درخواست ناموفق بود (${response.status})`);
      }
       const strategyHeader = response.headers.get("X-Router-Strategy");
      if (strategyHeader) strategyUsed = strategyHeader;

      const routerMeta: RouterMeta = {
        strategy: strategyHeader || strategyUsed,
        complexityScore: (() => {
          const v = response.headers.get("X-Router-Complexity");
          return v ? parseInt(v, 10) : undefined;
        })(),
        complexityTier: response.headers.get("X-Router-Tier") || undefined,
        attempts: (() => {
          const v = response.headers.get("X-Router-Attempts");
          return v ? parseInt(v, 10) : undefined;
        })(),
      };

      if (!response.body) throw new Error("پاسخی از سرور دریافت نشد.");
      

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let isStreamDone = false;

           const currentFallbacks: FallbackEvent[] = [];

      function processLine(rawLine: string) {
        const line = rawLine.trim();
        if (!line || line.startsWith(":") || !line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          isStreamDone = true;
          return;
        }
        try {
                   const chunk = JSON.parse(data);

          if (
            !routerMeta.actualModel &&
            typeof chunk.model === "string" &&
            chunk.model.length > 0
          ) {
            routerMeta.actualModel = chunk.model;
          }

          if (chunk.type === "fallback") {
            currentFallbacks.push({
              from: chunk.from,
              to: chunk.to,
              reason: chunk.reason || "",
              attempt: chunk.attempt || 0,
            });
            setMessages((current) =>
              current.map((m) =>
                m.id === assistantId
                  ? { ...m, fallbacks: [...currentFallbacks] }
                  : m
              )
            );
            return;
          }
           if (chunk.usage && (chunk.usage.total_tokens || chunk.usage.prompt_tokens)) {
            capturedUsage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            };
          }
          if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
          if (chunk.error) { streamError = chunk.error.message || "مدل هوش مصنوعی خطا برگرداند."; return; }
          const content = chunk.choices?.[0]?.delta?.content;
          if (typeof content === "string" && content.length > 0) {
            receivedContent = true;
            assistantText += content;
            setMessages((current) =>
              current.map((m) => (m.id === assistantId ? { ...m, text: sanitizeStreamingText(assistantText) } : m))
            );
          }
        } catch { /* ignore */ }
      }

      while (true) {
        if (isStreamDone) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) { processLine(line); if (streamError) break; }
        if (streamError) throw new Error(streamError);
      }
      buffer += decoder.decode();
      if (buffer.trim()) processLine(buffer);
      if (streamError) throw new Error(streamError);
      if (!receivedContent) throw new Error("مدل پاسخ متنی معتبری برنگرداند.");

      const parsed = parseProjectUpdate(assistantText, text);

      const skippedBinary: string[] = [];
      const validUpdates = parsed.update?.files.filter((f) => {
        if (binaryPaths.has(f.path)) {
          skippedBinary.push(f.path);
          return false;
        }
        return true;
      }) ?? [];

      const fileSummary = validUpdates.length
        ? ` (${validUpdates.length} فایل: ${validUpdates.map((f) => f.path).join("، ")})`
        : "";

     const finalFallbacks = currentFallbacks.filter(f => f.attempt > 0);
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId ? {
            ...m,
            text: (parsed.message || "درخواست شما پردازش شد.") + fileSummary,
            fallbacks: finalFallbacks.length > 0 ? finalFallbacks : undefined,
                      strategy: strategyUsed,
            routerMeta,
            promptTokens: capturedUsage?.promptTokens,
            completionTokens: capturedUsage?.completionTokens,
            totalTokens: capturedUsage?.totalTokens,
          } : m
        )
      );

      if (parsed.update) {
        if (validUpdates.length === 0) {
          setNotice(
            skippedBinary.length
              ? "فقط فایل‌های باینری در پاسخ بودند که نمی‌توان آن‌ها را از مدل دریافت کرد."
              : "پاسخ پروژه دریافت شد، اما فایلی برای تغییر وجود نداشت."
          );
        } else {
          setFiles((current) => {
            const updated = { ...current };
            for (const file of validUpdates) updated[file.path] = file.content;
            return updated;
          });
            setActiveFile(validUpdates[0].path);

          const contextInfo = workspaceContext.skippedCount > 0
            ? ` • ${workspaceContext.includedCount} فایل ارسال شد، ${workspaceContext.skippedCount} فایل جا نشد`
            : "";

          setNotice(
            `${validUpdates.length} فایل به‌روزرسانی شد.${contextInfo}` +
            (skippedBinary.length ? ` (${skippedBinary.length} فایل باینری نادیده گرفته شد)` : "") +
            (finishReason === "length" ? " ⚠️ پاسخ مدل به دلیل محدودیت توکن کوتاه شد." : "")
          );

          setStore((s) => ({
            ...s,
            projects: s.projects.map((p) => {
              if (p.id !== s.currentProjectId) return p;
              if (p.id !== startProjectId) return p;
              if (p.title !== DEFAULT_TITLE) return p;
              const newTitle = (parsed.update!.message || text).replace(/\s+/g, " ").trim().slice(0, 45) || DEFAULT_TITLE;
              return { ...p, title: newTitle };
            }),
          }));
        }
      } else if (parsed.error) {
        setNotice(`پاسخ متنی دریافت شد، اما پردازش فایل‌ها ناموفق بود: ${parsed.error}`);
      }
        } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setNotice("ارسال توسط شما متوقف شد.");
        return;
      }
      if (!receivedContent) {
        setMessages((current) => current.filter((m) => m.id !== assistantId));
      }
      
            const errorMessage = error instanceof Error ? error.message : "خطای پیش‌بینی‌نشده رخ داد.";
      
      if (finishReason === "length") {
        setNotice(
          "پاسخ مدل به سقف توکن خروجی خورد و قطع شد. راه‌حل: در فایل .env مقدار AI_MAX_OUTPUT_TOKENS را افزایش دهید (مثلاً ۱۶۳۸۴) و Backend را ری‌استارت کنید، یا از مدلی با max_tokens بیشتر استفاده کنید."
        );
      } else if (errorMessage.includes("400") || errorMessage.includes("Bad Request")) {
        setNotice("این مدل با فایل‌های پروژه (مانند عکس‌ها) یا حجم کد سازگار نیست. لطفاً از منوی بالا یک مدل دیگر (ترجیحاً مدل‌های قدرتمندتر) انتخاب کنید.");
      } else {
        setNotice(errorMessage);
      }
     } finally {
      setIsSending(false);
      setAvatarMood("happy");
      setTimeout(() => setAvatarMood("idle"), 3000);
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || isSending) return;
    void sendMessage(text);
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  /* ===== Editor ===== */
  function updateFile(value: string) {
    if (isActiveFileBinary) return;
    setFiles((current) => ({ ...current, [activeFile]: value }));
  }

  function resetActiveFile() {
    if (isActiveFileBinary) {
      setNotice("فایل باینری قابل بازنشانی نیست.");
      return;
    }
    if (!(activeFile in initialFiles)) {
      setNotice("برای این فایل نسخه اولیه‌ای وجود ندارد.");
      return;
    }
    setFiles((current) => ({ ...current, [activeFile]: initialFiles[activeFile] }));
    setNotice("فایل به نسخه اولیه بازگردانده شد.");
  }

  function chooseNavigation(label: string) {
    setActiveNav(label);
    if (label !== "گفت‌وگوی جدید") {
      setNotice(`بخش «${label}» در مرحله بعدی توسعه داده می‌شود.`);
    } else {
      startNewChat();
    }
  }

   /* ===== Export ZIP ===== */
  function downloadFullBackup() {
    if (!currentProject) return;
    try {
      const result = exportProjectToZip(currentProject);
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const sizeKb = Math.round(result.sizeBytes / 1024);
      const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
      const sizeLabel = result.sizeBytes > 1024 * 1024 ? `${sizeMb}MB` : `${sizeKb}KB`;

      setNotice(
        `پشتیبان کامل «${currentProject.title}» ساخته شد: ` +
        `${result.textFileCount} فایل متنی + ${result.binaryFileCount} فایل باینری + ${result.messageCount} پیام (${sizeLabel})` +
        (result.sizeBytes > 5 * 1024 * 1024 ? " • ⚠️ حجم بالا (احتمالاً پیوست‌های تصویری)" : "")
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "ساخت پشتیبان ناموفق بود.");
    }
  }

  function downloadFilesOnly() {
    if (!currentProject) return;
    try {
      const result = exportFilesOnly(currentProject.files, currentProject.title);
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice(`فایل‌های «${currentProject.title}» دانلود شد.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "خروجی فایل‌ها ناموفق بود.");
    }
  }
  if (!isHydrated || !currentProject) {
  return (
    <div
      dir="rtl"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "var(--font-family-ui, system-ui)",
        color: "#666",
        fontSize: 14,
      }}
    >
      در حال بارگذاری فضای کاری...
    </div>
  );
}

  /* ===== Render ===== */
  return (
    <div className="app-shell" dir="ltr">
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
        <div className="brand">
          <img className="brand-logo" src="/aro-logo.png" alt="ARO" />
          <div className="brand-name">ARO<span>.</span></div>
          <span className="beta-badge">آزمایشی</span>
        </div>

        <button className="new-chat-button" onClick={startNewChat}>
          <Plus size={17} />
          <span>گفت‌وگوی جدید</span>
          <kbd>Ctrl K</kbd>
        </button>

        <div className="sidebar-section">
          <div className="section-heading">فضای کاری</div>
          <nav className="navigation">
            <button className={`nav-item ${activeNav === "پروژه‌ها" ? "active" : ""}`} onClick={() => chooseNavigation("پروژه‌ها")}>
              <FolderOpen size={17} /> پروژه‌ها
            </button>
            <button className="nav-item" onClick={() => setIsUsageDashboardOpen(true)}>
              <TrendingUp size={17} /> آمار مصرف
            </button>
          </nav>
        </div>

        <div className="sidebar-section projects-section">
          <div className="section-heading project-heading">
            <span>پروژه‌های اخیر ({projects.length})</span>
            <div style={{ display: "flex", gap: 2 }}>
              <button
                className="small-icon-button"
                title="وارد کردن فایل ZIP"
                onClick={() => importInputRef.current?.click()}
              >
                <Upload size={14} />
              </button>
              <button className="small-icon-button" title="پروژه جدید" onClick={startNewChat}>
                <Plus size={15} />
              </button>
            </div>
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: "none" }}
            onChange={handleImportZip}
          />

          {projects.map((project) => (
            <div
              key={project.id}
              className="project-item"
              title={project.title}
              style={{ background: currentProjectId === project.id ? "rgba(120,100,200,0.08)" : undefined }}
            >
              <span
                className={`project-color ${project.color}`}
                style={{ cursor: "pointer" }}
                onClick={() => loadProject(project.id)}
              />
              {renamingId === project.id ? (
                <input
                  className="project-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitRename(project.id); }
                    else if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                  }}
                  onBlur={() => commitRename(project.id)}
                  autoFocus
                />
              ) : (
                <span
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", flex: 1 }}
                  onClick={() => loadProject(project.id)}
                >
                  {project.title}
                </span>
              )}

              {project.id !== SAMPLE_PROJECT_ID && (
                <button
                  className="project-delete-btn"
                  onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                  title="حذف این پروژه"
                >
                  <X size={12} />
                </button>
              )}

              <button
                className="small-icon-button"
                onClick={(e) => { e.stopPropagation(); setProjectMenuOpen(projectMenuOpen === project.id ? null : project.id); }}
                title="گزینه‌ها"
              >
                <MoreHorizontal size={15} />
              </button>

              {projectMenuOpen === project.id && (
                <div className="project-menu">
                  <button onClick={() => startRename(project.id)}>
                    <Pencil size={13} /> تغییر نام
                  </button>
                  <button onClick={() => duplicateProject(project.id)}>
                    <Copy size={13} /> کپی
                  </button>
                  {project.id !== SAMPLE_PROJECT_ID && (
                    <button onClick={() => deleteProject(project.id)} style={{ color: "#c0392b" }}>
                      <Trash2 size={13} /> حذف
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-spacer" />

        <div className="usage-card">
          <div className="usage-title"><Zap size={15} /> محیط توسعه شما</div>
          <p>فضای توسعه هوش مصنوعی شما آماده است.</p>
          <div className="usage-track"><span /></div>
          <div className="usage-caption">حالت توسعه محلی</div>
        </div>
        <button className="nav-item settings-item" onClick={() => setIsSettingsOpen(true)}>
        <Settings2 size={17} /> تنظیمات
        </button>
        <div className="user-profile">
          <div className="user-avatar">ME</div>
          <div className="user-details">
            <strong>فضای کاری من</strong>
            <span>حساب محلی</span>
          </div>
          <MoreHorizontal size={18} />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="panel-toggles" aria-label="نمایش یا مخفی‌کردن پنل‌ها">
              <button className={`topbar-icon ${sidebarOpen ? "panel-visible" : ""}`} onClick={() => setSidebarOpen(!sidebarOpen)} title="نمایش/مخفی‌کردن نوار کناری" aria-pressed={sidebarOpen}>
                <Menu size={18} />
              </button>
              <button className={`topbar-icon ${chatOpen ? "panel-visible" : ""}`} onClick={() => setChatOpen(!chatOpen)} title="نمایش/مخفی‌کردن گفتگو" aria-pressed={chatOpen}>
                <MessageSquare size={17} />
              </button>
              <button className={`topbar-icon ${codeOpen ? "panel-visible" : ""}`} onClick={() => setCodeOpen(!codeOpen)} title="نمایش/مخفی‌کردن کد" aria-pressed={codeOpen}>
                <Code2 size={17} />
              </button>
              <button className={`topbar-icon ${previewOpen ? "panel-visible" : ""}`} onClick={() => setPreviewOpen(!previewOpen)} title="نمایش/مخفی‌کردن پیش‌نمایش" aria-pressed={previewOpen}>
                <Eye size={17} />
              </button>
            </div>

            <div className="breadcrumb">
              <span>فضای کاری</span>
              <span className="breadcrumb-separator">/</span>
              <strong>{currentProject.title}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="local-status"><span />محیط محلی</div>
            <button className="topbar-icon" title="جست‌وجوی گفتگوها" onClick={() => setShowChatSearch(!showChatSearch)}>
              <Search size={18} />
            </button>
            <button className="topbar-icon" title="گزینه‌های بیشتر" onClick={() => setNotice("گزینه‌های بیشتر در نسخه بعدی اضافه می‌شوند.")}>
              <MoreHorizontal size={19} />
            </button>
          </div>
        </header>

        <div className={`workbench ${chatOpen ? "" : "chat-hidden"} ${codeOpen ? "" : "code-hidden"} ${previewOpen ? "" : "preview-hidden"}`}
          style={{ display: "flex", flexDirection: "row", direction: "ltr", width: "100%", minWidth: 0, height: "100%", overflow: "hidden" }}
        >
          <section className="chat-panel" style={{
            flex: chatOpen && (codeOpen || previewOpen) ? `0 0 ${chatWidth}px` : "1 1 0",
            width: "auto", minWidth: 0, maxWidth: "100%",
            display: chatOpen ? "flex" : "none", overflow: "hidden",
          }}>
            <div className="chat-toolbar">
              <div className="chat-heading">
                <div className="eyebrow-label">دستیار هوش مصنوعی</div>
                <div className="chat-title-row">
                  <div className="chat-title">{currentProject.title}</div>
                  {currentProjectId !== SAMPLE_PROJECT_ID && (
                    <button
                      className="chat-title-delete"
                      onClick={() => deleteProject(currentProjectId)}
                      title="حذف این پروژه"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

               <div className="provider-model-controls">
                <div className="mode-toggle" role="group" aria-label="حالت انتخاب مدل">
                  <button
                    type="button"
                    className={`mode-option ${isSmartMode ? "active" : ""}`}
                    onClick={() => setIsSmartMode(true)}
                    disabled={isSending}
                    title="Router خودش مدل را انتخاب می‌کند (صرفه‌جویی هزینه)"
                  >
                    🤖 هوشمند
                  </button>
                  <button
                    type="button"
                    className={`mode-option ${!isSmartMode ? "active" : ""}`}
                    onClick={() => setIsSmartMode(false)}
                    disabled={isSending}
                    title="خودت Provider و Model را انتخاب کن"
                  >
                    👤 دستی
                  </button>
                </div>

                {!isSmartMode && (
                  <>
                    <label className="provider-select-wrap">
                      <span className="sr-only">انتخاب سرویس‌دهنده</span>
                      <select className="provider-select" value={provider} onChange={(e) => setProvider(e.target.value)} disabled={providersLoading || providers.length === 0 || isSending} aria-label="سرویس‌دهنده هوش مصنوعی">
                        {providersLoading && <option value="">در حال بارگذاری...</option>}
                        {providers.map((item) => (<option key={item.id} value={item.id}>{item.name}</option>))}
                      </select>
                    </label>

                    <div className="model-selector-wrapper" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
  
  <label className="toggle-switch" title="انتخاب خودکار سریع‌ترین مدل سالم" style={{ margin: 0, transform: "scale(0.85)" }}>
    <input type="checkbox" checked={isAutoMode} onChange={(e) => setIsAutoMode(e.target.checked)} />
    <span className="slider"></span>
  </label>
  <span style={{ fontSize: "11px", color: isAutoMode ? "#4a7fd4" : "#888", cursor: "pointer", userSelect: "none" }} onClick={() => setIsAutoMode(!isAutoMode)}>
    {isAutoMode ? "خودکار" : "دستی"}
  </span>
  {isAutoMode && (
  <select
    value={routerStrategy}
    onChange={(e) => setRouterStrategy(e.target.value as any)}
    title="استراتژی انتخاب خودکار"
    style={{
      fontSize: 10, padding: "2px 4px", borderRadius: 4,
      border: "1px solid #ddd", background: "transparent", color: "#4a7fd4",
      cursor: "pointer",
    }}
  >
    <option value="auto-balanced">متعادل</option>
    <option value="auto-fast">سریع</option>
    <option value="auto-quality">کیفیت</option>
    <option value="auto-cheap">ارزان</option>
    <option value="auto-vision">Vision</option>
  </select>
)}

  <button className="model-selector" onClick={() => setModelMenuOpen(!modelMenuOpen)} aria-expanded={modelMenuOpen} disabled={!models.length || modelsLoading || isAutoMode}>
    <span className="model-indicator"><Sparkles size={14} /></span>
    <span className="model-selector-name">
      {isAutoMode ? "انتخاب هوشمند" : (selectedModel?.name || (modelsLoading ? "در حال بارگذاری..." : "مدلی انتخاب نشده"))}
    </span>
    <ChevronDown size={15} />
  </button>

  {modelMenuOpen && !isAutoMode && (
    <div className="model-menu">
      <div className="menu-caption" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>انتخاب مدل</span>
        <button
          onClick={testAllModels}
          disabled={isTestingAll}
          style={{ fontSize: 10, background: "#f0f0f0", padding: "4px 8px", borderRadius: 4, border: "1px solid #ddd", cursor: "pointer" }}
        >
          {isTestingAll ? "در حال تست..." : "تست همه سرویس‌دهنده‌ها"}
        </button>
      </div>

      {models.map((item) => {
        const cacheKey = `${provider}:${item.id}`;
        const status = allModelsStatus[cacheKey];

        return (
          <button key={item.id} className={`model-option ${model === item.id ? "selected" : ""}`} onClick={() => { setModel(item.id); setModelMenuOpen(false); }}>
            
            {status ? (
              status.ok ? (
                <span title={`سالم - تاخیر: ${status.latency}ms`}><CheckCircle2 size={16} style={{ color: "#10b981" }} /></span>
              ) : (
                <span title="خطا"><XCircle size={16} style={{ color: "#ef4444" }} /></span>
              )
            ) : (
              <Bot size={16} />
            )}
            
            <span style={{ flex: 1 }}>{item.name}</span>
            
            {item.isVision && (
              <span title="پشتیبانی از عکس" style={{ display: "flex", alignItems: "center" }}>
                <Eye size={14} style={{ color: "#4a7fd4", opacity: 0.8 }} />
              </span>
            )}
            
            {model === item.id && <Check size={15} />}
          </button>
        );
      })}
      
                        <div className="model-menu-note">
                    {modelsLoading ? "در حال دریافت مدل‌ها..." : `${models.length} مدل در دسترس`}
                  </div>
                </div>
              )}
                    </div>
                  </>
                )}

                {isSmartMode && (
                  <select
                    value={routerStrategy}
                    onChange={(e) => setRouterStrategy(e.target.value as any)}
                    title="استراتژی انتخاب خودکار"
                    className="smart-strategy-select"
                    disabled={isSending}
                  >
                    <option value="auto-balanced">متعادل</option>
                    <option value="auto-fast">سریع</option>
                    <option value="auto-quality">کیفیت</option>
                    <option value="auto-cheap">ارزان</option>
                    <option value="auto-vision">Vision</option>
                  </select>
                )}
              </div>
            </div>

              {showChatSearch && (
              <div className="search-notice">
                <Search size={15} /><span>جست‌وجوی گفتگوها در مرحله بعدی اضافه می‌شود.</span>
                <button onClick={() => setShowChatSearch(false)}><X size={15} /></button>
              </div>
            )}

            <div className="chat-content">
              <div className="chat-content-inner">
                {messages.length === 0 ? (
                  <div className="welcome-content">
                    <div className="welcome-icon"><Sparkles size={29} /><span /></div>
                    <div className="welcome-kicker">فضای خلاقیت شما</div>
                    <h1>امروز چه چیزی<br /><span>می‌سازیم؟</span></h1>
                    <p className="welcome-description">
                      ایده‌تان را توضیح دهید، سؤال بپرسید یا با کمک هوش مصنوعی ساخت یک پروژه را شروع کنید.
                    </p>
                    <div className="suggestion-grid">
                      {suggestions.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button className="suggestion-card" key={item.title} onClick={() => setPrompt(item.prompt)}>
                            <div className="suggestion-icon"><Icon size={18} /></div>
                            <div className="suggestion-title">{item.title}</div>
                            <div className="suggestion-description">{item.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="message-list">
                                        {currentProject.summary && (
                      <div
                        style={{
                          margin: "0 0 12px",
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          color: "#1e40af",
                          fontSize: 11,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span>
                          📝 {currentProject.summary.messageCount} پیام قدیمی خلاصه شده‌اند
                          {" • "}
                          {Math.round(currentProject.summary.text.length / 4)} توکن تقریبی
                        </span>
                        <button
                          onClick={() => {
                            if (!window.confirm("خلاصه پاک شود؟ تاریخچه همچنان در پیام‌ها باقی می‌ماند.")) return;
                            setStore((s) => ({
                              ...s,
                              projects: s.projects.map((p) =>
                                p.id === currentProjectId ? { ...p, summary: undefined } : p
                              ),
                            }));
                          }}
                          style={{
                            background: "transparent",
                            border: "1px solid #bfdbfe",
                            borderRadius: 4,
                            padding: "2px 8px",
                            fontSize: 10,
                            cursor: "pointer",
                            color: "#1e40af",
                          }}
                          title="پاک کردن خلاصه (خلاصه بعدی خودکار ساخته می‌شود)"
                        >
                          پاک کردن
                        </button>
                      </div>
                    )}
                    {messages.map((message) => (
                      <div className="message-row" key={message.id}>
                        <div className="message-body">
                          <div className="message-author">{message.role === "user" ? "شما" : "دستیار هوش مصنوعی"}</div>
                                                  <p dir="auto">{message.text || (isSending && message.role === "assistant" ? "در حال پردازش..." : "")}</p>

                          {message.role === "assistant" && message.routerMeta && (
                            <div className="router-meta-badge">
                              {message.routerMeta.actualModel && (
                                <span>🤖 {message.routerMeta.actualModel}</span>
                              )}
                              {message.routerMeta.complexityScore !== undefined && (
                                <span>• پیچیدگی {message.routerMeta.complexityScore}</span>
                              )}
                              {message.routerMeta.complexityTier && (
                                <span>• {message.routerMeta.complexityTier}</span>
                              )}
                              {message.routerMeta.actualModel?.includes(":free") && (
                                <span>• رایگان</span>
                              )}
                              {message.routerMeta.attempts && message.routerMeta.attempts > 1 && (
                                <span>• {message.routerMeta.attempts} تلاش</span>
                              )}
                            </div>
                          )}

                          {message.attachments && message.attachments.length > 0 && (
                            <div className="message-attachments">
                              {message.attachments.map((att, i) => (
                                att.type.startsWith("image/") ? (
                                  <img key={i} src={att.dataUrl} alt={att.name} className="message-att-img" />
                                ) : (
                                  <div key={i} className="message-att-file"><FileText size={14} /> {att.name}</div>
                                )
                              ))}
                            </div>
                          )}

                                                    {message.role === "assistant" && message.fallbacks && message.fallbacks.length > 0 && (
                            <div style={{
                              marginTop: 8, padding: "6px 10px", borderRadius: 6,
                              background: "#fef3c7", border: "1px solid #fde68a",
                              fontSize: 11, color: "#92400e",
                              display: "flex", flexDirection: "column", gap: 4,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                                ⚠ Fallback ({message.strategy || "auto"}):
                              </div>
                              {message.fallbacks.map((fb, i) => (
                                <div key={i} style={{ fontSize: 10, opacity: 0.9 }} dir="ltr">
                                  {i + 1}. {fb.from.provider}/{fb.from.model} → {fb.to.provider}/{fb.to.model}
                                  {fb.reason ? ` (${fb.reason.slice(0, 80)})` : ""}
                                </div>
                              ))}
                            </div>
                          )}
                          {message.role === "assistant" && message.totalTokens && (
                            <div
                              title={
                                `ورودی: ${(message.promptTokens || 0).toLocaleString("fa-IR")} • ` +
                                `خروجی: ${(message.completionTokens || 0).toLocaleString("fa-IR")}`
                              }
                              style={{
                                marginTop: 6, fontSize: 10, color: "#999",
                                display: "flex", alignItems: "center", gap: 4,
                              }}
                            >
                              <span>🔢 {message.totalTokens.toLocaleString("fa-IR")} توکن</span>
                              {message.promptTokens && message.completionTokens && (
                                <span style={{ opacity: 0.7 }}>
                                  (ورودی {message.promptTokens.toLocaleString("fa-IR")} / خروجی {message.completionTokens.toLocaleString("fa-IR")})
                                </span>
                              )}
                            </div>
                          )}
                          {message.role === "assistant" && message.parentPrompt && !isSending && (
                            <div className="message-actions">
                              <button className="retry-button" onClick={() => sendMessage(message.parentPrompt!)} title="ارسال مجدد همین پیام">
                                <RotateCcw size={13} /><span>ارسال مجدد</span>
                              </button>
                              <button className="retry-button" onClick={() => copyToClipboard(message.text, `msg-${message.id}`)} title="کپی پاسخ">
                                {copiedId === `msg-${message.id}` ? <Check size={13} /> : <Copy size={13} />}
                                <span>{copiedId === `msg-${message.id}` ? "کپی شد" : "کپی"}</span>
                              </button>
                              <button className="retry-button" onClick={() => { setPrompt(message.parentPrompt!); setNotice(""); }} title="ویرایش پیام قبل از ارسال">
                                <Pencil size={13} /><span>ادیت</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="chat-bottom">
              {(modelsError || notice) && (
                <div className="notice-message">
                  <Sparkles size={14} />
                  <span>{modelsError || notice}</span>
                  <button onClick={() => { setModelsError(""); setNotice(""); }}><X size={14} /></button>
                </div>
              )}
                            {tokenUsageRatio > 0.95 && (
                <div
                  className="notice-message"
                  style={{ background: "#fff5f5", borderColor: "#feb2b2", color: "#c53030" }}
                >
                  <Sparkles size={14} />
                  <span>
                    تخمین می‌زنیم ورودی از ظرفیت مدل ({modelContextLimit.toLocaleString("fa-IR")} توکن) بیشتر شود.
                    بخشی از فایل‌های پروژه یا تاریخچه گفتگو ارسال نخواهد شد. برای نتیجه بهتر، مدلی با context بزرگ‌تر انتخاب کنید یا پروژه را کوچک‌تر کنید.
                  </span>
                </div>
              )}
              {tokenUsageRatio > 0.75 && tokenUsageRatio <= 0.95 && (
                <div
                  className="notice-message"
                  style={{ background: "#fef3c7", borderColor: "#fde68a", color: "#92400e" }}
                >
                  <Sparkles size={14} />
                  <span>
                    نزدیک به ظرفیت مدل هستید (~{Math.round(tokenUsageRatio * 100)}٪ استفاده‌شده). ممکن است بخشی از context حذف شود.
                  </span>
                </div>
              )}
               {visionError && (
                <div className="notice-message" style={{ background: "#fff5f5", borderColor: "#feb2b2", color: "#c53030" }}>
                  <ImageIcon size={14} />
                  <span>مدل انتخاب‌شده از عکس پشتیبانی نمی‌کند. برای ارسال عکس، مدلی با آیکون چشم (مثل GPT-4o یا Gemini) انتخاب کنید یا حالت «خودکار» را روشن کنید.</span>
                </div>
              )}
                            {isAutoMode && !isTestingAll && Object.keys(allModelsStatus).length > 0 && (
                <div
                  className="notice-message"
                  style={{
                    background: healthyVisionCount > 0 ? "#f0fdf4" : "#fef3c7",
                    borderColor: healthyVisionCount > 0 ? "#bbf7d0" : "#fde68a",
                    color: healthyVisionCount > 0 ? "#166534" : "#92400e",
                  }}
                >
                  <Sparkles size={14} />
                  <span>
                    حالت خودکار آماده است: {healthyTotalCount} مدل سالم
                    {healthyVisionCount > 0
                      ? ` • ${healthyVisionCount} مدل با Vision`
                      : " • ⚠ هیچ مدل Vision سالمی پیدا نشد. ارسال عکس احتمالاً خطا می‌دهد."}
                  </span>
                </div>
              )}
              {isAutoMode && !isTestingAll && Object.keys(allModelsStatus).length === 0 && (
                <div className="notice-message" style={{ background: "#fef3c7", borderColor: "#fde68a", color: "#92400e" }}>
                  <Sparkles size={14} />
                  <span>حالت خودکار آماده نیست (تست مدل‌ها انجام نشده). ابتدا از منوی مدل روی «تست همه سرویس‌دهنده‌ها» بزن، یا Auto را خاموش و دوباره روشن کن.</span>
                </div>
              )}
              <form className="prompt-box" onSubmit={handleSubmit}>
                {currentAttachments.length > 0 && (
                  <div className="attachment-preview-row">
                    {currentAttachments.map((att, i) => (
                      <div key={i} className="attachment-chip">
                        {att.type.startsWith("image/") ? (
                          <img src={att.dataUrl} alt={att.name} className="att-thumb" />
                        ) : (
                          <FileText size={16} />
                        )}
                        <span className="att-name">{att.name}</span>
                        <button type="button" onClick={() => removeAttachment(i)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  dir="auto"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="پیام خود را برای ARO بنویسید..."
                  rows={2}
                  disabled={isSending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <div className="prompt-actions">
                  <div className="prompt-tools">
                    <input
                      type="file"
                      multiple
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      onChange={handleFileSelect}
                    />
                    <button
                      type="button"
                      className="prompt-tool"
                      title="پیوست فایل"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip size={17} />
                    </button>
                                     <span className="prompt-hint">Shift + Enter برای خط جدید</span>
                    {selectedModel && (
                      <span
                        className="prompt-hint"
                        title={
                          `تخمین: ${estimatedInputTokens.toLocaleString("fa-IR")} توکن از ` +
                          `${modelContextLimit.toLocaleString("fa-IR")} توکن موجود در مدل`
                        }
                        style={{
                          color:
                            tokenUsageRatio > 0.9 ? "#c53030"
                            : tokenUsageRatio > 0.75 ? "#f59e0b"
                            : "#999",
                          fontWeight: tokenUsageRatio > 0.9 ? 700 : 400,
                          fontSize: 10,
                        }}
                      >
                        ~{estimatedInputTokens.toLocaleString("fa-IR")} / {modelContextLimit.toLocaleString("fa-IR")} توکن
                        {tokenUsageRatio > 0.9 && " ⚠️"}
                      </span>
                    )}
                  </div>
                                    {isSending ? (
                    <button type="button" className="send-button stop-button" onClick={handleStop} title="توقف ارسال">
                      <Square size={16} fill="currentColor" />
                    </button>
                                                               ) : isAutoMode && isTestingAll ? (
                    <button
                      type="button"
                      className="send-button"
                      disabled
                      title="در حال آماده‌سازی حالت خودکار..."
                    >
                      <RotateCcw size={16} className="spin-slow" />
                    </button>
                  ) : isSummarizing ? (
                    <button
                      type="button"
                      className="send-button"
                      disabled
                      title="در حال خلاصه‌سازی تاریخچه..."
                    >
                      <RotateCcw size={16} className="spin-slow" />
                    </button>
                  ) : (
                   <button
                     type="submit"
                     className="send-button"
                     disabled={
                       !prompt.trim() ||
                       !provider ||
                       !model ||
                       visionError ||
                       isTestingAll
                     }
                     title="ارسال پیام"
                   >
                      <ArrowUp size={19} />
                    </button>
                  )}
                </div>
              </form>
              <div className="disclaimer">پاسخ‌های هوش مصنوعی ممکن است اشتباه باشند؛ اطلاعات مهم را بررسی کنید.</div>
            </div>
          </section>
          

          {chatOpen && (codeOpen || previewOpen) && (
            <div
              role="separator" aria-orientation="vertical" aria-label="تغییر اندازه پنل گفتگو" title="برای تغییر اندازه پنل چت بکشید"
              onPointerDown={handleResizeStart} onPointerMove={handleResizeMove} onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd} onLostPointerCapture={handleResizeEnd}
              style={{ flex: "0 0 7px", width: "7px", cursor: "col-resize", touchAction: "none", background: "transparent", borderRight: "1px solid #e5e5e5", borderLeft: "1px solid #e5e5e5", zIndex: 10 }}
            />
          )}

          <section className="workspace-panel" style={{ flex: "1 1 0", minWidth: 0, width: "auto", display: codeOpen || previewOpen ? "flex" : "none", overflow: "hidden" }}>
            <div className="workspace-toolbar">
              <div className="workspace-title">
                <div className="workspace-icon"><Code2 size={16} /></div>
                <div>
                  <strong>{currentProject.title}</strong>
                  <span>{sortedFilePaths.length} فایل</span>
                </div>
              </div>
                            <div style={{ display: "flex", gap: 4 }}>
                <button
                  className="download-button"
                  title="پشتیبان کامل (فایل‌ها + گفتگو + خلاصه)"
                  onClick={downloadFullBackup}
                >
                  <Package size={15} /><span>پشتیبان</span>
                </button>
                <button
                  className="download-button"
                  title="فقط فایل‌ها (برای انتشار)"
                  onClick={downloadFilesOnly}
                >
                  <Download size={15} /><span>فایل‌ها</span>
                </button>
              </div>
            </div>

            <div className="workspace-body">
              <aside className="file-sidebar">
                <div className="file-sidebar-heading">
                  <span>فایل‌ها ({sortedFilePaths.length})</span>
                  <button 
                    className="small-icon-button" 
                    onClick={() => setIsNewFileModalOpen(true)}
                    title="ساخت فایل جدید"
                    style={{ color: "#785ce8" }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="folder-label">
                  <ChevronDown size={14} /><FolderOpen size={15} /><span>{currentProject.title}</span>
                </div>
                <div className="file-list">
                  {folderPaths.map((folder) => (
                    <div className="folder-label" key={folder} title={folder}>
                      <Folder size={14} /><span>{folder}</span>
                    </div>
                  ))}
                  {sortedFilePaths.map((path) => {
                    const fileName = path.split("/").pop() || path;
                    const isHtml = /\.html?$/i.test(path);
                    const isCss = /\.css$/i.test(path);
                    const isJs = /\.(js|jsx|ts|tsx)$/i.test(path);
                    const isImg = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i.test(path);
                    const isFont = /\.(woff2?|ttf|otf|eot)$/i.test(path);
                    const Icon = isHtml ? FileCode2 : isCss ? FileText : isJs ? Braces : isImg ? ImageIcon : isFont ? FileText : FileText;
                    
                    return (
                      <div key={path} className={`file-item-wrapper ${activeFile === path ? "active" : ""}`} style={{ position: "relative", display: "flex", alignItems: "center" }}>
                        {renamingFilePath === path ? (
                          <input
                            className="project-rename-input"
                            value={renameFileValue}
                            onChange={(e) => setRenameFileValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitFileRename(path); }
                              else if (e.key === "Escape") { setRenamingFilePath(null); }
                            }}
                            onBlur={() => commitFileRename(path)}
                            autoFocus
                            style={{ margin: "0 8px", height: 24, flex: 1 }}
                          />
                        ) : (
                          <>
                            <button className={`file-item ${activeFile === path ? "active" : ""}`} onClick={() => setActiveFile(path)} title={path} style={{ flex: 1 }}>
                              <Icon size={15} /><span>{fileName}</span>
                            </button>
                            <button 
                              className="file-menu-btn"
                              onClick={(e) => { e.stopPropagation(); setFileMenuOpen(fileMenuOpen === path ? null : path); }}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            
                            {fileMenuOpen === path && (
                              <div className="project-menu" style={{ top: "100%", left: 0, zIndex: 50 }}>
                                <button onClick={() => { setRenamingFilePath(path); setRenameFileValue(path); setFileMenuOpen(null); }}>
                                  <Pencil size={13} /> تغییر نام
                                </button>
                                <button onClick={() => deleteFile(path)} style={{ color: "#c0392b" }}>
                                  <Trash2 size={13} /> حذف
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="file-sidebar-footer">
                  <Globe size={14} /> پروژه محلی
                </div>
              </aside>

              <section className="editor-area">
                <div className="editor-header">
                  <div className="editor-tab">
                    {activeFile.endsWith(".html") ? <FileCode2 size={15} /> : activeFile.endsWith(".css") ? <FileText size={15} /> : <Braces size={15} />}
                    <span>{activeFile}</span>
                    <span className="unsaved-dot" />
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="editor-icon-button" title="تاریخچه نسخه‌ها" onClick={openHistory}>
                      <History size={16} />
                    </button>
                    {!isActiveFileBinary && (
                      <button className="editor-icon-button" title={copiedId === `file-${activeFile}` ? "کپی شد" : "کپی کد"} onClick={() => copyToClipboard(files[activeFile] ?? "", `file-${activeFile}`)}>
                        {copiedId === `file-${activeFile}` ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    )}
                    <button className="editor-icon-button" title="بازنشانی فایل" onClick={resetActiveFile}>
                      <MoreHorizontal size={17} />
                    </button>
                  </div>
                </div>
                
                <div className="code-editor">
                  {isActiveFileBinary ? (
                    <div className="binary-preview">
                      <ImageIcon size={40} />
                      <p>فایل باینری — قابل ویرایش در ادیتور نیست</p>
                      <a
                        className="download-button"
                        href={files[activeFile]}
                        download={activeFile.split("/").pop()}
                      >
                        <Download size={14} />
                        <span>دانلود</span>
                      </a>
                    </div>
                  ) : (
                    <CodeEditor
                      value={files[activeFile] ?? ""}
                      onChange={updateFile}
                      filename={activeFile}
                      theme={settings.theme}
                    />
                  )}
                </div>

                <div className="editor-footer">
                  <span><span className="status-dot" />آماده</span>
                  <span>{isActiveFileBinary ? "باینری" : `${(files[activeFile] || "").split("\n").length} خط`}</span>
                </div>
              </section>

              <section className="preview-area">
                <div className="preview-header">
                  <div className="preview-label">
                    <Eye size={15} /><span>پیش‌نمایش زنده</span><span className="live-badge">محلی</span>
                  </div>
                                    <div className="preview-actions">
                                       {sandboxPreviewUrl && (
                      <button 
                        className="preview-icon-button preview-external-btn" 
                        title="باز کردن در تب جدید" 
                        onClick={() => window.open(sandboxPreviewUrl, "_blank")}
                      >
                        <ExternalLink size={15} />
                      </button>
                    )}
                    <button className="preview-icon-button" title="تازه‌سازی پیش‌نمایش" onClick={() => setNotice("پیش‌نمایش از فایل‌های محلی به‌روزرسانی شد.")}>
                      <Zap size={15} />
                    </button>
                    <button className="preview-icon-button" title="گزینه‌های بیشتر" onClick={() => setNotice("گزینه‌های پیش‌نمایش در مرحله بعدی اضافه می‌شوند.")}>
                      <MoreHorizontal size={17} />
                    </button>
                  </div>
                </div>
                <div className="preview-browser-bar" dir="ltr">
                  <div className="browser-dots"><i /><i /><i /></div>
                  <div className="browser-address"><Globe size={12} />localhost / preview</div>
                </div>
                <div className="preview-frame-container">
                  <iframe className="preview-frame" title="Project live preview" src={sandboxPreviewUrl || undefined} srcDoc={sandboxPreviewUrl ? undefined : previewDocument} sandbox="allow-scripts allow-same-origin allow-forms allow-modals" />
                </div>
                <SandboxPanel
                  key={currentProject.id}
                  projectId={currentProject.id}
                  files={files}
                  onPreviewUrlChange={setSandboxPreviewUrl}
                />
                <div className="preview-footer">
                  <span><span className="status-dot" />{sandboxPreviewUrl ? "پیش‌نمایش Sandbox" : "پیش‌نمایش محلی فعال است"}</span>
                  <span>{sandboxPreviewUrl ? "Docker Runtime" : "HTML / CSS / JS"}</span>
                </div>
              </section>
            </div>
          </section>
        </div>
            </main>
      
      {settings.showAvatar !== false && <AvatarLayer mood={avatarMood} />}
      
       <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings}
        onUpdate={handleUpdateSettings}
        onClearData={handleClearData} 
        onOpenProviderManager={() => {
          setIsSettingsOpen(false);
          setIsProviderManagerOpen(true);
        }}
      />
       <ProviderManagerModal
        isOpen={isProviderManagerOpen}
        onClose={() => setIsProviderManagerOpen(false)}
        onProviderListChanged={() => loadProvidersFromServer()}
      />
            <UsageDashboard
        isOpen={isUsageDashboardOpen}
        onClose={() => setIsUsageDashboardOpen(false)}
      />

      {/* مودال تاریخچه نسخه‌ها */}
      {isHistoryOpen && (
        <div className="modal-overlay" onClick={() => setIsHistoryOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2>تاریخچه نسخه‌ها</h2>
              <button onClick={() => setIsHistoryOpen(false)} className="modal-close-btn"><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {snapshots.length === 0 ? (
                <p style={{ textAlign: "center", color: "#888", fontSize: 13 }}>
                  هنوز هیچ نسخه‌ای ذخیره نشده است. نسخه‌ها قبل از هر تغییر توسط هوش مصنوعی ساخته می‌شوند.
                </p>
              ) : (
                snapshots.map((snap) => (
                  <div key={snap.id} className="snapshot-item">
                    <div className="snapshot-info">
                      <strong>{new Date(snap.timestamp).toLocaleString("fa-IR")}</strong>
                      <span>{Object.keys(snap.files).length} فایل</span>
                    </div>
                    <button className="theme-btn active" onClick={() => handleRestoreSnapshot(snap)} style={{ padding: "6px 12px", fontSize: 12 }}>
                      بازگردانی
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* مودال ساخت فایل جدید */}
      {isNewFileModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewFileModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>ساخت فایل جدید</h2>
              <button onClick={() => setIsNewFileModalOpen(false)} className="modal-close-btn"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateFile} className="modal-body">
              <div className="setting-card">
                <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 700, color: "inherit" }}>
                  نام فایل (همراه با پسوند):
                </label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="مثلاً: about.html یا styles/main.css"
                  autoFocus
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd",
                    fontSize: 14, fontFamily: "inherit", background: "transparent", color: "inherit"
                  }}
                  dir="ltr"
                />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
                <button type="button" onClick={() => setIsNewFileModalOpen(false)} className="theme-btn" style={{ flex: "none", padding: "8px 16px" }}>
                  انصراف
                </button>
                <button type="submit" className="theme-btn active" style={{ flex: "none", padding: "8px 16px" }}>
                  ساخت فایل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;