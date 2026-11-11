import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Play, Square, Terminal as TerminalIcon, RefreshCw, Trash2, Send, LoaderCircle, ShieldCheck, Power, Package } from "lucide-react";
type Props = {
  projectId: string;
  files: Record<string, string>;
  onPreviewUrlChange: (url: string | null) => void;
};

type ApiResult = { success?: boolean; error?: string; id?: string; previewUrl?: string; logs?: string; stdout?: string; stderr?: string; exitCode?: number; cwd?: string; ready?: boolean; sandbox?: { available: boolean; engineVersion?: string; image?: string; imageAvailable?: boolean; activeSessions?: number; maxSessions?: number; error?: string } };

async function api<T extends ApiResult>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const result = await response.json() as T;
  if (!response.ok) throw new Error(result.error || result.stderr || `HTTP ${response.status}`);
  return result;
}

export function SandboxPanel({ projectId, files, onPreviewUrlChange }: Props) {
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("آماده اجرا");
  const [logs, setLogs] = useState("");
  const [terminalHistory, setTerminalHistory] = useState("");
  const [command, setCommand] = useState("");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const [previewRequested, setPreviewRequested] = useState(false);
  const [runVersion, setRunVersion] = useState(0);
  const [allowInstallScripts, setAllowInstallScripts] = useState(false);
  const sessionRef = useRef("");
  const previewReadyRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileCount = useMemo(() => Object.keys(files).length, [files]);
  const [isBuilding, setIsBuilding] = useState(false);

  useEffect(() => {
    let active = true;
    api("/api/sandbox/status").then((r) => {
      if (active) setEngineReady(Boolean(r.sandbox?.available));
    }).catch(() => { if (active) setEngineReady(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    return () => {
      const id = sessionRef.current;
      if (id) void fetch(`/api/sandbox/sessions/${id}`, { method: "DELETE" }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !previewRequested) return;
    previewReadyRef.current = false;
    let active = true;
    const checkPreview = async () => {
      try {
        const result = await api(`/api/sandbox/sessions/${sessionId}/ready`);
        if (active && result.ready && !previewReadyRef.current) {
          previewReadyRef.current = true;
          onPreviewUrlChange(result.previewUrl || null);
          setStatus("پیش‌نمایش پروژه آماده است.");
        }
      } catch { /* server is still starting */ }
    };
    void checkPreview();
    const timer = window.setInterval(checkPreview, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [sessionId, previewRequested, runVersion, onPreviewUrlChange]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const poll = async () => {
      try {
        const result = await api(`/api/sandbox/sessions/${sessionId}/logs`);
        if (active && typeof result.logs === "string") setLogs(result.logs);
      } catch { /* session may be stopping */ }
    };
    void poll();
    const timer = window.setInterval(poll, 1800);
    return () => { active = false; window.clearInterval(timer); };
  }, [sessionId]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs, terminalHistory]);

  const start = useCallback(async () => {
    if (busy || !engineReady) return;
    setBusy(true);
    setStatus("در حال آماده‌سازی محیط ایزوله...");
    setTerminalOpen(true);
    try {
      let activeSession = sessionId;
      if (!activeSession) {
        const created = await api("/api/sandbox/sessions", {
          method: "POST",
          body: JSON.stringify({ projectId, files }),
        });
        activeSession = created.id || "";
        if (!activeSession) throw new Error("شناسه محیط اجرا دریافت نشد.");
        setSessionId(activeSession);
        setTerminalHistory("");
      } else {
        await api(`/api/sandbox/sessions/${activeSession}/stop`, { method: "POST", body: "{}" });
        await api(`/api/sandbox/sessions/${activeSession}/sync`, { method: "POST", body: JSON.stringify({ files }) });
      }

      let runCommand = "node .aiplayground-preview.mjs";
      const packageText = files["package.json"];
      if (packageText) {
        let pkg: { scripts?: Record<string, string> };
        try { pkg = JSON.parse(packageText); }
        catch { throw new Error("محتوای package.json معتبر نیست."); }
        if (pkg?.scripts?.dev || pkg?.scripts?.start || pkg?.scripts?.build) {
          setStatus("در حال نصب وابستگی‌ها؛ دسترسی شبکه فقط موقت است...");
          const installed = await api(`/api/sandbox/sessions/${activeSession}/install`, { method: "POST", body: JSON.stringify({ allowScripts: allowInstallScripts }) });
          setTerminalHistory((old) => `${old}\n${installed.stdout || ""}${installed.stderr || ""}\n`);
          if (!installed.success) throw new Error(installed.stderr || "نصب وابستگی‌ها ناموفق بود.");
        }
        if (pkg?.scripts?.dev) runCommand = "npm run dev -- --host 0.0.0.0 --port 4173 --strictPort --cors";
        else if (pkg?.scripts?.start) runCommand = "PORT=4173 HOST=0.0.0.0 npm start";
        else if (pkg?.scripts?.build) runCommand = "npm run build && node .aiplayground-preview.mjs";
      }
      await api(`/api/sandbox/sessions/${activeSession}/start`, { method: "POST", body: JSON.stringify({ command: runCommand }) });
      setRunVersion((value) => value + 1);
      setPreviewRequested(true);
      setStatus("پروژه در حال راه‌اندازی است؛ منتظر آماده‌شدن پیش‌نمایش بمانید.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "اجرای پروژه ناموفق بود.");
    } finally { setBusy(false); }
  }, [busy, engineReady, sessionId, projectId, files, onPreviewUrlChange, allowInstallScripts]);

  const sync = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await api(`/api/sandbox/sessions/${sessionId}/stop`, { method: "POST", body: "{}" });
      await api(`/api/sandbox/sessions/${sessionId}/sync`, { method: "POST", body: JSON.stringify({ files }) });
      setPreviewRequested(false); onPreviewUrlChange(null);
      setStatus("فایل‌ها همگام شدند؛ برای اجرای مجدد دکمه اجرا را بزنید.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "همگام‌سازی ناموفق بود."); }
    finally { setBusy(false); }
  }, [sessionId, busy, files]);

  const runCommand = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!sessionId || !command.trim() || busy) return;
    const current = command.trim();
    setCommand("");
    setTerminalHistory((old) => `${old}\n${current}\n`);
    setBusy(true);
    try {
      const result = await api(`/api/sandbox/sessions/${sessionId}/exec`, { method: "POST", body: JSON.stringify({ command: current, timeoutMs: 30000 }) });
      setTerminalHistory((old) => `${old}${result.stdout || ""}${result.stderr || ""}\n[${result.cwd || "/workspace"} · exit ${result.exitCode ?? 0}]\n`);
    } catch (error) { setTerminalHistory((old) => `${old}\n${error instanceof Error ? error.message : "خطا"}\n`); }
    finally { setBusy(false); }
  }, [sessionId, command, busy]);

  const stop = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await api(`/api/sandbox/sessions/${sessionId}/stop`, { method: "POST", body: "{}" });
      setPreviewRequested(false);
      onPreviewUrlChange(null);
      setStatus("اجرای پروژه متوقف شد.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "توقف ناموفق بود."); }
    finally { setBusy(false); }
  }, [sessionId, busy, onPreviewUrlChange]);

  const dispose = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await api(`/api/sandbox/sessions/${sessionId}`, { method: "DELETE" });
      setSessionId(""); setLogs(""); setTerminalHistory(""); setPreviewRequested(false); onPreviewUrlChange(null); setStatus("محیط اجرا و فضای ذخیره آن حذف شد.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "حذف محیط ناموفق بود."); }
    finally { setBusy(false); }
  }, [sessionId, busy, onPreviewUrlChange]);
   const forceReset = useCallback(async () => {
    if (busy) return;
    if (!window.confirm("آیا مطمئن هستید؟ تمام محیط‌های اجرا و فایل‌های موقت داکر پاک می‌شوند.")) return;
    setBusy(true);
    setStatus("در حال پاک‌سازی کامل محیط...");
    try {
      await api("/api/sandbox/reset", { method: "POST" });
      setSessionId(""); setLogs(""); setTerminalHistory(""); setPreviewRequested(false); onPreviewUrlChange(null);
      setStatus("تمام محیط‌ها با موفقیت پاک‌سازی شدند.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "پاک‌سازی ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }, [busy, onPreviewUrlChange]); 
    const build = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    setIsBuilding(true);
    setStatus("در حال بیلد پروژه (ممکن است چند دقیقه طول بکشد)...");
    try {
      const response = await fetch(`/api/sandbox/sessions/${sessionId}/build`, { method: "POST" });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "بیلد ناموفق بود.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `build-${projectId.substring(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("بیلد با موفقیت انجام شد و دانلود شد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "بیلد ناموفق بود.");
    } finally {
      setBusy(false);
      setIsBuilding(false);
    }
  }, [sessionId, busy, projectId]);

  return (
    <div className="sandbox-panel" dir="rtl">
      <div className="sandbox-toolbar">
        <div className="sandbox-state"><ShieldCheck size={14} /><span>{engineReady === null ? "بررسی Docker..." : engineReady ? status : "Docker Engine در دسترس نیست"}</span></div>
        <div className="sandbox-actions">
          <label className="sandbox-install-option" title="اجازه اجرای اسکریپت‌های نصب بسته‌ها در محیط ایزوله">
            <input type="checkbox" checked={allowInstallScripts} onChange={(event) => setAllowInstallScripts(event.target.checked)} /> اسکریپت نصب
          </label>
          <button type="button" onClick={start} disabled={!engineReady || busy} title="اجرای پروژه"><Play size={14} /> اجرا</button>
          <button type="button" onClick={build} disabled={!sessionId || busy} title="ساخت نسخه نهایی (Build)">
            {isBuilding ? <LoaderCircle size={14} className="sandbox-spinner" /> : <Package size={14} />}
           </button>
          <button type="button" onClick={sync} disabled={!sessionId || busy} title="همگام‌سازی فایل‌ها"><RefreshCw size={14} /></button>
          <button type="button" onClick={stop} disabled={!sessionId || busy} title="توقف برنامه"><Square size={13} /></button>
          <button type="button" onClick={() => setTerminalOpen((value) => !value)} title="نمایش ترمینال"><TerminalIcon size={14} /></button>
          <button type="button" onClick={forceReset} disabled={busy} title="پاک‌سازی کامل (در صورت گیر کردن)">
            <Power size={14} />
          </button>
          <button type="button" onClick={dispose} disabled={!sessionId || busy} title="حذف محیط اجرا">
            <Trash2 size={14} />
          </button>
          <button type="button" onClick={dispose} disabled={!sessionId || busy} title="حذف محیط اجرا"><Trash2 size={14} /></button>
        </div>
      </div>
      {terminalOpen && (
        <div className="sandbox-terminal" dir="ltr">
          <div className="sandbox-terminal-heading"><span>Terminal · {fileCount} files</span>{busy && <LoaderCircle size={13} className="sandbox-spinner" />}</div>
          <pre>{[logs, terminalHistory].filter(Boolean).join("\n") || (sessionId ? "محیط آماده است. دستور موردنظر را وارد کنید." : "برای شروع، روی «اجرا» کلیک کنید.")}<div ref={logEndRef} /></pre>
          <form onSubmit={runCommand} className="sandbox-command-form">
            <span>$</span>
            <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npm run build" disabled={!sessionId || busy} />
            <button type="submit" disabled={!sessionId || busy || !command.trim()} title="اجرای دستور"><Send size={13} /></button>
          </form>
        </div>
      )}
    </div>
  );
}
