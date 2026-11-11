import { useState, useEffect } from "react";
import { motion } from "framer-motion";

type AvatarMood = "idle" | "happy" | "thinking" | "surprised" | "sad";

export function AvatarLayer({ mood = "idle" }: { mood?: AvatarMood }) {
  const [mounted, setMounted] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    setMounted(true);

    // پلک زدن تصادفی
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, 4000);

    // چرخش تصادفی دور خودش (هر ۱۰ ثانیه)
    const spinInterval = setInterval(() => {
      setIsSpinning(true);
      setTimeout(() => setIsSpinning(false), 1000); // چرخش ۱ ثانیه‌ای
    }, 10000);

    return () => {
      clearInterval(blinkInterval);
      clearInterval(spinInterval);
    };
  }, []);

  if (!mounted) return null;

  const isThinking = mood === "thinking";

  // هندل کردن کلیک (پریدن)
  const handleClick = () => {
    if (isJumping) return;
    setIsJumping(true);
    setTimeout(() => setIsJumping(false), 600); // مدت زمان پرش
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragConstraints={{ left: 0, right: window.innerWidth - 150, top: 0, bottom: window.innerHeight - 150 }}
      // انیمیشن‌های کلی ربات (شناور بودن، پریدن، چرخیدن)
      animate={{
        y: isJumping ? [0, -100, 0] : [0, -10, 0], // پرش یا شناور بودن
        rotateY: isSpinning ? 360 : 0, // چرخش دور خودش
        rotateZ: [0, 2, -2, 0], // تکان ملایم به چپ و راست
      }}
      transition={{
        y: { duration: isJumping ? 0.6 : 3, repeat: isJumping ? 0 : Infinity, ease: "easeInOut" },
        rotateY: { duration: 1, ease: "easeInOut" },
        rotateZ: { duration: 4, repeat: Infinity, ease: "easeInOut" }
      }}
      onClick={handleClick}
      whileHover={{ scale: 1.05 }}
      whileDrag={{ scale: 1.1, cursor: "grabbing" }}
      style={{
        position: "fixed",
        zIndex: 999999,
        cursor: "grab",
        bottom: 30,
        right: 30,
        width: 140,
        height: 160,
        filter: "drop-shadow(0 25px 35px rgba(0,0,0,0.2))",
        perspective: 1000, // برای درست کار کردن چرخش سه بعدی
      }}
      title="کلیک کن تا بپرم!"
    >
      <svg viewBox="0 0 160 200" width="100%" height="100%">
        <defs>
          {/* گرادیانت‌های سه بعدی */}
          <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <linearGradient id="visorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="jointGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          {/* افکت درخشش چشم‌ها */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* سایه زیر ربات */}
        <ellipse cx="80" cy="190" rx="40" ry="10" fill="rgba(0,0,0,0.1)" />

        {/* دست چپ (با انیمیشن موج دادن) */}
        <motion.g
          style={{ originX: "45px", originY: "115px" }}
          animate={{ rotate: [0, 20, -20, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <path d="M 50 115 Q 15 115 15 85" stroke="url(#bodyGrad)" strokeWidth="12" strokeLinecap="round" fill="none" />
          <circle cx="15" cy="85" r="8" fill="url(#jointGrad)" />
          {/* دستکش سفید */}
          <rect x="5" y="65" width="20" height="20" rx="10" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
        </motion.g>

        {/* دست راست (با انیمیشن موج دادن، هماهنگ با چپ) */}
        <motion.g
          style={{ originX: "115px", originY: "115px" }}
          animate={{ rotate: [0, -20, 20, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        >
          <path d="M 110 115 Q 145 115 145 85" stroke="url(#bodyGrad)" strokeWidth="12" strokeLinecap="round" fill="none" />
          <circle cx="145" cy="85" r="8" fill="url(#jointGrad)" />
          <rect x="135" y="65" width="20" height="20" rx="10" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
        </motion.g>

        {/* بدنه */}
        <rect x="45" y="100" width="70" height="70" rx="30" fill="url(#bodyGrad)" />
        <rect x="60" y="95" width="40" height="15" rx="5" fill="url(#jointGrad)" /> {/* گردن */}

        {/* سر */}
        <rect x="25" y="30" width="110" height="75" rx="35" fill="url(#bodyGrad)" />
        
        {/* گوشی هدفون */}
        <rect x="125" y="45" width="15" height="30" rx="7" fill="url(#jointGrad)" />
        <rect x="20" y="45" width="15" height="30" rx="7" fill="url(#jointGrad)" />

        {/* صفحه نمایش (ویزیور) */}
        <rect x="35" y="40" width="90" height="55" rx="25" fill="url(#visorGrad)" />
        
        {/* انعکاس شیشه */}
        <path d="M 45 45 Q 80 40 115 45" stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* چشم‌ها */}
        <g filter="url(#glow)">
          {isBlinking ? (
            <>
              <line x1="55" y1="65" x2="70" y2="65" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
              <line x1="90" y1="65" x2="105" y2="65" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
            </>
          ) : isThinking ? (
            <>
              <rect x="55" y="63" width="15" height="5" rx="2.5" fill="#22d3ee" />
              <rect x="90" y="63" width="15" height="5" rx="2.5" fill="#22d3ee" />
            </>
          ) : (
            <>
              <circle cx="62" cy="65" r="6" fill="#22d3ee" />
              <circle cx="98" cy="65" r="6" fill="#22d3ee" />
            </>
          )}
        </g>

        {/* دهان (با انیمیشن باز و بسته شدن برای صحبت) */}
        <g>
          {mood === "surprised" ? (
            <circle cx="80" cy="85" r="5" fill="#22d3ee" opacity="0.8" />
          ) : isThinking ? (
            // انیمیشن صحبت کردن (دهان باز و بسته می‌شود)
            <motion.ellipse
              cx="80" cy="85" rx="8" ry="2" fill="#22d3ee" opacity="0.8"
              animate={{ ry: [2, 8, 2, 6, 2] }}
              transition={{ duration: 0.4, repeat: Infinity }}
            />
          ) : (
            // لبخند ملایم در حالت عادی
            <path d="M 70 82 Q 80 90 90 82" stroke="#22d3ee" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
          )}
        </g>

        {/* لوگوی روی سینه */}
        <path d="M 70 135 Q 80 125 90 135" stroke="#94a3b8" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="80" cy="145" r="3" fill="#94a3b8" />
      </svg>
    </motion.div>
  );
}