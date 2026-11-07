"use client";

import { useState } from "react";
import { Loader2, Mail } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import type { AvisosCorreoDetalle } from "@/lib/avisos-correo-tipos";
import type { TenantRow } from "@/lib/superadmin-types";

interface TenantCardCorreoProps {
  t: TenantRow;
  /** Devuelve a la lista el resumen nuevo (la tarjeta y la vista compacta leen de ahí). */
  onCorreoCambiado?: (slug: string, avisos: AvisosCorreoDetalle) => void;
  onToast?: (msg: string, ok?: boolean) => void;
}

/** Estado de los avisos por correo de una tienda, en una fila, con interruptor para pausarlos. */
export function TenantCardCorreo({ t, onCorreoCambiado, onToast }: TenantCardCorreoProps) {
  const a = t.avisosCorreo;
  const [guardando, setGuardando] = useState(false);
  if (!a) return null;

  const sinCorreo = !a.correo;
  const estado = sinCorreo ? "Sin correo" : a.pausado ? "Pausados" : `${a.activos} de ${a.total} activos`;

  const cambiar = async () => {
    const pausar = !a.pausado;
    if (pausar && !window.confirm(`¿Pausar los avisos por correo de "${t.name}"? Dejará de recibir pedidos, stock y reportes por correo.`)) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/avisos-correo`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ pausado: pausar }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; avisos?: AvisosCorreoDetalle } | null;
      if (!res.ok || !json?.avisos) {
        onToast?.("No se pudo cambiar los avisos por correo", false);
        return;
      }
      onCorreoCambiado?.(t.slug, json.avisos);
      onToast?.(pausar ? `Avisos por correo de ${t.name} pausados` : `Avisos por correo de ${t.name} activados`);
    } catch {
      onToast?.("No se pudo cambiar los avisos por correo", false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2">
      <Mail
        className={`h-4 w-4 shrink-0 ${a.pausado || sinCorreo ? "text-[var(--text-tertiary)]" : "text-[var(--accent)]"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-xs font-bold text-[var(--text-primary)]">Avisos por correo</span>
          {a.esGmail && (
            <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-bold text-[var(--accent-dark)]">
              Gmail
            </span>
          )}
        </div>
        <div className="truncate text-xs text-[var(--text-tertiary)]" title={a.correo ?? undefined}>
          {a.correo ? `${a.correo} · ` : ""}{estado}
        </div>
      </div>
      {!sinCorreo && (
        <button
          type="button"
          onClick={() => void cambiar()}
          disabled={guardando}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          {guardando && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
          {a.pausado ? "Habilitar" : "Deshabilitar"}
        </button>
      )}
    </div>
  );
}
