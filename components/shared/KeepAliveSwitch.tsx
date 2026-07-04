"use client";

/**
 * KeepAliveSwitch — control del "modo mantener sesión activa".
 *
 * Reusable en admin (SettingsModule · Seguridad) y superadmin (Configuración).
 * Al activarlo, mientras la pestaña esté abierta y en uso el panel refresca la
 * sesión sola y no vuelve al login. No cambia la duración base (ver
 * lib/session-keepalive.ts).
 */

import { useEffect, useState } from "react";
import { ShieldCheck } from "@buleje/design-system/icons";
import { getKeepAlive, setKeepAlive, KEEPALIVE_EVENT } from "@/lib/session-keepalive";
import { cn } from "@/lib/utils";

export function KeepAliveSwitch() {
  const [on, setOn] = useState(false);

  // Hidratar desde localStorage tras montar (evita mismatch SSR) + sincronizar.
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

  const toggle = () => {
    const next = !on;
    setOn(next);
    setKeepAlive(next);
  };

  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-dark)]">
        <ShieldCheck className="h-5 w-5" strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-[var(--text-primary)]">Mantener sesión activa</p>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Mantener sesión activa"
            onClick={toggle}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
              on ? "bg-[var(--accent)]" : "bg-[var(--surface-sunken)] border-2 border-[var(--rule-base)]",
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
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          Mientras esta pestaña esté abierta y la uses, no te sacará al login. Se
          renueva sola cada pocos minutos.{" "}
          <span className="text-[var(--text-tertiary)]">
            No baja la seguridad: si cerrás el navegador o dejás el equipo mucho rato sin usar, la sesión igual expira.
          </span>
        </p>
        {on && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-bold text-[var(--data-success-500)]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Activado en este dispositivo
          </p>
        )}
      </div>
    </div>
  );
}
