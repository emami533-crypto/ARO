// src/components/UsageDashboard.tsx
import { useCallback, useEffect, useState } from "react";
import {
  X, RefreshCw, TrendingDown, Zap, MessageSquare, DollarSign,
  CheckCircle2, AlertCircle, Download,
} from "lucide-react";
import {
  getSummary, getByModel, getByTier, getRecent,
  type UsageSummary, type ModelStat, type TierStat, type UsageRecord,
} from "../lib/usageApi";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const TIER_LABELS: Record<string, string> = {
  local: "local",
  free: "free",
  economic: "economic",
  premium: "premium",
  "premium-max": "premium-max",
  "(unknown)": "نامشخص",
};

const TIER_COLORS: Record<string, string> = {
  local: "#10b981",
  free: "#4a7fd4",
  economic: "#f59e0b",
  premium: "#f97316",
  "premium-max": "#ef4444",
  "(unknown)": "#94a3b8",
};

const PERIOD_OPTIONS = [
  { value: 1, label: "۱ ساعت" },
  { value: 24, label: "۲۴ ساعت" },
  { value: 168, label: "۷ روز" },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number | undefined | null): string {
  if (!n || n <= 0) return "$۰";
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  return `$${n.toFixed(6)}`;
}

function formatLatency(ms: number): string {
  if (!ms || ms <= 0) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function UsageDashboard({ isOpen, onClose }: Props) {
  const [period, setPeriod] = useState<number>(24);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byModel, setByModel] = useState<ModelStat[]>([]);
  const [byTier, setByTier] = useState<TierStat[]>([]);
  const [recent, setRecent] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, m, t, r] = await Promise.all([
        getSummary(period),
        getByModel(period),
        getByTier(period),
        getRecent(100),
      ]);
      setSummary(s.summary);
      setByModel(m.models);
      setByTier(t.tiers);
      setRecent(r.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در دریافت داده‌ها");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  // ─── محاسبه‌ی صرفه‌جویی تخمینی ───
  const recordsWithCost = recent.filter((r) => r.cost != null && r.cost > 0);
  const actualCost = recordsWithCost.reduce((s, r) => s + (r.cost || 0), 0);
  const premiumRecords = recordsWithCost.filter(
    (r) => r.complexityTier === "premium" || r.complexityTier === "premium-max"
  );
  const avgPremiumCost =
    premiumRecords.length > 0
      ? premiumRecords.reduce((s, r) => s + (r.cost || 0), 0) / premiumRecords.length
      : 0;
  const hypotheticalCost = avgPremiumCost * recordsWithCost.length;
  const savingsPercent =
    hypotheticalCost > 0
      ? Math.max(0, Math.round((1 - actualCost / hypotheticalCost) * 100))
      : 0;

  const totalTierCount = byTier.reduce((s, t) => s + t.count, 0) || 1;

  function handleDownload() {
    const blob = new Blob([JSON.stringify({ summary, byModel, byTier, recent }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-${period}h-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usage-dashboard" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="usage-dashboard-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📊 داشبورد مصرف و هزینه</h2>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#888" }}>
              {loading ? "در حال بارگذاری..." : `بازه: ${PERIOD_OPTIONS.find(p => p.value === period)?.label || ""}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="usage-action-btn"
              onClick={() => void load()}
              disabled={loading}
              title="بازخوانی"
            >
              <RefreshCw size={14} className={loading ? "spin-slow" : ""} />
            </button>
            <button
              className="usage-action-btn"
              onClick={handleDownload}
              title="دانلود JSON"
            >
              <Download size={14} />
            </button>
            <button className="modal-close-btn" onClick={onClose} title="بستن">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="usage-dashboard-body">
          {/* Period filter */}
          <div className="usage-period-filter">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`usage-period-btn ${period === opt.value ? "active" : ""}`}
                onClick={() => setPeriod(opt.value)}
                disabled={loading}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="usage-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* KPI Cards */}
          <div className="usage-kpi-grid">
            <div className="usage-kpi-card">
              <div className="usage-kpi-icon"><MessageSquare size={16} /></div>
              <div className="usage-kpi-value">{summary?.total ?? "—"}</div>
              <div className="usage-kpi-label">کل درخواست‌ها</div>
            </div>
            <div className="usage-kpi-card">
              <div className="usage-kpi-icon" style={{ color: "#10b981" }}><CheckCircle2 size={16} /></div>
              <div className="usage-kpi-value">{summary ? `${summary.successRate}%` : "—"}</div>
              <div className="usage-kpi-label">نرخ موفقیت</div>
            </div>
            <div className="usage-kpi-card">
              <div className="usage-kpi-icon" style={{ color: "#f59e0b" }}><Zap size={16} /></div>
              <div className="usage-kpi-value">{summary ? formatNumber(summary.totalTokens) : "—"}</div>
              <div className="usage-kpi-label">کل توکن</div>
            </div>
            <div className="usage-kpi-card">
              <div className="usage-kpi-icon" style={{ color: "#4a7fd4" }}><DollarSign size={16} /></div>
              <div className="usage-kpi-value">{formatCost(summary?.totalCost)}</div>
              <div className="usage-kpi-label">هزینه کل</div>
            </div>
          </div>

          {/* Tier Distribution */}
          <div className="usage-section">
            <div className="usage-section-title">توزیع Tier (بر اساس پیچیدگی)</div>
            {byTier.length === 0 ? (
              <p className="usage-empty">داده‌ای موجود نیست</p>
            ) : (
              <div className="usage-bars">
                {byTier
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((tier) => {
                    const label = TIER_LABELS[tier.complexityTier] ?? tier.complexityTier;
                    const color = TIER_COLORS[tier.complexityTier] ?? "#94a3b8";
                    const pct = Math.round((tier.count / totalTierCount) * 100);
                    return (
                      <div key={tier.complexityTier} className="usage-bar-row">
                        <div className="usage-bar-label">
                          <span style={{ color }}>{label}</span>
                        </div>
                        <div className="usage-bar-track">
                          <div
                            className="usage-bar-fill"
                            style={{ width: `${Math.max(2, pct)}%`, background: color }}
                          />
                        </div>
                        <div className="usage-bar-value">
                          {pct}% <span style={{ opacity: 0.6 }}>({tier.count})</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Savings Card */}
          {premiumRecords.length > 0 && (
            <div className="usage-section usage-savings-card">
              <div className="usage-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <TrendingDown size={16} color="#10b981" /> صرفه‌جویی تخمینی
              </div>
              <p className="usage-savings-desc">
                اگر همه‌ی درخواست‌ها به مدل‌های premium می‌رفتند، هزینه‌ی تقریبی:{" "}
                <strong>${hypotheticalCost.toFixed(4)}</strong>
                <br />
                با Router فعلی: <strong>${actualCost.toFixed(4)}</strong>
              </p>
              <div className="usage-savings-value">
                صرفه‌جویی: {savingsPercent}%
              </div>
              <p style={{ fontSize: 10, color: "#888", margin: "4px 0 0" }}>
                * محاسبه بر اساس {recordsWithCost.length} رکورد اخیر با هزینه‌ی مشخص
              </p>
            </div>
          )}

          {/* Top Models */}
          <div className="usage-section">
            <div className="usage-section-title">Top 10 مدل‌ها</div>
            {byModel.length === 0 ? (
              <p className="usage-empty">داده‌ای موجود نیست</p>
            ) : (
              <div className="usage-table-wrapper">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>مدل</th>
                      <th>درخواست</th>
                      <th>موفقیت</th>
                      <th>میانگین پاسخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byModel.slice(0, 10).map((m) => (
                      <tr key={m.model}>
                        <td style={{ fontFamily: "var(--font-family-code)", fontSize: 11 }} dir="ltr">
                          {m.model}
                        </td>
                        <td>{m.count}</td>
                        <td style={{ color: m.successRate >= 90 ? "#10b981" : m.successRate >= 50 ? "#f59e0b" : "#ef4444" }}>
                          {m.successRate}%
                        </td>
                        <td>{formatLatency(m.avgLatencyMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Records */}
          <div className="usage-section">
            <div className="usage-section-title">آخرین رکوردها</div>
            {recent.length === 0 ? (
              <p className="usage-empty">داده‌ای موجود نیست</p>
            ) : (
              <div className="usage-table-wrapper">
                <table className="usage-table usage-table-compact">
                  <thead>
                    <tr>
                      <th>زمان</th>
                      <th>مدل</th>
                      <th>Provider</th>
                      <th>tier</th>
                      <th>توکن</th>
                      <th>هزینه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.slice(0, 20).map((r) => (
                      <tr key={r.id} style={{ opacity: r.status === "success" ? 1 : 0.6 }}>
                        <td>{formatTime(r.timestamp)}</td>
                        <td style={{ fontFamily: "var(--font-family-code)", fontSize: 10 }} dir="ltr">
                          {r.model}
                        </td>
                        <td style={{ fontSize: 10 }}>{r.provider}</td>
                        <td style={{ color: TIER_COLORS[r.complexityTier || "(unknown)"] || "#666" }}>
                          {r.complexityTier || "—"}
                        </td>
                        <td>{r.totalTokens ?? "—"}</td>
                        <td>{r.cost != null ? formatCost(r.cost) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}