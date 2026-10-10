"use client";

import { useState, useEffect } from "react";

// ── Confetti animation for sale complete ──────────────────────────────────────

export function SaleConfetti() {
  const colors = ["var(--accent)", "#ff6b5b", "#14C2C2", "#e63946"];
  // Pre-compute random values to avoid impure function calls during render
  const pieces = useState(() =>
    Array.from({ length: 20 }).map((_, i) => ({
      color: colors[i % colors.length],
      left: ((i * 37 + 13) % 100),
      delay: (i * 0.025),
      size: 6 + (i % 3) * 3,
      rotation: (i * 47) % 360,
      drift: i % 2 === 0 ? 40 : -40,
    }))
  )[0];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-sm"
          style={{
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            top: -10,
            transform: `rotate(${p.rotation}deg)`,
            animation: `confetti-fall-${i % 2} 2s ${p.delay}s ease-out forwards`,
            opacity: 0,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall-0 {
          0% { opacity: 1; top: -10px; transform: rotate(0deg) translateX(0); }
          100% { opacity: 0; top: 100%; transform: rotate(720deg) translateX(40px); }
        }
        @keyframes confetti-fall-1 {
          0% { opacity: 1; top: -10px; transform: rotate(0deg) translateX(0); }
          100% { opacity: 0; top: 100%; transform: rotate(720deg) translateX(-40px); }
        }
      `}</style>
    </div>
  );
}

// ── Count-up hook ──────────────────────────────────────────────────────────────

export function useCountUp(target: number, duration = 1000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let startTime: number | null = null;
    let frame: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(eased * target);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
