# AI Playground — Master Product Vision & Technical Roadmap

**نسخه:** ۲.۰
**آخرین به‌روزرسانی:** ۱۷ آبان ۱۴۰۵
**مسیر پروژه:** `I:\Projects\AIPlayground`
**شعار:** One Workspace. Multiple AIs. One Continuous Project.

---

## فهرست

1. [معرفی پروژه](#۱-معرفی-پروژه)
2. [وضعیت فعلی](#۲-وضعیت-فعلی)
3. [معماری](#۳-معماری)
4. [نقشه راه](#۴-نقشه-راه)
5. [تصمیمات کلیدی](#۵-تصمیمات-کلیدی)
6. [بدهی‌های فنی](#۶-بدهیهای-فنی)
7. [اولویت‌های آینده](#۷-اولویتهای-آینده)

---

## ۱. معرفی پروژه

### هدف

ساخت یک پلتفرم جامع هوش مصنوعی با ترکیبی از قابلیت‌های:
- ChatGPT (چت چندمدلی)
- Claude (تحلیل، کدنویسی)
- Bolt.new (ساخت پروژه)
- Cursor (محیط توسعه)
- Hugging Face Chat (تنوع مدل)

### مخاطب

- **اولیه:** کاربران ایرانی (RTL، فارسی)
- **آینده:** بازار بین‌المللی

### محدودیت‌های اصلی

- توسعه تقریباً انفرادی (با کمک AI)
- بودجه ماهانه صفر برای نیروی انسانی
- ابتدا سرویس‌های رایگان/کم‌هزینه
- بدون GPU اختصاصی یا سرور دائمی

### مزیت رقابتی هدف

| مزیت | توضیح |
|---|---|
| **آزادی انتخاب مدل** | کاربر هر Provider را می‌تواند اضافه/حذف کند |
| **تحویل محصول واقعی** | EXE، APK، API — بدون نیاز به GitHub |
| **تداوم پروژه** | حافظه مشترک بین مدل‌ها |
| **فارسی اول** | RTL کامل، پشتیبانی native |
| **اقتصادی** | بهینه‌سازی هزینه در همه لایه‌ها |
| **مالکیت کاربر** | خروجی کامل، بدون قفل شدن |

---

## ۲. وضعیت فعلی

### ✅ انجام شده

| مرحله | قابلیت | تاریخ |
|---|---|---|
| صفر | Provider Registry ماژولار | آبان ۱۴۰۵ |
| صفر | CORS، Rate Limit، اعتبارسنجی ورودی | آبان ۱۴۰۵ |
| صفر | `/api/health` با configuredProviders | آبان ۱۴۰۵ |
| صفر | Model Capabilities استاندارد | آبان ۱۴۰۵ |
| صفر | اعتبارسنجی تصویر و attachment | آبان ۱۴۰۵ |
| یک | CRUD API برای Providerها | ۱۷ آبان ۱۴۰۵ |
| یک | `providers.json` داینامیک | ۱۷ آبان ۱۴۰۵ |
| یک | امنیت کلید (`apiKeyPreview`) | ۱۷ آبان ۱۴۰۵ |
| یک | UI مدیریت Provider در تنظیمات | ۱۷ آبان ۱۴۰۵ |
| یک | رفع باگ cache در UI | ۱۷ آبان ۱۴۰۵ |
| یک | Persistence draft در فرم | ۱۷ آبان ۱۴۰۵ |
| دو | Usage Tracking (`usage-log.jsonl`) | ۱۷ آبان ۱۴۰۵ |
| دو | Model Router با ۵ استراتژی | ۱۷ آبان ۱۴۰۵ |
| دو | Fallback قابل مشاهده | ۱۷ آبان ۱۴۰۵ |
| دو | Retry هوشمند با backoff | ۱۷ آبان ۱۴۰۵ |
| دو | Token Tracking (stream_options) | ۱۷ آبان ۱۴۰۵ |

### 🔄 در حال حاضر فعال

- **Aval AI**: ۶۶–۸۳٪ موفقیت، latency ۳.۱ ثانیه، هزینه بسیار کم
- **Mistral**: ۷۰٪ موفقیت، latency ۸۲ ثانیه (کند)
- **OpenRouter**: ۱۷٪ موفقیت (موجودی کم)
- **OpenAI**: ۰٪ (سهمیه محدود 429)
- **1xAI**: ۰٪ (موجودی کم)
- **xKiro**: ۵۰٪

### 📊 آمار فعلی

```
Total requests: 37
Success rate: 40.5%
Avg latency: 42s
P50 latency: 3.3s
P95 latency: 286s
Requests with fallback: 7
```

---

## ۳. معماری

### معماری فعلی

```
┌─────────────────────────────────────────┐
│         Frontend (React + Vite)         │
│  ┌──────────────────────────────────┐   │
│  │  App.tsx                          │   │
│  │  ├─ Chat Panel                    │   │
│  │  ├─ Workspace Panel               │   │
│  │  ├─ Code Editor (CodeMirror)      │   │
│  │  └─ Preview (iframe)              │   │
│  ├─ Components                       │   │
│  │  ├─ ProviderManagerModal          │   │
│  │  ├─ SettingsModal                 │   │
│  │  ├─ CodeEditor                    │   │
│  │  └─ AvatarLayer                   │   │
│  └─ Lib                              │   │
│     ├─ storage (IndexedDB)           │   │
│     └─ adminApi                      │   │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│      Backend (Node + Express)           │
│  ┌──────────────────────────────────┐   │
│  │  server/index.js                 │   │
│  │  ├─ /api/chat                    │   │
│  │  ├─ /api/models                  │   │
│  │  ├─ /api/health                  │   │
│  │  └─ /api/admin/*                 │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  providers/                       │   │
│  │  ├─ loader.js                    │   │
│  │  ├─ definitions.js               │   │
│  │  ├─ capabilities.js              │   │
│  │  ├─ admin-router.js              │   │
│  │  └─ adapters/openai-compatible   │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  router/                          │   │
│  │  ├─ index.js (resolve+plan)      │   │
│  │  ├─ strategies.js                │   │
│  │  ├─ config.js                    │   │
│  │  └─ admin-router.js              │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  usage/                           │   │
│  │  ├─ store.js (JSONL)             │   │
│  │  ├─ aggregator.js                │   │
│  │  └─ admin-router.js              │   │
│  └──────────────────────────────────┘
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         External AI Providers           │
│  Aval AI • Mistral • OpenRouter • Groq  │
│  1xAI • xKiro • OpenAI • Cloudflare     │
└─────────────────────────────────────────┘
```

### ذخیره‌سازی

| داده | محل | فرمت |
|---|---|---|
| پروژه‌ها | IndexedDB (مرورگر) | JSON |
| Snapshots | IndexedDB (مرورگر) | JSON |
| تنظیمات | IndexedDB + localStorage | JSON |
| `providers.json` | Backend | JSON |
| `usage-log.jsonl` | Backend | JSONL |
| `router-config.json` | Backend | JSON |
| Draft فرم | localStorage | JSON |

### معماری هدف (بلندمدت)

- **Modular Monolith** → رشد تدریجی به Microservices در صورت نیاز
- **IndexedDB → PostgreSQL** در نسخه SaaS
- **Local files → S3/R2** برای assets
- **Provider Plugin architecture** برای افزودن سرویس جدید بدون کد

---

## ۴. نقشه راه

### مرحله ۰ — تثبیت و امنیت ✅

- [x] اصلاح کلیدهای API
- [x] حذف Secrets از آرشیو
- [x] CORS و Rate Limit
- [x] اعتبارسنجی ورودی
- [x] Timeout و Cancellation
- [x] Health Endpoint

### مرحله ۱ — هسته AI ✅

- [x] Provider Registry
- [x] Model Capabilities
- [x] Model Router (۵ استراتژی)
- [x] Fallback کنترل‌شده
- [x] Retry با Backoff
- [x] Usage Tracking
- [x] Token Tracking
- [x] UI مدیریت Provider

### مرحله ۲ — بهینه‌سازی هزینه 🎯 (اولویت بالا)

**هدف: کاهش ۵۰–۸۰٪ هزینه API بدون افت کیفیت**

| زیرمرحله | قابلیت | تخمین | اثر |
|---|---|---|---|
| ۲.۱ | Semantic Caching | ۱ پیام | ۳۰–۵۰٪ در سوالات تکراری |
| ۲.۲ | Prompt Squeezing | ۱ پیام | ۱۰–۳۵٪ کاهش ورودی |
| ۲.۳ | System Prompt Optimizer | نیم پیام | ۲۰–۴۰٪ کاهش خروجی |
| ۲.۴ | Prompt Caching | ۱ پیام | ۹۰٪ در prompts تکراری |
| ۲.۵ | Complexity-based Routing | ۱–۲ پیام | ۵۰–۸۰٪ صرفه‌جویی |
| ۲.۶ | Cost Tracking UI | ۱ پیام | شفافیت بودجه |

**ترتیب اجرای پیشنهادی:**
1. System Prompt Optimizer (سریع‌ترین بازدهی)
2. Complexity Routing
3. Semantic Caching
4. Prompt Squeezing
5. Prompt Caching
6. Cost UI

**تخمین کل:** ۵–۷ پیام

### مرحله ۳ — حافظه و Context پروژه

- [ ] ۳.۱ انتخاب هوشمند فایل‌ها (بر اساس relevance)
- [ ] ۳.۲ Chunking پروژه‌های بزرگ
- [ ] ۳.۳ خلاصه‌سازی خودکار تاریخچه
- [ ] ۳.۴ Context Window آگاه از مدل
- [ ] ۳.۵ Backup خودکار هر ۵ دقیقه
- [ ] ۳.۶ Export/Import کامل

**تخمین:** ۲–۳ پیام

### مرحله ۴ — چندرسانه‌ای

- [x] Vision (پیاده‌سازی اولیه)
- [ ] Video Understanding
- [ ] Audio Input (Whisper-compatible)
- [ ] Audio Output (TTS)
- [ ] Image Generation (اولویت پایین)

**تخمین:** ۲–۳ پیام

### مرحله ۵ — محیط توسعه (در حال پیاده‌سازی)

- [x] زیرساخت اولیه Docker Sandbox، شبکه داخلی و محدودیت منابع
- [x] API ایجاد/حذف محیط، همگام‌سازی فایل، نصب کنترل‌شده وابستگی‌ها و اجرای دستور
- [x] Terminal داخلی و لاگ اجرای پروژه
- [x] Preview از طریق پراکسی Backend
- [ ] تست عملی Docker روی سیستم توسعه‌دهنده
- [ ] همگام‌سازی دوطرفه فایل‌های تغییرکرده داخل کانتینر
- [ ] کنترل خروجی شبکه و سیاست امنیتی سخت‌گیرانه‌تر
- [ ] Debug tools

**نکته:** تا پیش از تست عملی و تکمیل سیاست شبکه، این Sandbox فقط برای توسعه محلی و پروژه‌های مورد اعتماد است.

### مرحله ۶ — Skills/Plugins/Connectors

- [ ] معماری Skills
- [ ] Plugin system
- [ ] Connectors (GitHub, Google, etc.)
- [ ] Workflow Builder

**تخمین:** ۳–۵ پیام

### مرحله ۷ — Build Engine 🎯

**قابلیت متمایزکننده: ساخت EXE و APK از داخل پلتفرم**

- [ ] تشخیص نوع پروژه
- [ ] Build Server
- [ ] خروجی Windows (Tauri)
- [ ] خروجی Android (Capacitor)
- [ ] خروجی API

**تخمین:** ۴–۶ پیام

### مرحله ۸ — تست کاربران

- [ ] تست با ۳ کاربر
- [ ] ۵–۷ سناریوی واقعی
- [ ] اصلاح باگ‌ها

**تخمین:** ۱ پیام

### مرحله ۹ — حساب کاربری و اقتصاد

- [ ] Authentication
- [ ] PostgreSQL
- [ ] Usage per user
- [ ] Quota & Wallet
- [ ] Subscription
- [ ] Public API

**تخمین:** ۴–۶ پیام

### مرحله ۱۰ — انتشار عمومی

- [ ] دامنه و هاست امن
- [ ] مستندات
- [ ] مانیتورینگ
- [ ] تست بار

**تخمین:** ۲–۴ پیام

### مرحله ۱۱ — آواتار سه‌بعدی (بلندمدت)

- [ ] انتخاب مدل GLB
- [ ] Three.js / React Three Fiber
- [ ] Lip Sync
- [ ] STT + TTS
- [ ] تعامل صوتی زنده

**تخمین:** ۴–۶ پیام

---

## ۵. تصمیمات کلیدی

### D-001: استفاده از Aval AI به عنوان Provider اصلی

**تاریخ:** ۱۷ آبان ۱۴۰۵
**دلیل:** تنها Provider با موفقیت ۸۳٪ در تست، هزینه بسیار کم، فارسی-friendly
**هزینه:** deepseek-flash ≈ $0.0006 به ازای هر پیام

### D-002: معماری Modular Monolith (نه Microservices)

**تاریخ:** آبان ۱۴۰۵
**دلیل:** توسعه انفرادی، بودجه صفر
**بازنگری:** در صورت رشد به SaaS با کاربران > ۱۰,۰۰۰

### D-003: ذخیره‌سازی IndexedDB در MVP

**تاریخ:** آبان ۱۴۰۵
**دلیل:** بدون نیاز به Backend برای داده‌های کاربر
**مهاجرت:** در مرحله ۹ به PostgreSQL

### D-004: Providerها در `providers.json` (نه `.env`)

**تاریخ:** ۱۷ آبان ۱۴۰۵
**دلیل:** امکان مدیریت از UI بدون restart
**امنیت:** `providers.json` در `.gitignore`، `apiKeyPreview` در API

### D-005: کلیدها فقط در Backend

**تاریخ:** ۱۷ آبان ۱۴۰۵
**دلیل:** جلوگیری از سرقت کلید از مرورگر
**پیاده‌سازی:** Frontend هرگز `apiKey` خام نمی‌بیند

### D-006: Router با ۵ استراتژی (نه یکی)

**تاریخ:** ۱۷ آبان ۱۴۰۵
**دلیل:** نیازهای مختلف (سرعت/کیفیت/هزینه/vision)
**پیش‌فرض:** `auto-balanced`

### D-007: Usage Tracking با JSONL (نه SQLite)

**تاریخ:** ۱۷ آبان ۱۴۰۵
**دلیل:** سادگی، بدون نیاز به dependency، چرخش خودکار
**محدودیت:** چرخش هر ۱۰,۰۰۰ رکورد
**آینده:** در صورت نیاز، به SQLite یا PostgreSQL

### D-008: Retry هوشمند فقط برای 429/5xx

**تاریخ:** ۱۷ آبان ۱۴۰۵
**دلیل:** 400/401/402/403 نباید retry شوند (مشکل دائمی)
**پیاده‌سازی:** `RETRY_DELAYS_MS = [1000, 3000]`

---

## ۶. بدهی‌های فنی

### 🔴 بحرانی

| # | مورد | اثر | اولویت |
|---|---|---|---|
| ۱ | `App.tsx` حدود ۲۴۰۰ خط | نگهداری سخت | متوسط |
| ۲ | `server/index.js` بزرگ | خوانایی کم | متوسط |
| ۳ | OpenAI همیشه 429 | Provider غیرقابل استفاده | پایین (جایگزین شده) |
| ۴ | 1xAI همیشه 402 | Provider غیرقابل استفاده | پایین |
| ۵ | فونت‌های Vazirmatn 404 | ظاهر سیستم fallback | پایین |
| ۶ | چند modal با backdrop-click قدیمی | UX ناسازگار | پایین |

### 🟡 متوسط

| # | مورد | اثر |
|---|---|---|
| ۷ | Token tracking فقط برای OpenAI-compatible | OpenRouter/Mistral صفر |
| ۸ | `usage-log.jsonl` بدون ایندکس | جستجو کند در حجم بالا |
| ۹ | بدون تست خودکار | خطر regression |
| ۱۰ | بدون TypeScript در Backend | خطاهای runtime |

### 🟢 کم‌اهمیت

| # | مورد | اثر |
|---|---|---|
| ۱۱ | README هنوز پیش‌فرض Vite | مستندات ناقص |
| ۱۲ | AvatarLayer فقط SVG | قابلیت محدود |
| ۱۳ | بدون PWA | تجربه موبایل |

---

## ۷. اولویت‌های آینده

### کوتاه‌مدت (۱–۲ هفته)

1. **مرحله ۳ — حافظه و Context**
   - انتخاب هوشمند فایل‌ها
   - خلاصه‌سازی تاریخچه
   - Backup خودکار

2. **مرحله ۲ — بهینه‌سازی هزینه**
   - System Prompt Optimizer
   - Complexity Routing
   - Semantic Caching

**ترتیب پیشنهادی:** مرحله ۳ اول (چون Context بحرانی‌تر است)، بعد مرحله ۲.

### میان‌مدت (۱–۲ ماه)

3. **مرحله ۴ — چندرسانه‌ای**
4. **مرحله ۵ — Sandbox**
5. **مرحله ۶ — Skills**

### بلندمدت (۳–۶ ماه)

6. **مرحله ۷ — Build Engine**
7. **مرحله ۸ — تست کاربران**
8. **مرحله ۹ — اقتصاد**
9. **مرحله ۱۰ — انتشار**

---

## ۸. اصول توسعه

### قوانین طلایی

1. **هرگز فایل سالم را بازنویسی نکن**
2. **تغییرات مرحله‌ای، هر مرحله تست‌شده**
3. **قبل از هر تغییر، سورس بررسی شود**
4. **کلیدها فقط در Backend**
5. **`.env` و `providers.json` از Git خارج**
6. **API Key در Frontend نه**
7. **هر Endpoint جدید: smoke test ساده**
8. **در هر modal: backdrop-click امن با mousedown tracking**
9. **در هر GET admin: `no-store` + `?_t=`**
10. **پس از هر مرحله: ZIP بدون `node_modules`, `dist`, `.env`**

### Workflow

```
1. بررسی سورس فعلی
2. طراحی تغییرات
3. پیاده‌سازی فایل‌های کامل
4. node --check (Backend)
5. npm run dev (Frontend)
6. تست دستی + PowerShell
7. تأیید نتیجه
8. ثبت در سند مادر (این فایل)
9. ZIP به‌روز
```

### Storage Rules

- **IndexedDB**: پروژه‌ها، snapshots، تنظیمات
- **localStorage**: draft فرم، auto mode، strategy
- **Backend JSON**: `providers.json`, `usage-log.jsonl`, `router-config.json`
- **`.gitignore`**: `.env*`, `server/data/providers.json`, `server/data/usage-log.jsonl*`

---

## ۹. لینک‌ها و منابع

### خارجی

- Aval AI: https://avalai.ir
- OpenRouter: https://openrouter.ai
- Mistral: https://console.mistral.ai
- Groq: https://console.groq.com
- OpenAI: https://platform.openai.com

### داخلی

- `server/data/providers.json` — تعریف Providerها
- `server/data/router-config.json` — تنظیمات Router
- `server/data/usage-log.jsonl` — لاگ مصرف
- `src/App.tsx` — قلب Frontend
- `server/index.js` — قلب Backend

### مستندات کد

- `server/providers/*` — لایه Provider
- `server/router/*` — لایه Router
- `server/usage/*` — لایه Usage
- `src/lib/adminApi.ts` — API Client
- `src/lib/storage.ts` — IndexedDB

---

## ۱۰. تغییرات این سند

| نسخه | تاریخ | تغییرات |
|---|---|---|
| ۱.۰ | آبان ۱۴۰۵ | نسخه اول (چت ۱–۳) |
| ۲.۰ | ۱۷ آبان ۱۴۰۵ | افزودن مرحله ۲ (بهینه‌سازی هزینه)، به‌روزرسانی وضعیت |

---

**پایان سند**

---

## راهنمای استفاده

این سند را در هر چت جدید به‌عنوان مرجع بارگذاری کن. هر بار که مرحله‌ای کامل شد، این فایل را به‌روز کن:

1. چک‌باکس مربوطه را تیک بزن
2. وضعیت فعلی را به‌روز کن
3. تصمیمات جدید را اضافه کن
4. بدهی‌های فنی حل‌شده را حذف کن
5. نسخه و تاریخ را افزایش بده