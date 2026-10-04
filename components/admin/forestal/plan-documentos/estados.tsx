"use client";

/**
 * Cómo se ve cada estado de un documento esperado (ADR-467): falta, cargado,
 * vence pronto, vencido. Pastilla neutra (texto primario sobre el tinte del
 * tono, borde del tono): el texto de color sobre su propio tinte no llega al
 * contraste (medido en el Aging de Saldos, 24-09).
 */

import { AlertCircle, AlertTriangle, Check, Clock, type LucideIcon } from "@buleje/design-system/icons";
import type { EstadoCasillero } from "@/lib/forestal/plan-documentos-tipos";
import { formatDateShort } from "@/lib/format";

interface Aspecto {
  label: string;
  icono: LucideIcon;
  /** Fondo + borde de la pastilla. */
  pastilla: string;
  /** El ícono (y sólo el ícono) lleva el color. */
  tinta: string;
  /** El punto del árbol de carpetas. */
  punto: string;
}

export const ASPECTO_ESTADO: Record<EstadoCasillero, Aspecto> = {
  falta: {
    label: "Falta",
    icono: AlertCircle,
    pastilla: "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10",
    tinta: "text-[var(--data-warning-ink)]",
    punto: "bg-[var(--data-warning-500)]",
  },
  vencido: {
    label: "Vencido",
    icono: AlertTriangle,
    pastilla: "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10",
    tinta: "text-[var(--data-error-ink)]",
    punto: "bg-[var(--data-error-500)]",
  },
  vence_pronto: {
    label: "Vence pronto",
    icono: Clock,
    pastilla: "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10",
    tinta: "text-[var(--data-warning-ink)]",
    punto: "bg-[var(--data-warning-500)]",
  },
  cargado: {
    label: "Cargado",
    icono: Check,
    pastilla: "border-[var(--data-success-500)]/45 bg-[var(--data-success-500)]/10",
    tinta: "text-[var(--data-success-ink)]",
    punto: "bg-[var(--data-success-500)]",
  },
};

/** «Vence 12 oct.» / «Venció 02 set.» — la fecha es date-only: se lee en UTC. */
export function textoVence(estado: EstadoCasillero, vence: string | null): string | null {
  if (!vence) return null;
  const f = formatDateShort(`${vence}T00:00:00.000Z`, { soloFecha: true });
  return estado === "vencido" ? `venció ${f}` : `vence ${f}`;
}

export function PastillaEstado({
  estado,
  vence,
  porSubir,
  className = "",
}: {
  estado: EstadoCasillero;
  vence?: string | null;
  /** Cargado en memoria: entra al guardar el plan. */
  porSubir?: boolean;
  className?: string;
}) {
  const a = ASPECTO_ESTADO[estado];
  const Icono = a.icono;
  const fecha = estado === "vence_pronto" || estado === "vencido" ? textoVence(estado, vence ?? null) : null;
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-semibold text-[var(--text-primary)] ${a.pastilla} ${className}`}
    >
      <Icono className={`h-3.5 w-3.5 ${a.tinta}`} aria-hidden="true" />
      {porSubir && estado !== "falta" ? "Por subir" : a.label}
      {fecha && <span className="font-normal text-[var(--text-secondary)]">· {fecha}</span>}
    </span>
  );
}
