"use client";

import { useState, useEffect, useRef } from "react";
import { formatTime } from "@/lib/format";

// ── Mejora Idle Screen ───────────────────────────────────────────────────────

export default function POSIdleScreen({ onWake }: { onWake: () => void }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div
      className="fixed inset-0 z-system bg-black/80 flex flex-col items-center justify-center cursor-pointer select-none"
      onClick={onWake}
      onKeyDown={onWake}
      onTouchStart={onWake}
      role="button"
      tabIndex={0}
    >
      <p className="text-6xl font-mono text-white tabular-nums">
        {formatTime(time, { segundos: true })}
      </p>
      <p className="text-xl font-bold text-white mt-4">Buleje</p>
      <p className="text-[var(--text-tertiary)] mt-6 text-sm animate-pulse">Toca para continuar</p>
    </div>
  );
}

/** Pasa a la pantalla de reposo tras N minutos sin tocar (localStorage `pos-idle-minutes`, 5 por defecto). */
export function usePOSIdle() {
  const [isIdle, setIsIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const idleMinutes = (() => { try { const v = localStorage.getItem("pos-idle-minutes"); return v ? Number(v) : 5; } catch { return 5; } })();
    const resetIdleTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setIsIdle(true), idleMinutes * 60 * 1000);
    };
    resetIdleTimer();
    const events = ["click", "keydown", "touchstart"] as const;
    events.forEach(e => document.addEventListener(e, resetIdleTimer));
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach(e => document.removeEventListener(e, resetIdleTimer));
    };
  }, []);
  return { isIdle, setIsIdle };
}
