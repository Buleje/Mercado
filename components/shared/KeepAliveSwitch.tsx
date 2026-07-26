"use client";

/**
 * KeepAliveSwitch — control del "modo mantener sesión activa".
 *
 * Reusable en admin (SettingsModule · Seguridad) y superadmin (Configuración).
 * Al activarlo, mientras la pestaña esté abierta el panel refresca la sesión
 * solo y no vuelve al login. No cambia la duración base (ver
 * lib/session-keepalive.ts). Muestra en vivo la última renovación como prueba
 * de que está funcionando.
 */

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, RefreshCw } from "@buleje/design-system/icons";
import {
  getKeepAlive,
  setKeepAlive,
  KEEPALIVE_EVENT,
  KEEPALIVE_PING_EVENT,
} from "@/lib/session-keepalive";
import { cn } from "@/lib/utils";

/** "renovada hace Xs" — texto amigable a partir del último ping. */
function agoLabel(ping: number | null): string {
  if (!ping) return "conectando…";
  const s = Math.max(0, Math.round((Date.now() - ping) / 1000));
  if (s < 4) return "renovada recién";
  if (s < 60) return `renovada hace ${s}s`;
  const m = Math.floor(s / 60);
  return `renovada hace ${m} min`;
}

export function KeepAliveSwitch() {
  const [on, setOn] = useState(false);
  const [lastPing, setLastPing] = useState<number | null>(null);
  const [, forceTick] = useState(0); // re-render 1/s para refrescar "hace Xs"

  // Hidratar desde localStorage tras montar (evita mismatch SSR) + sincronizar
  // el ON/OFF (mismo tab: evento; otro tab: storage).
  useEffect(() => {
    setOn(getKeepAlive());
    const sync = () => setOn(getKeepAlive());
    window.addEventListener(KEEPALIVE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(KEEPALIVE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Escuchar cada renovación exitosa (el hook la emite) para mostrar el pulso.
  useEffect(() => {
    const onPing = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      setLastPing(typeof detail === "number" ? detail : Date.now());
    };
    window.addEventListener(KEEPALIVE_PING_EVENT, onPing);
    return () => window.removeEventListener(KEEPALIVE_PING_EVENT, onPing);
  }, []);

  // Tic cada segundo solo mientras está ON, para que el "hace Xs" avance.
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    setKeepAlive(next);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border-2 transition-colors",
        on
          ? "border-[var(--accent)] bg-primary/10"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
      )}
    >
      {/* Cabecera: escudo (con pulso si está activo) + título + interruptor */}
      <div className="flex items-start gap-3 p-4">
        <span
          className={cn(
            "relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
            on
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
          )}
        >
          {on ? (
            <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
          ) : (
            <ShieldOff className="h-6 w-6" strokeWidth={2} aria-hidden />
          )}
          {on && (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-success-500)] opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-[var(--accent-soft)] bg-[var(--data-success-500)]" />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                Mantener sesión activa
              </p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                Que no te saque al login mientras trabajás
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label="Mantener sesión activa"
              onClick={toggle}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
                on
                  ? "bg-[var(--accent)]"
                  : "border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                  on ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Barra de estado en vivo — la prueba de que está funcionando */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5">
        {on ? (
          <>
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-success-500)] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)]" />
            </span>
            <span className="text-sm font-bold text-[var(--data-success-700)]">Sesión protegida</span>
            <span className="text-[var(--text-tertiary)]" aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {agoLabel(lastPing)}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <ShieldOff className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
            Desactivada — puede cerrarte la sesión por inactividad.
          </span>
        )}
      </div>

      {/* Explicación en lenguaje simple */}
      <p className="border-t-2 border-[var(--rule-base)] px-4 py-2.5 text-[length:var(--ts-xs)] leading-relaxed text-[var(--text-tertiary)]">
        Renueva tu sesión sola cada pocos minutos, incluso si dejás esta pestaña
        de lado un rato. <span className="font-semibold">No baja la seguridad:</span>{" "}
        si cerrás el navegador o dejás el equipo mucho tiempo sin usar, la sesión
        igual expira.
      </p>
    </div>
  );
}
