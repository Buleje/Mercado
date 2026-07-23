"use client";

/**
 * SessionExpiryGuard — aviso amable ANTES de cerrar sesión por inactividad.
 *
 * Reemplaza el "te saca de golpe": cuando faltan pocos minutos para el idle
 * timeout, muestra un aviso flotante con cuenta regresiva y un botón para
 * "Seguir conectado" (renueva la sesión en 1 clic). Si no respondés, expira
 * como antes (llama a `onExpire`).
 *
 * Se re-arma con:
 *   - actividad real del usuario (mousedown/keydown/scroll/touch), y
 *   - cada renovación del "modo mantener sesión activa" (KEEPALIVE_PING_EVENT).
 * Por eso, con ese modo ON el aviso nunca aparece: los pings resetean el reloj.
 *
 * No es bloqueante: la página sigue interactiva y cualquier interacción lo
 * descarta renovando. No cambia la duración base de los tokens.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { refrescarSesion } from "@/lib/auth/session-refresh";
import { Clock, ShieldCheck } from "@buleje/design-system/icons";
import { KEEPALIVE_PING_EVENT } from "@/lib/session-keepalive";

type Panel = "admin" | "superadmin";

const CFG: Record<Panel, { idleMs: number; endpoint: string; method: "GET" | "POST" }> = {
  superadmin: { idleMs: 30 * 60 * 1000, endpoint: "/api/superadmin/auth", method: "GET" },
  admin: { idleMs: 30 * 60 * 1000, endpoint: "/api/auth/refresh", method: "POST" },
};

const WARN_BEFORE_MS = 3 * 60 * 1000; // avisar 3 min antes de expirar

export function SessionExpiryGuard({
  panel,
  onExpire,
  onLogout,
}: {
  panel: Panel;
  /** Se llama cuando el usuario ignora el aviso y se agota el tiempo. */
  onExpire: () => void;
  /** Cierre de sesión explícito (botón "Cerrar sesión"). Si falta, usa onExpire. */
  onLogout?: () => void;
}) {
  const { idleMs, endpoint, method } = CFG[panel];
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // Guardamos onExpire en un ref: así `arm` no depende de su identidad y el
  // reloj NO se reinicia en cada render del shell (que pasa seguido).
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const clearTimers = useCallback(() => {
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (expireTimer.current) clearTimeout(expireTimer.current);
    if (tick.current) clearInterval(tick.current);
  }, []);

  const arm = useCallback(() => {
    clearTimers();
    setWarning(false);
    warnTimer.current = setTimeout(
      () => {
        setWarning(true);
        setSecondsLeft(Math.round(WARN_BEFORE_MS / 1000));
        tick.current = setInterval(
          () => setSecondsLeft((s) => Math.max(0, s - 1)),
          1000,
        );
        expireTimer.current = setTimeout(() => {
          clearTimers();
          setWarning(false);
          onExpireRef.current();
        }, WARN_BEFORE_MS);
      },
      Math.max(0, idleMs - WARN_BEFORE_MS),
    );
  }, [clearTimers, idleMs]);

  useEffect(() => {
    arm();
    const onActivity = () => arm();
    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    window.addEventListener(KEEPALIVE_PING_EVENT, onActivity);
    return () => {
      clearTimers();
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener(KEEPALIVE_PING_EVENT, onActivity);
    };
  }, [arm, clearTimers]);

  const stayConnected = useCallback(async () => {
    try {
      // En admin va por la puerta única con `forzar`: acá el usuario PIDIÓ
      // seguir conectado y la sesión está por vencer, así que el piso de
      // tiempo no aplica (el backoff de 429 sí se respeta).
      if (panel === "admin") {
        await refrescarSesion({ forzar: true, motivo: "seguir-conectado" });
      } else {
        await fetch(endpoint, { method, credentials: "include" });
      }
    } catch {
      /* red caída — el reloj se re-arma igual; reintentará en el próximo aviso */
    }
    arm();
  }, [arm, endpoint, method, panel]);

  if (!warning) return null;

  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[95] flex justify-center px-4"
      role="alertdialog"
      aria-live="assertive"
      aria-label="Aviso de cierre de sesión por inactividad"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-xl)]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--data-warning-500)]">
            <Clock className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--text-primary)]">¿Seguís por acá?</p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Por seguridad cerraremos tu sesión en{" "}
              <span className="font-bold tabular-nums text-[var(--data-warning-700)]">{mmss}</span>{" "}
              por inactividad.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={stayConnected}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white transition-[filter] hover:brightness-110"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden /> Seguir conectado
              </button>
              <button
                type="button"
                onClick={onLogout ?? onExpire}
                className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
