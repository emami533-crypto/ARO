import { X, Moon, Sun, Trash2, Bot, Monitor, Server, ChevronLeft } from "lucide-react";
import type { AppSettings } from "../types";

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  onClearData: () => void;
  onOpenProviderManager: () => void;
};

export function SettingsModal({ isOpen, onClose, settings, onUpdate, onClearData, onOpenProviderManager }: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>تنظیمات</h2>
          <button onClick={onClose} className="modal-close-btn"><X size={20} /></button>
        </div>

        <div className="modal-body">
          {/* کارت ۱: ظاهر */}
          <div className="setting-card">
            <div className="setting-card-header">
              <Monitor size={18} className="setting-icon" />
              <div>
                <h3>ظاهر برنامه</h3>
                <p className="setting-desc">رنگ‌بندی محیط کاری خود را انتخاب کنید.</p>
              </div>
            </div>
            <div className="theme-options">
              <button
                className={`theme-btn ${settings.theme === "light" ? "active" : ""}`}
                onClick={() => onUpdate({ ...settings, theme: "light" })}
              >
                <Sun size={18} /> روشن
              </button>
              <button
                className={`theme-btn ${settings.theme === "dark" ? "active" : ""}`}
                onClick={() => onUpdate({ ...settings, theme: "dark" })}
              >
                <Moon size={18} /> تاریک
              </button>
            </div>
          </div>

          {/* کارت ۲: دستیار */}
          <div className="setting-card">
            <div className="setting-card-header" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <Bot size={18} className="setting-icon" />
                <div>
                  <h3>آواتار دستیار</h3>
                  <p className="setting-desc">نمایش یا مخفی کردن ربات در صفحه</p>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.showAvatar !== false}
                  onChange={(e) => onUpdate({ ...settings, showAvatar: e.target.checked })}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {/* کارت ۳: مدیریت سرویس‌دهنده‌ها */}
          <div className="setting-card">
            <div className="setting-card-header" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <Server size={18} className="setting-icon" />
                <div>
                  <h3>مدیریت سرویس‌دهنده‌ها</h3>
                  <p className="setting-desc">افزودن، ویرایش، حذف و تست Providerهای هوش مصنوعی</p>
                </div>
              </div>
              <button
                className="theme-btn"
                onClick={onOpenProviderManager}
                style={{ flex: "none", width: "auto", padding: "6px 14px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                باز کردن <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          {/* کارت ۴: منطقه خطر */}
          <div className="setting-card danger-zone">
            <div className="setting-card-header">
              <Trash2 size={18} style={{ color: "#e04a4a" }} />
              <div>
                <h3 style={{ color: "#e04a4a" }}>منطقه خطر</h3>
                <p className="setting-desc">تمام پروژه‌ها و تنظیمات شما برای همیشه پاک خواهد شد.</p>
              </div>
            </div>
            <button className="danger-btn" onClick={onClearData}>
              پاک کردن کل داده‌ها
            </button>
          </div>

          <div className="app-version">
            ARO — نسخه ۰.۱.۰ (MVP)
          </div>
        </div>
      </div>
    </div>
  );
}