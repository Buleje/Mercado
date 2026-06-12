"use client";

import { useEffect, useRef } from "react";

/**
 * useVisiblePolling — corre `fn` cada `intervalMs`, PERO solo mientras la
 * pestaña está VISIBLE. Pausa en `visibilitychange` (pestaña en background /
 * minimizada) y al volver hace una llamada inmediata + reanuda.
 *
 * perf audit 2026-06-12: antes varios pollers (LiveStats 30s, LiveOrderCounter
 * 5min, SalesAnomaly, chat) seguían pegándole al server con la pestaña oculta,
 * para cada usuario. Este hook centraliza el patrón de "polling con guard de
 * visibilidad" para no repetirlo (y equivocarse) en cada componente.
 */
export function useVisiblePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  opts?: { immediate?: boolean; enabled?: boolean },
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const enabled = opts?.enabled ?? true;
  const immediate = opts?.immediate ?? true;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      void fnRef.current();
    };
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        run();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") {
      if (immediate) run();
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled, immediate]);
}
