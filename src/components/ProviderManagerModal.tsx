// src/components/ProviderManagerModal.tsx
import { useEffect, useRef, useState } from "react";
import {
  X, Plus, RefreshCw, Trash2, Pencil, Zap,
  CheckCircle2, XCircle, Key, AlertCircle, Save,
} from "lucide-react";
import {
  listProviders, createProvider, updateProvider, deleteProvider, testProvider,
  type AdminProvider, type CreateProviderInput, type TestResult,
} from "../lib/adminApi";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onProviderListChanged?: () => void | Promise<void>;
};
type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; provider: AdminProvider };

type DraftPersist = {
  mode: "create" | "edit";
  editId?: string;
  data: CreateProviderInput;
  savedAt: number;
};

const DRAFT_KEY = "aiPlayground.providerFormDraft.v1";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // ۷ روز

function loadDraft(): DraftPersist | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftPersist;
    if (!parsed || !parsed.data) return null;
    if (Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(d: DraftPersist | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { /* ignore quota errors */ }
}

const emptyForm: CreateProviderInput = {
  id: "", name: "", type: "openai-compatible", baseUrl: "",
  apiKey: "", enabled: true, order: 0,
};

function isDraftMeaningful(d: CreateProviderInput): boolean {
  return Boolean(
    (d.id && d.id.trim()) ||
    (d.name && d.name.trim()) ||
    (d.baseUrl && d.baseUrl.trim()) ||
    (d.apiKey && d.apiKey.trim())
  );
}

export function ProviderManagerModal({ isOpen, onClose, onProviderListChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [meta, setMeta] = useState<{ file: string; count: number; defaultProvider: string } | null>(null);
  const [form, setForm] = useState<FormMode>({ kind: "closed" });
  const [draft, setDraft] = useState<CreateProviderInput>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = useState(false);

  // ردیابی نقطه شروع mousedown — جلوگیری از بسته شدن با درگ کردن متن
  const outerDownRef = useRef<EventTarget | null>(null);
  const formDownRef = useRef<EventTarget | null>(null);
  // آیا در این چرخه باز بودن مودال، یک بار init شده؟
  const initedRef = useRef(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const data = await listProviders();
      // eslint-disable-next-line no-console
      console.log("[admin] refreshed providers:", data.providers.map((p) => ({ id: p.id, enabled: p.enabled })));
      setProviders(data.providers);
      setMeta(data.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در دریافت فهرست");
    } finally {
      setLoading(false);
    }
  }

  // init فقط هنگام باز شدن (isOpen از false به true)
  useEffect(() => {
    if (isOpen && !initedRef.current) {
      initedRef.current = true;
      setError("");
      setTestResults({});
      setConfirmDeleteId(null);
      setRestoredNotice(false);
      void refresh();

      // بازگردانی draft اگر وجود دارد
      const persisted = loadDraft();
      if (persisted && persisted.mode === "create" && isDraftMeaningful(persisted.data)) {
        setDraft({ ...emptyForm, ...persisted.data });
        setForm({ kind: "create" });
        setRestoredNotice(true);
      } else if (persisted && persisted.mode === "edit" && persisted.editId) {
        // draft ویرایش را روی لیست ست می‌کنیم؛ بعد از refresh، provider مربوطه را پیدا و باز می‌کنیم
        setDraft({ ...emptyForm, ...persisted.data });
        setForm({ kind: "edit", provider: { ...(persisted.data as any), id: persisted.editId } as AdminProvider });
        setRestoredNotice(true);
      } else {
        setDraft(emptyForm);
        setForm({ kind: "closed" });
      }
    }
    if (!isOpen) {
      initedRef.current = false;
    }
  }, [isOpen]);

  // ذخیره خودکار draft در هر تغییر
  useEffect(() => {
    if (form.kind === "closed") {
      // اگر فرم بسته است، draft را نگه ندار
      saveDraft(null);
      return;
    }
    const mode = form.kind === "create" ? "create" : "edit";
    const editId = form.kind === "edit" ? form.provider.id : undefined;
    if (!isDraftMeaningful(draft)) {
      saveDraft(null);
      return;
    }
    saveDraft({ mode, editId, data: draft, savedAt: Date.now() });
  }, [form, draft]);

  if (!isOpen) return null;

  function openCreate() {
    // اگر draft «create» وجود دارد، پیشنهاد بازیابی
    const persisted = loadDraft();
    if (persisted && persisted.mode === "create" && isDraftMeaningful(persisted.data)) {
      setDraft({ ...emptyForm, ...persisted.data });
      setRestoredNotice(true);
    } else {
      setDraft(emptyForm);
      setRestoredNotice(false);
    }
    setFormError("");
    setForm({ kind: "create" });
  }

  function openEdit(p: AdminProvider) {
    const persisted = loadDraft();
    if (
      persisted && persisted.mode === "edit" && persisted.editId === p.id && isDraftMeaningful(persisted.data)
    ) {
      setDraft({ ...emptyForm, ...persisted.data });
      setRestoredNotice(true);
    } else {
      setDraft({
        id: p.id, name: p.name, type: p.type, baseUrl: p.baseUrl,
        apiKey: "", enabled: p.enabled, order: p.order,
      });
      setRestoredNotice(false);
    }
    setFormError("");
    setForm({ kind: "edit", provider: p });
  }

  function closeForm(clearDraft: boolean) {
    if (clearDraft) saveDraft(null);
    setRestoredNotice(false);
    setForm({ kind: "closed" });
  }

  async function submitForm() {
    setSaving(true);
    setFormError("");
    try {
      let updated: AdminProvider | null = null;
      if (form.kind === "create") {
        updated = await createProvider(draft);
      } else if (form.kind === "edit") {
        const payload: Partial<CreateProviderInput> = {
          name: draft.name,
          baseUrl: draft.baseUrl,
          enabled: draft.enabled,
          order: draft.order,
        };
        if (draft.apiKey && draft.apiKey.trim()) payload.apiKey = draft.apiKey.trim();
        updated = await updateProvider(form.provider.id, payload);
      }

      // به‌روزرسانی خوش‌بینانه (پاسخ سرور معتبر است)
      if (updated) {
        setProviders((prev) => {
          const idx = prev.findIndex((p) => p.id === updated!.id);
          if (idx === -1) return [...prev, updated!];
          const copy = [...prev];
          copy[idx] = updated!;
          return copy;
        });
      }

            saveDraft(null);
      setRestoredNotice(false);
      setForm({ kind: "closed" });

      // همگام‌سازی نهایی با سرور
      await refresh();
      await onProviderListChanged?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ذخیره ناموفق بود");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    try {
            await deleteProvider(id);
      // به‌روزرسانی خوش‌بینانه
      setProviders((prev) => prev.filter((p) => p.id !== id));
      setConfirmDeleteId(null);
      await refresh();
      await onProviderListChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حذف ناموفق بود");
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const result = await testProvider(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, latency: 0, error: err instanceof Error ? err.message : "خطا" },
      }));
    } finally {
      setTestingId(null);
    }
  }

  function handleOuterBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (outerDownRef.current !== e.currentTarget) return;
    // اگر فرم باز است، مودال را نبند
    if (form.kind !== "closed") return;
    onClose();
  }

  // کلیک روی backdrop فرم: به‌جای بستن، فقط پیام می‌دهد که با X یا انصراف ببندد
  function handleFormBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.target !== e.currentTarget) return;
    if (formDownRef.current !== e.currentTarget) return;
    // عمداً هیچ کاری نمی‌کنیم: کاربر باید صریحاً انصراف یا X بزند
    // این باعث می‌شود وقتی از پنجره دیگر برمی‌گردی و اشتباهی جای خالی کلیک کنی، فرم بسته نشود.
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { outerDownRef.current = e.target; }}
      onClick={handleOuterBackdropClick}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 860, width: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>مدیریت سرویس‌دهنده‌ها</h2>
            {meta && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>
                {meta.count} Provider • {meta.file}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="theme-btn"
              onClick={() => void refresh()}
              disabled={loading}
              title="بارگذاری مجدد"
              style={{ padding: 6, flex: "none", width: "auto" }}
            >
              <RefreshCw size={16} />
            </button>
            <button onClick={onClose} className="modal-close-btn" title="بستن"><X size={20} /></button>
          </div>
        </div>

        <div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>
          {error && (
            <div className="notice-message" style={{ marginBottom: 12, background: "#fff5f5", borderColor: "#feb2b2", color: "#c53030" }}>
              <AlertCircle size={14} /><span>{error}</span>
              <button onClick={() => setError("")}><X size={14} /></button>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>سرویس‌دهنده‌های ثبت‌شده</h3>
            <button
              className="theme-btn active"
              onClick={openCreate}
              style={{ padding: "6px 14px", fontSize: 12, flex: "none", width: "auto" }}
            >
              <Plus size={14} /> افزودن Provider
            </button>
          </div>

          {loading && providers.length === 0 && (
            <p style={{ textAlign: "center", color: "#888", fontSize: 13 }}>در حال بارگذاری...</p>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            {providers.map((p) => {
              const result = testResults[p.id];
              return (
                <div key={p.id} className="setting-card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 14 }}>{p.name}</strong>
                        <code style={{ fontSize: 11, background: "#f0f0f0", padding: "1px 6px", borderRadius: 4 }}>{p.id}</code>
                        {p.enabled
                          ? <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700 }}>فعال</span>
                          : <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700 }}>غیرفعال</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }} dir="ltr">{p.baseUrl}</div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                      <Key size={12} />
                      {p.hasApiKey
                        ? <span style={{ color: "#10b981" }} dir="ltr">{p.apiKeyPreview} ({p.apiKeySource})</span>
                        : <span style={{ color: "#c53030" }}>بدون کلید</span>}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className="theme-btn"
                      style={{ padding: "4px 10px", fontSize: 11, flex: "none", width: "auto" }}
                      onClick={() => void handleTest(p.id)}
                      disabled={testingId === p.id || !p.hasApiKey}
                      title={p.hasApiKey ? "تست اتصال" : "ابتدا کلید API تنظیم کن"}
                    >
                      {testingId === p.id ? "در حال تست..." : <><Zap size={12} /> تست</>}
                    </button>
                    <button
                      className="theme-btn"
                      style={{ padding: "4px 10px", fontSize: 11, flex: "none", width: "auto" }}
                      onClick={() => openEdit(p)}
                    >
                      <Pencil size={12} /> ویرایش
                    </button>
                    <button
                      className="theme-btn"
                      style={{
                        padding: "4px 10px", fontSize: 11, flex: "none", width: "auto",
                        color: confirmDeleteId === p.id ? "#fff" : "#c0392b",
                        background: confirmDeleteId === p.id ? "#c0392b" : undefined,
                      }}
                      onClick={() => void handleDelete(p.id)}
                    >
                      <Trash2 size={12} /> {confirmDeleteId === p.id ? "تأیید حذف" : "حذف"}
                    </button>
                    {confirmDeleteId === p.id && (
                      <button
                        className="theme-btn"
                        style={{ padding: "4px 10px", fontSize: 11, flex: "none", width: "auto" }}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        انصراف
                      </button>
                    )}
                  </div>

                  {result && (
                    <div style={{
                      fontSize: 11, padding: "6px 10px", borderRadius: 6,
                      background: result.success ? "#f0fdf4" : "#fef2f2",
                      color: result.success ? "#166534" : "#991b1b",
                      border: `1px solid ${result.success ? "#bbf7d0" : "#fecaca"}`,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      {result.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {result.success
                        ? `اتصال سالم • ${result.latency}ms • ${result.modelsCount ?? "?"} مدل`
                        : `خطا: ${result.error}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {form.kind !== "closed" && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => { formDownRef.current = e.target; e.stopPropagation(); }}
          onClick={handleFormBackdropClick}
          style={{ zIndex: 1000000 }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520, width: "92vw" }}
          >
            <div className="modal-header">
              <div>
                <h2 style={{ margin: 0 }}>{form.kind === "create" ? "افزودن Provider" : "ویرایش Provider"}</h2>
                {restoredNotice && (
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#4a7fd4", display: "flex", alignItems: "center", gap: 4 }}>
                    <Save size={11} /> پیش‌نویس قبلی بازیابی شد
                  </p>
                )}
              </div>
              <button
                onClick={() => !saving && closeForm(true)}
                className="modal-close-btn"
                disabled={saving}
                title="انصراف و پاک کردن پیش‌نویس"
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {formError && (
                <div className="notice-message" style={{ marginBottom: 12, background: "#fff5f5", borderColor: "#feb2b2", color: "#c53030" }}>
                  <AlertCircle size={14} /><span>{formError}</span>
                </div>
              )}

              <div className="setting-card">
                <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700 }}>شناسه (id)</label>
                <input
                  type="text"
                  value={draft.id}
                  onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  disabled={form.kind === "edit"}
                  placeholder="my-provider"
                  dir="ltr"
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd",
                    background: form.kind === "edit" ? "#f5f5f5" : "transparent", color: "inherit", fontSize: 13,
                  }}
                />
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#888" }}>حروف کوچک، عدد، - و _</p>
              </div>

              <div className="setting-card">
                <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700 }}>نام نمایشی</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="My Provider"
                  dir="ltr"
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd",
                    background: "transparent", color: "inherit", fontSize: 13,
                  }}
                />
              </div>

              <div className="setting-card">
                <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700 }}>Base URL</label>
                <input
                  type="text"
                  value={draft.baseUrl}
                  onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  dir="ltr"
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd",
                    background: "transparent", color: "inherit", fontSize: 13,
                  }}
                />
              </div>

              <div className="setting-card">
                <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700 }}>
                  API Key {form.kind === "edit" && <span style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>(خالی = بدون تغییر)</span>}
                </label>
                <input
                  type="password"
                  value={draft.apiKey || ""}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                  placeholder={form.kind === "edit" ? "برای تغییر، مقدار جدید وارد کن" : "sk-..."}
                  dir="ltr"
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd",
                    background: "transparent", color: "inherit", fontSize: 13,
                  }}
                />
              </div>

              <div className="setting-card">
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={draft.enabled !== false}
                    onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                  />
                  <span style={{ fontSize: 13 }}>فعال باشد</span>
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  className="theme-btn"
                  onClick={() => closeForm(true)}
                  disabled={saving}
                  style={{ padding: "8px 16px", flex: "none", width: "auto" }}
                >
                  انصراف
                </button>
                <button
                  className="theme-btn active"
                  onClick={() => void submitForm()}
                  disabled={saving}
                  style={{ padding: "8px 16px", flex: "none", width: "auto" }}
                >
                  {saving ? "در حال ذخیره..." : "ذخیره"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}