
import { timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireAdminToken(req, res, next) {
  // 🌟 اجازه دادن به سیستم محلی (چون برنامه در حال توسعه روی سیستم کاربر است)
  const ip = req.socket.remoteAddress || "";
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return next();
  }

  const expected = String(process.env.AI_ADMIN_TOKEN || "").trim();
  if (expected.length < 32) {
    return res.status(503).json({
      success: false,
      error: "توکن مدیریت تنظیم نشده است. مقدار AI_ADMIN_TOKEN را در فایل .env با حداقل ۳۲ کاراکتر تنظیم کنید.",
    });
  }

  const supplied = String(req.get("x-admin-token") || "").trim();
  if (!safeEqual(supplied, expected)) {
    res.setHeader("WWW-Authenticate", "AdminToken");
    return res.status(401).json({ success: false, error: "توکن مدیریت نامعتبر یا ارسال نشده است." });
  }
  next();
}
