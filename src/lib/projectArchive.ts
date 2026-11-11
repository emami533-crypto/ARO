// src/lib/projectArchive.ts
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { ChatMessage, Project, ProjectSummary } from "../types";

const ARCHIVE_FORMAT = "aiplayground-project";
const ARCHIVE_VERSION = 1;
const APP_NAME = "ARO";
const APP_VERSION = "0.1.0";

export type ArchiveManifest = {
  format: string;
  version: number;
  exportedAt: string;
  app: { name: string; version: string };
  project: {
    id: string;
    title: string;
    activeFile: string;
    color: string;
    createdAt: number;
    updatedAt: number;
    isSample?: boolean;
  };
  fileTree: { text: string[]; binary: string[] };
  hasMessages: boolean;
  hasSummary: boolean;
};

export type ExportResult = {
  blob: Blob;
  fileName: string;
  sizeBytes: number;
  textFileCount: number;
  binaryFileCount: number;
  messageCount: number;
};

export type ImportResult = {
  project: Project;
  hasManifest: boolean;
  importedMessageCount: number;
  importedFileCount: number;
  warnings: string[];
};

// ---------- helpers ----------

function bufToBase64(buf: Uint8Array): string {
  let bin = "";
  const chunk = 0x2000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIdx);
  const data = dataUrl.slice(commaIdx + 1);
  if (meta.includes(";base64")) return base64ToBuf(data);
  try {
    return strToU8(decodeURIComponent(data));
  } catch {
    return strToU8(data);
  }
}

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    ico: "image/x-icon", bmp: "image/bmp", avif: "image/avif",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm",
    wav: "audio/wav", ogg: "audio/ogg", pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

function slugify(text: string): string {
  const cleaned = String(text || "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .trim();
  return cleaned || "project";
}

function ensureSafePath(p: string): string {
  return String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function isBinaryContent(content: string): boolean {
  return content.startsWith("data:");
}

// ---------- EXPORT ----------

export function exportProjectToZip(project: Project): ExportResult {
  const textPaths: string[] = [];
  const binaryPaths: string[] = [];
  const zipData: Record<string, Uint8Array> = {};

  for (const [path, content] of Object.entries(project.files)) {
    const cleanPath = ensureSafePath(path);
    if (!cleanPath) continue;

    if (isBinaryContent(content)) {
      binaryPaths.push(cleanPath);
      zipData[`assets/${cleanPath}`] = dataUrlToBytes(content);
    } else {
      textPaths.push(cleanPath);
      zipData[`files/${cleanPath}`] = strToU8(content);
    }
  }

  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: APP_NAME, version: APP_VERSION },
    project: {
      id: project.id,
      title: project.title,
      activeFile: project.activeFile,
      color: project.color,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      isSample: project.isSample,
    },
    fileTree: { text: textPaths, binary: binaryPaths },
    hasMessages: project.messages.length > 0,
    hasSummary: Boolean(project.summary),
  };

  zipData["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  zipData["messages.json"] = strToU8(JSON.stringify(project.messages, null, 2));
  if (project.summary) {
    zipData["summary.json"] = strToU8(JSON.stringify(project.summary, null, 2));
  }

  const zipped = zipSync(zipData);
  const blob = new Blob([zipped], { type: "application/zip" });
  const fileName = `${slugify(project.title)}-backup.zip`;

  return {
    blob,
    fileName,
    sizeBytes: zipped.byteLength,
    textFileCount: textPaths.length,
    binaryFileCount: binaryPaths.length,
    messageCount: project.messages.length,
  };
}

export function exportFilesOnly(files: Record<string, string>, projectTitle: string): ExportResult {
  const zipData: Record<string, Uint8Array> = {};
  let textCount = 0;
  let binaryCount = 0;

  for (const [path, content] of Object.entries(files)) {
    const cleanPath = ensureSafePath(path);
    if (!cleanPath) continue;
    if (isBinaryContent(content)) {
      zipData[cleanPath] = dataUrlToBytes(content);
      binaryCount++;
    } else {
      zipData[cleanPath] = strToU8(content);
      textCount++;
    }
  }

  const zipped = zipSync(zipData);
  const blob = new Blob([zipped], { type: "application/zip" });
  const fileName = `${slugify(projectTitle)}.zip`;

  return {
    blob,
    fileName,
    sizeBytes: zipped.byteLength,
    textFileCount: textCount,
    binaryFileCount: binaryCount,
    messageCount: 0,
  };
}

// ---------- IMPORT ----------

function findManifest(entries: Record<string, Uint8Array>): ArchiveManifest | null {
  const entry = entries["manifest.json"];
  if (!entry) return null;
  try {
    const text = strFromU8(entry);
    const parsed = JSON.parse(text) as ArchiveManifest;
    if (parsed?.format !== ARCHIVE_FORMAT) return null;
    if (typeof parsed.version !== "number") return null;
    if (!parsed.project || typeof parsed.project.id !== "string") return null;
    if (!parsed.fileTree || !Array.isArray(parsed.fileTree.text) || !Array.isArray(parsed.fileTree.binary)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function importProjectFromZip(bytes: Uint8Array): ImportResult {
  const entries = unzipSync(bytes);
  const warnings: string[] = [];
  const manifest = findManifest(entries);

  if (!manifest) {
    // Fallback: legacy file-only ZIP
    const files: Record<string, string> = {};
    for (const [rawPath, data] of Object.entries(entries)) {
      if (rawPath.endsWith("/")) continue;
      if (rawPath === "manifest.json" || rawPath === "messages.json" || rawPath === "summary.json") continue;
      const cleanPath = ensureSafePath(rawPath);
      if (!cleanPath) continue;
      if (cleanPath.startsWith("__MACOSX/") || cleanPath.endsWith(".DS_Store")) continue;

      const isBinary = /\.(png|jpe?g|gif|webp|ico|bmp|avif|woff2?|ttf|otf|eot|mp3|mp4|webm|wav|ogg|pdf)$/i.test(cleanPath);
      if (isBinary) {
        files[cleanPath] = `data:${mimeFromPath(cleanPath)};base64,${bufToBase64(data)}`;
      } else {
        try { files[cleanPath] = strFromU8(data); }
        catch { files[cleanPath] = `data:${mimeFromPath(cleanPath)};base64,${bufToBase64(data)}`; }
      }
    }

    const firstHtml = Object.keys(files).find((p) => /\.html?$/i.test(p)) || Object.keys(files)[0] || "";

    return {
      project: {
        id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: "پروژه وارد‌شده",
        files,
        messages: [],
        activeFile: firstHtml,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: "purple",
      },
      hasManifest: false,
      importedMessageCount: 0,
      importedFileCount: Object.keys(files).length,
      warnings: ["ZIP بدون manifest؛ به‌عنوان پروژه جدید وارد شد."],
    };
  }

  // Full restore
  const files: Record<string, string> = {};

  for (const relPath of manifest.fileTree.text) {
    const zipPath = `files/${relPath}`;
    const entry = entries[zipPath];
    if (!entry) { warnings.push(`فایل متنی پیدا نشد: ${relPath}`); continue; }
    try { files[relPath] = strFromU8(entry); }
    catch { warnings.push(`خطا در خواندن: ${relPath}`); }
  }

  for (const relPath of manifest.fileTree.binary) {
    const zipPath = `assets/${relPath}`;
    const entry = entries[zipPath];
    if (!entry) { warnings.push(`فایل باینری پیدا نشد: ${relPath}`); continue; }
    files[relPath] = `data:${mimeFromPath(relPath)};base64,${bufToBase64(entry)}`;
  }

  let messages: ChatMessage[] = [];
  if (manifest.hasMessages && entries["messages.json"]) {
    try {
      const parsed = JSON.parse(strFromU8(entries["messages.json"]));
      if (Array.isArray(parsed)) messages = parsed;
    } catch { warnings.push("خواندن messages.json ناموفق."); }
  }

  let summary: ProjectSummary | undefined;
  if (manifest.hasSummary && entries["summary.json"]) {
    try {
      const parsed = JSON.parse(strFromU8(entries["summary.json"]));
      if (parsed && typeof parsed.text === "string" && typeof parsed.uptoMessageId === "number") {
        summary = parsed;
      }
    } catch { warnings.push("خواندن summary.json ناموفق."); }
  }

  return {
    project: {
      id: manifest.project.id,
      title: manifest.project.title || "پروژه بازیابی‌شده",
      files,
      messages,
      activeFile: manifest.project.activeFile || Object.keys(files)[0] || "",
      createdAt: manifest.project.createdAt || Date.now(),
      updatedAt: Date.now(),
      color: manifest.project.color || "purple",
      isSample: false,
      summary,
    },
    hasManifest: true,
    importedMessageCount: messages.length,
    importedFileCount: Object.keys(files).length,
    warnings,
  };
}