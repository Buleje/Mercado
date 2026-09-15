"use client";
import { useEffect, useRef, useCallback } from "react";
import { refrescarSesion } from "@/lib/auth/session-refresh";

/**
 * Silent token refresh hook.
 *
 * Rota el access token (15 min de vida) antes de que venza: al montar, cada
 * `intervalMs` y al volver a la pestaña.
 *
 * El presupuesto de requests NO se decide acá: lo administra
 * `lib/auth/session-refresh`, que es la única puerta al endpoint y la comparte
 * con `useSessionKeepAlive` y `SessionExpiryGuard`. Antes cada uno llevaba su
 * propia cuenta y entre los tres reventaban el límite de 20 req / 5 min
 * (reporte de HTTP 429, 2026-07-22).
 */
export function useTokenRefresh(intervalMs = 12 * 60 * 1000) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doRefresh = useCallback(
    (forzar = false) => refrescarSesion({ forzar, motivo: "token-refresh" }),
    [],
  );

  useEffect(() => {
    doRefresh();
    timerRef.current = setInterval(() => doRefresh(), intervalMs);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") doRefresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [doRefresh, intervalMs]);

  /** Para el 401 interceptado: ahí el token ya venció y esperar no sirve. */
  return { refreshNow: () => doRefresh(true) };
}
