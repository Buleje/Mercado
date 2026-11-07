import { useEffect, useRef } from "react";

/**
 * useVisiblePolling — llama `fn` cada `intervalMs`, pero SOLO cuando la pestaña
 * está visible (Brandon 2026-06-19). Pausa en background y dispara una vez al
 * volver al foco. Evita seguir fetcheando con la pestaña oculta (best practice
 * de performance/costo: menos requests, menos carga de DB, menos bateria).
 * Reemplaza el patron `setInterval` crudo que tenian ~9 vistas del superadmin.
 *
 * El callback se guarda en un ref → cambiar `fn` no reinicia el intervalo.
 *
 * @param fn         lo que corre en cada tick (ej. refetch)
 * @param intervalMs periodo en ms (<=0 desactiva)
 * @param enabled    si false, no programa nada
 */
export function useVisiblePolling(fn: () => void, intervalMs: number, enabled = true): void {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let id: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") saved.current();
    };
    const start = () => { if (id === null) id = setInterval(tick, intervalMs); };
    const stop = () => { if (id !== null) { clearInterval(id); id = null; } };
    const onVisibility = () => {
      if (document.visibilityState === "visible") { saved.current(); start(); } else { stop(); }
    };

    start();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
