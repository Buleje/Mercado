"use client";

/**
 * hooks/use-session-keepalive.ts
 *
 * Cuando el "modo mantener sesión" está ON, refresca proactivamente la sesión
 * del panel mientras la pestaña esté viva + en uso, para que el usuario no
 * vuelva al login mientras trabaja.
 *
 *   - admin      → POST /api/auth/refresh   (rota access + refresh)
 *   - superadmin → GET  /api/superadmin/auth (rota el platform token si toca)
 *
 * Refresca: en un intervalo corto, al volver a la pestaña, y ante actividad
 * del usuario (throttled). Cuando el modo está OFF, es no-op (queda el
 * comportamiento base de cada panel). No debilita la seguridad — ver
 * lib/session-keepalive.ts.
 */

import { useEffect, useRef, useState } from "react";
import { getKeepAlive, KEEPALIVE_EVENT, KEEPALIVE_PING_EVENT } from "@/lib/session-keepalive";

const REFRESH_INTERVAL_MS = 4 * 60 * 1000; // 4 min — por debajo del access de 15 min
const ACTIVITY_THROTTLE_MS = 90 * 1000; // no refrescar por actividad más de 1 vez / 90s

export function useSessionKeepAlive(panel: "admin" | "superadmin"): { enabled: boolean } {
  const [enabled, setEnabled] = useState(getKeepAlive);
  const lastRefreshRef = useRef(0);
  const inFlightRef = useRef(false);

  // Sincronizá el estado con el switch (mismo tab: evento; otro tab: storage).
  useEffect(() => {
    const onChange = () => setEnabled(getKeepAlive());
    window.addEventListener(KEEPALIVE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(KEEPALIVE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const refresh = async () => {
      if (inFlightRef.current) return;
      // Nota: NO saltamos en background. El modo "mantener activa" existe
      // justamente para que no te saque cuando dejás la pestaña de lado un
      // rato; el idle timeout del superadmin (30 min) mata la sesión si nadie
      // renueva. El navegador ya throttlea el interval en background, así que
      // el gasto es mínimo.
      inFlightRef.current = true;
      lastRefreshRef.current = Date.now();
      try {
        const res =
          panel === "admin"
            ? await fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
            : // GET rota el platform token cuando pasó la mitad de su vida / idle.
              await fetch("/api/superadmin/auth", { method: "GET", credentials: "include" });
        if (res.ok) {
          // Aviso a la UI (el switch muestra "renovada hace Xs") — prueba viva
          // de que el modo está funcionando.
          window.dispatchEvent(new CustomEvent(KEEPALIVE_PING_EVENT, { detail: Date.now() }));
        }
      } catch {
        /* error de red — reintenta en el próximo tick, no rompemos nada */
      } finally {
        inFlightRef.current = false;
      }
    };

    // Refresco inicial + intervalo.
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);

    // Al volver a la pestaña.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Ante actividad del usuario, refrescá (throttled) para "resetear el reloj".
    const onActivity = () => {
      if (Date.now() - lastRefreshRef.current >= ACTIVITY_THROTTLE_MS) refresh();
    };
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity, { passive: true });

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [enabled, panel]);

  return { enabled };
}
