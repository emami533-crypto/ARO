import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { zipSync, strToU8 } from "fflate";

const execFileAsync = promisify(execFile);
const IMAGE = process.env.AI_SANDBOX_IMAGE || "node:22-alpine";
const memorySetting = Number.parseInt(process.env.AI_SANDBOX_MEMORY_MB || "512", 10);
const cpuSetting = Number.parseFloat(process.env.AI_SANDBOX_CPUS || "1");
const sessionSetting = Number.parseInt(process.env.AI_SANDBOX_MAX_SESSIONS || "2", 10);
const MEMORY = Number.isFinite(memorySetting) ? Math.min(1024, Math.max(256, memorySetting)) : 512;
const CPU = Number.isFinite(cpuSetting) ? Math.min(2, Math.max(0.25, cpuSetting)) : 1;
const MAX_SESSIONS = Number.isFinite(sessionSetting) ? Math.min(4, Math.max(1, sessionSetting)) : 2;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const sessions = new Map();

async function docker(args, options = {}) {
  try {
    const result = await execFileAsync("docker", args, {
      windowsHide: true,
      timeout: options.timeout || 30_000,
      maxBuffer: options.maxBuffer || 2 * 1024 * 1024,
      encoding: "utf8",
    });
    return { stdout: result.stdout || "", stderr: result.stderr || "" };
  } catch (error) {
    const message = [error.stderr, error.stdout, error.message].filter(Boolean).join("\n").trim();
    const wrapped = new Error(message || "Docker command failed");
    wrapped.code = error.code;
    wrapped.killed = error.killed;
    throw wrapped;
  }
}

function safeProjectId(value) {
  const id = String(value || "").trim();
  if (!id || id.length > 100 || !/^[\p{L}\p{N}._-]+$/u.test(id)) {
    throw new Error("شناسه پروژه نامعتبر است.");
  }
  return id;
}

function safeRelativePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  if (!normalized || normalized.length > 240 || normalized.includes("\0") || normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  if (parts.some((part) => [".git", ".ssh", "node_modules", ".next"].includes(part.toLowerCase()))) return null;
  const base = parts.at(-1).toLowerCase();
  if (/^\.env($|\.)/.test(base) && base !== ".env.example") return null;
  if (["id_rsa", "id_ed25519", "credentials.json"].includes(base)) return null;
  return parts.join(path.sep);
}

async function writeWorkspace(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw new Error("ساختار فایل‌های پروژه معتبر نیست.");
  const entries = Object.entries(files);
  if (entries.length > 1000) throw new Error("تعداد فایل‌های پروژه بیش از حد مجاز است.");
  const dir = await mkdtemp(path.join(os.tmpdir(), "aiplayground-sandbox-"));
  let total = 0;
  try {
    for (const [rawPath, rawContent] of entries) {
      const relative = safeRelativePath(rawPath);
      if (!relative) continue;
      let data;
      if (typeof rawContent !== "string") continue;
      const dataUrl = rawContent.match(/^data:[^;,]+;base64,([\s\S]*)$/);
      if (dataUrl) data = Buffer.from(dataUrl[1], "base64");
      else data = Buffer.from(rawContent, "utf8");
      if (data.length > MAX_FILE_BYTES) throw new Error(`حجم فایل ${rawPath} بیش از حد مجاز است.`);
      total += data.length;
      if (total > MAX_TOTAL_BYTES) throw new Error("حجم کل پروژه برای Sandbox نباید بیشتر از ۲۰ مگابایت باشد.");
      const target = path.resolve(dir, relative);
      if (!target.startsWith(`${dir}${path.sep}`)) continue;
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data, { flag: "w" });
    }
    
    // ساخت اسکریپت سرور استاتیک به صورت یک رشته‌ی ساده (بدون Regex پیچیده)
    const staticServer = `
import { createServer } from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import path from "node:path";

let root = process.cwd();
for (const outputDir of ["dist", "build"]) {
  try {
    if ((await stat(path.join(root, outputDir))).isDirectory()) {
      root = path.join(root, outputDir);
      break;
    }
  } catch {}
}

const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".gif": "image/gif",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".otf": "font/otf", ".mp4": "video/mp4", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".wasm": "application/wasm"
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = path.resolve(root, "." + pathname);
    
    // چک کردن مسیرهای ممنوعه (بدون Regex، با String.includes)
    const forbiddenParts = ["/node_modules/", "/.git/", "/.ssh/", "/.env"];
    if (forbiddenParts.some(p => pathname.includes(p))) {
      throw new Error("Forbidden");
    }
    
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    } catch {
      if (!path.extname(file)) file = path.join(root, "index.html");
    }
    
    const resolved = await realpath(file);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error("Forbidden");
    }
    
    const body = await readFile(resolved);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4173, "0.0.0.0", () => console.log("Preview server listening on 4173"));
`;

    await writeFile(path.join(dir, ".aiplayground-preview.mjs"), staticServer.trim(), "utf8");
    return dir;
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function dependencyHash(files, allowScripts = false) {
  return createHash("sha256")
    .update(String(files?.["package.json"] || ""))
    .update("\0")
    .update(String(files?.["package-lock.json"] || files?.["npm-shrinkwrap.json"] || ""))
    .update(allowScripts ? "\0scripts:on" : "\0scripts:off")
    .digest("hex");
}

function getSession(id) {
  const session = sessions.get(String(id || ""));
  if (!session) throw new Error("محیط اجرای پروژه پیدا نشد یا منقضی شده است.");
  session.lastActivityAt = Date.now();
  return session;
}

async function createVolume(volume) {
  await docker(["volume", "create", "--label", "com.aiplayground.managed=true", volume]);
}

async function createNetwork(network, internal = true) {
  const args = ["network", "create", "--driver", "bridge"];
  if (internal) args.push("--internal");
  args.push("--label", "com.aiplayground.managed=true", network);
  await docker(args);
}

async function copyFilesToContainer(container, files) {
  const staging = await writeWorkspace(files);
  try {
    await docker(["exec", "-u", "0", container, "sh", "-lc", "find /workspace -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf -- {} +"], { timeout: 15_000 });
    await docker(["cp", `${staging}${path.sep}.`, `${container}:/workspace`], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    await docker(["exec", "-u", "0", container, "chmod", "-R", "a+rwX", "/workspace"], { timeout: 30_000 });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function getSandboxStatus() {
  try {
    const result = await docker(["info", "--format", "{{.ServerVersion}}|{{.NCPU}}|{{.MemTotal}}"], { timeout: 8_000 });
    const [version, cpus, memory] = result.stdout.trim().split("|");
    let imageAvailable = true;
    try { await docker(["image", "inspect", IMAGE], { timeout: 8_000 }); }
    catch { imageAvailable = false; }
    return {
      available: true,
      engineVersion: version,
      hostCpus: Number(cpus) || null,
      hostMemoryMb: memory ? Math.round(Number(memory) / 1024 / 1024) : null,
      image: IMAGE,
      imageAvailable,
      activeSessions: sessions.size,
      maxSessions: MAX_SESSIONS,
      limits: { memoryMb: MEMORY, cpus: CPU, network: "internal (no outbound internet; temporary access only for dependency installation)" },
    };
  } catch (error) {
    return { available: false, error: error.message, activeSessions: sessions.size, maxSessions: MAX_SESSIONS };
  }
}

export async function createSandboxSession({ projectId, files }) {
  const project = safeProjectId(projectId);
  if (sessions.size >= MAX_SESSIONS) throw new Error(`حداکثر ${MAX_SESSIONS} محیط هم‌زمان مجاز است.`);
  try { await docker(["image", "inspect", IMAGE], { timeout: 8_000 }); }
  catch { await docker(["pull", IMAGE], { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 }); }
  const id = randomUUID();
  const suffix = id.replace(/-/g, "").slice(0, 16);
  const container = `aip-sandbox-${suffix}`;
  const volume = `aip-workspace-${suffix}`;
  const egressNetwork = `aip-egress-${suffix}`; // فقط برای نصب پکیج‌ها
  let volumeCreated = false;
  let egressCreated = false;
  try {
    await createVolume(volume);
    volumeCreated = true;
    await createNetwork(egressNetwork, false);
    egressCreated = true;
    
    // 🚨 فلگ --network حذف شد تا پورت روی ویندوز به درستی منتقل شود
    await docker([
      "run", "-d", "--name", container,
      "--label", "com.aiplayground.managed=true",
      "--label", `com.aiplayground.project=${project}`,
      "--memory", `${MEMORY}m`, "--memory-swap", `${MEMORY}m`,
      "--cpus", String(CPU), "--pids-limit", "128", "--ulimit", "nofile=1024:1024",
      "--user", "1000:1000", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "--read-only", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=128m",
      "--tmpfs", "/home/node/.npm:rw,nosuid,nodev,noexec,size=128m",
      "--mount", `type=volume,source=${volume},target=/workspace`,
      "--workdir", "/workspace", "-e", "npm_config_cache=/tmp/npm-cache",
      "-p", "0:4173",
      IMAGE, "node", "-e", "setInterval(() => {}, 2147483647)",
    ], { timeout: 120_000 });

    let actualPort = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const portResult = await docker(["port", container, "4173"], { timeout: 5000 });
        const match = portResult.stdout.trim().match(/:(\d+)\s*$/m);
        if (match) {
          actualPort = parseInt(match[1], 10);
          break;
        }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!actualPort) {
      throw new Error("Docker نتوانست پورت پیش‌نمایش را اختصاص دهد. Docker Desktop را ری‌استارت کنید.");
    }

    const session = { id, projectId: project, container, volume, egressNetwork, port: actualPort, cwd: "/workspace", dependencyHash: dependencyHash(files || {}), installedDependencyHash: "", createdAt: Date.now(), started: false };
    sessions.set(id, session);
    await copyFilesToContainer(container, files || {});
    await docker(["exec", container, "sh", "-lc", "mkdir -p /tmp/aiplayground"], { timeout: 10_000 });
    return { id, projectId: project, previewUrl: `http://127.0.0.1:${actualPort}/`, port: actualPort, status: "ready" };
  } catch (error) {
    sessions.delete(id);
    try { await docker(["rm", "-f", container]); } catch { /* ignore cleanup */ }
    if (volumeCreated) { try { await docker(["volume", "rm", "-f", volume]); } catch { /* ignore cleanup */ } }
    if (egressCreated) { try { await docker(["network", "rm", egressNetwork]); } catch { /* ignore cleanup */ } }
    throw error;
  }
}

export async function syncSandboxFiles(id, files) {
  const session = getSession(id);
  await copyFilesToContainer(session.container, files);
  session.dependencyHash = dependencyHash(files || {});
  session.cwd = "/workspace";
  return { success: true, fileCount: Object.keys(files || {}).length };
}

export async function installSandboxDependencies(id, allowScripts = false) {
  const session = getSession(id);
  if (session.installedDependencyHash && session.installedDependencyHash === `${session.dependencyHash}:${allowScripts ? "1" : "0"}`) {
    return { success: true, skipped: true, stdout: "Dependencies unchanged; using the existing node_modules folder.", stderr: "", scriptsAllowed: Boolean(allowScripts) };
  }
  let connected = false;
  try {
    await docker(["network", "connect", "--gw-priority", "1", session.egressNetwork, session.container], { timeout: 10_000 });
    connected = true;
    const scriptFlag = allowScripts ? "" : " --ignore-scripts";
    const command = `if [ -f package-lock.json ]; then npm ci --no-audit --no-fund${scriptFlag}; else npm install --no-audit --no-fund${scriptFlag}; fi`;
    const guardedCommand = `timeout -s KILL 170s sh -lc '${command}'`;
    const result = await docker(["exec", "-w", "/workspace", session.container, "sh", "-lc", guardedCommand], { timeout: 180_000, maxBuffer: 3 * 1024 * 1024 });
    session.installedDependencyHash = `${session.dependencyHash}:${allowScripts ? "1" : "0"}`;
    return { success: true, stdout: result.stdout, stderr: result.stderr, scriptsAllowed: Boolean(allowScripts) };
  } catch (error) {
    return { success: false, stdout: error.stdout || "", stderr: error.message, scriptsAllowed: Boolean(allowScripts) };
  } finally {
    if (connected) await docker(["network", "disconnect", session.egressNetwork, session.container], { timeout: 10_000 }).catch(() => {});
  }
}

export async function executeSandboxCommand(id, command, timeoutMs = 30_000) {
  const session = getSession(id);
  const text = String(command || "").trim();
  if (!text || text.length > 4000) throw new Error("دستور خالی یا بیش از ۴۰۰۰ کاراکتر است.");
  const timeout = Math.min(60_000, Math.max(1000, Number(timeoutMs) || 30_000));
  const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;
  const shellScript = `cd ${shellQuote(session.cwd)} 2>/dev/null || cd /workspace\n${text}\n__aip_status=$?\ncase "$PWD" in /workspace|/workspace/*) __aip_cwd="$PWD";; *) __aip_cwd="/workspace";; esac\nprintf '\\n__AIPLAYGROUND_CWD__%s\n' "$__aip_cwd"\nexit "$__aip_status"`;
  const escaped = shellScript.replace(/'/g, "'\\''");
  const guardedCommand = `timeout -s KILL ${Math.ceil(timeout / 1000)}s sh -lc '${escaped}'`;
  try {
    const result = await docker(["exec", session.container, "sh", "-lc", guardedCommand], { timeout: timeout + 5000, maxBuffer: 1024 * 1024 });
    const marker = result.stdout.match(/\n__AIPLAYGROUND_CWD__(\/workspace[^\r\n]*)\r?\n?$/);
    if (marker) session.cwd = marker[1];
    return { success: true, stdout: marker ? result.stdout.slice(0, marker.index) : result.stdout, stderr: result.stderr, exitCode: 0, cwd: session.cwd };
  } catch (error) {
    const output = String(error.stdout || "");
    const marker = output.match(/\n__AIPLAYGROUND_CWD__(\/workspace[^\r\n]*)\r?\n?$/);
    if (marker) session.cwd = marker[1];
    return { success: false, stdout: marker ? output.slice(0, marker.index) : output, stderr: error.message, exitCode: typeof error.code === "number" ? error.code : 1, timedOut: Boolean(error.killed), cwd: session.cwd };
  }
}

export async function startSandboxPreview(id, command) {
  const session = getSession(id);
  const text = String(command || "").trim();
  if (!text || text.length > 4000) throw new Error("دستور اجرای پروژه معتبر نیست.");
  const escaped = text.replace(/'/g, "'\\''");
  await docker(["exec", session.container, "sh", "-lc", `nohup sh -lc '${escaped}' >/tmp/aiplayground/run.log 2>&1 </dev/null & echo $! >/tmp/aiplayground/run.pid`], { timeout: 10_000 });
  session.started = true;
  session.startedAt = Date.now();
  return { success: true, previewUrl: `http://127.0.0.1:${session.port}/`, port: session.port };
}

export async function getSandboxLogs(id) {
  const session = getSession(id);
  try {
    const result = await docker(["exec", session.container, "sh", "-lc", "tail -c 30000 /tmp/aiplayground/run.log 2>/dev/null || true"], { timeout: 8_000 });
    return { logs: result.stdout };
  } catch (error) {
    return { logs: "", error: error.message };
  }
}

export async function getSandboxPreviewStatus(id) {
  const session = getSession(id);
  const previewUrl = `http://127.0.0.1:${session.port}/`;
  try {
    // تغییر متد از HEAD به GET و افزایش زمان انتظار به ۳ ثانیه
    const response = await fetch(previewUrl, { method: "GET", signal: AbortSignal.timeout(3000) });
    return { ready: response.ok, previewUrl };
  } catch {
    return { ready: false, previewUrl };
  }
}

export async function stopSandboxPreview(id) {
  const session = getSession(id);
  await docker(["exec", session.container, "sh", "-lc", "if [ -f /tmp/aiplayground/run.pid ]; then kill -TERM $(cat /tmp/aiplayground/run.pid) 2>/dev/null || true; fi; pkill -f '[v]ite|[n]ext|[r]eact-scripts|[h]ttp-server|[a]iplayground-preview' || true"], { timeout: 8_000 }).catch(() => {});
  session.started = false;
  return { success: true };
}

export async function deleteSandboxSession(id) {
  const session = getSession(id);
  sessions.delete(session.id);
  await docker(["rm", "-f", session.container], { timeout: 15_000 }).catch(() => {});
  await docker(["volume", "rm", "-f", session.volume], { timeout: 15_000 }).catch(() => {});
  
  await docker(["network", "rm", session.egressNetwork], { timeout: 15_000 }).catch(() => {});
  return { success: true };
}

export async function cleanupOrphanedSandboxResources() {
  try {
    const containers = (await docker(["ps", "-aq", "--filter", "label=com.aiplayground.managed=true"], { timeout: 10_000 })).stdout.trim().split(/\s+/).filter(Boolean);
    if (containers.length) await docker(["rm", "-f", ...containers], { timeout: 30_000 });
    const volumes = (await docker(["volume", "ls", "-q", "--filter", "label=com.aiplayground.managed=true"], { timeout: 10_000 })).stdout.trim().split(/\s+/).filter(Boolean);
    if (volumes.length) await docker(["volume", "rm", "-f", ...volumes], { timeout: 30_000 });
    const networks = (await docker(["network", "ls", "-q", "--filter", "label=com.aiplayground.managed=true"], { timeout: 10_000 })).stdout.trim().split(/\s+/).filter(Boolean);
    for (const network of networks) await docker(["network", "rm", network], { timeout: 10_000 }).catch(() => {});
  } catch { /* Docker may be stopped while the backend starts. */ }
}

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of sessions) {
    if ((session.lastActivityAt || session.createdAt) < cutoff) void deleteSandboxSession(id).catch(() => {});
  }
}, 15 * 60 * 1000).unref();

export async function closeAllSandboxSessions() {
  const ids = [...sessions.keys()];
  await Promise.all(ids.map((id) => deleteSandboxSession(id).catch(() => {})));
}
export async function resetSandbox() {
  const ids = [...sessions.keys()];
  await Promise.all(ids.map((id) => deleteSandboxSession(id).catch(() => {})));
  await cleanupOrphanedSandboxResources();
  return { success: true };
}
export async function buildSandboxProject(id) {
  const session = getSession(id);
  console.log(`[Build] Starting for project ${session.projectId}`);

  // ۱. چک کن آیا package.json با اسکریپت build وجود دارد
  const checkResult = await docker([
    "exec", session.container, "sh", "-lc",
    "if [ -f /workspace/package.json ] && grep -q '\"build\"' /workspace/package.json; then echo 'yes'; else echo 'no'; fi"
  ]);
  const hasBuild = checkResult.stdout.trim() === "yes";
  console.log(`[Build] hasBuild: ${hasBuild}`);

  let tempDir = await mkdtemp(path.join(os.tmpdir(), "aip-build-"));

  try {
    if (hasBuild) {
      // ۲. الف: بیلد واقعی برای پروژه‌های React/Vite/Next
      console.log("[Build] Running npm install && npm run build...");
      try {
        await docker([
          "exec", "-w", "/workspace", session.container, "sh", "-lc",
          "npm install --no-audit --no-fund && npm run build"
        ], { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 });
      } catch (err) {
        throw new Error("بیلد پروژه ناموفق بود. خروجی npm را در ترمینال Sandbox ببینید. " + (err.message || ""));
      }

      // پیدا کردن پوشه خروجی
      const findResult = await docker([
        "exec", session.container, "sh", "-lc",
        "if [ -d /workspace/dist ]; then echo 'dist'; elif [ -d /workspace/build ]; then echo 'build'; elif [ -d /workspace/out ]; then echo 'out'; else echo 'none'; fi"
      ]);
      const detected = findResult.stdout.trim();
      console.log(`[Build] Output dir: ${detected}`);

      if (detected === "none") {
        throw new Error("بیلد اجرا شد ولی پوشه خروجی (dist/build/out) پیدا نشد.");
      }

      await docker(["cp", `${session.container}:/workspace/${detected}/.`, tempDir]);
    } else {
      // ۲. ب: پروژه ساده (HTML/CSS/JS) — کل workspace را کپی کن
      console.log("[Build] Simple project — copying all workspace files");
      await docker(["cp", `${session.container}:/workspace/.`, tempDir]);
    }

    // ۳. خواندن فایل‌ها و ساخت ZIP
    const excludedDirs = ["node_modules", ".git", "dist", "build", "out", ".next", "coverage"];
    const excludedFiles = ["package-lock.json", "npm-shrinkwrap.json", ".DS_Store", ".gitignore", ".aiplayground-preview.mjs"];

    const zipData = {};
    const readDirRecursive = async (dir, base = "") => {
      const files = await readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        const relPath = path.join(base, file.name).replace(/\\/g, "/");
        if (file.isDirectory()) {
          if (excludedDirs.includes(file.name)) continue;
          await readDirRecursive(fullPath, relPath);
        } else {
          if (excludedFiles.includes(file.name)) continue;
          zipData[relPath] = new Uint8Array(await readFile(fullPath));
        }
      }
    };
    await readDirRecursive(tempDir);

    if (Object.keys(zipData).length === 0) {
      throw new Error("هیچ فایلی برای بسته‌بندی وجود ندارد.");
    }

    console.log(`[Build] Packing ${Object.keys(zipData).length} files...`);
    const zipped = zipSync(zipData);
    console.log(`[Build] ZIP size: ${zipped.length} bytes`);

    return {
      zipBuffer: zipped,
      fileName: `build-${session.projectId.substring(0, 8)}.zip`,
      hasBuild,
      fileCount: Object.keys(zipData).length,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}