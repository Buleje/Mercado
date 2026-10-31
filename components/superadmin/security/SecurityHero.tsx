"use client";

/**
 * SecurityHero — Header principal del Security Center.
 *
 * Sigue el patrón canónico del superadmin (banners/marca/marketplace):
 *   - <header border-b + surface-raised + max-w-[1400px]>
 *   - Icon badge h-12 sólido --accent
 *   - Kicker uppercase + Title font-display extrabold + descripción
 *   - Stat pills (estado + último scan) + botón refrescar a la derecha
 *
 * 18-10 (Brandon: «llevando el título y las pestañas a su lado»): una sola
 * fila `CabeceraConPestanas` — título + ⓘ, las pestañas de Seguridad al lado
 * y las cifras al final. El rótulo «Plataforma · Seguridad» pasa al ⓘ.
 */

import type { ReactNode } from "react";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { Shield, Clock, RefreshCw } from "@buleje/design-system/icons";

export interface SecurityHeroProps {
  lastScanLabel: string;
  /** Estado agregado: protegido / atención / crítico */
  status?: "healthy" | "warning" | "critical";
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Pestañas del módulo, al lado del título. */
  pestanas?: ReactNode;
}

const STATUS_CONFIG: Record<
  NonNullable<SecurityHeroProps["status"]>,
  {
    label: string;
    cls: string;
    dot: string;
  }
> = {
  healthy: {
    label: "Protegido",
    cls: "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]",
    dot: "bg-[var(--data-success-500)]",
  },
  warning: {
    label: "Requiere atención",
    cls: "border-teal-300/60 bg-teal-50/60 text-teal-700 dark:border-teal-700/40 dark:bg-teal-950/30 dark:text-teal-300",
    dot: "bg-teal-500",
  },
  critical: {
    label: "Crítico",
    cls: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:border-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
    dot: "bg-rose-500",
  },
};

export function SecurityHero({
  lastScanLabel,
  status = "healthy",
  onRefresh,
  refreshing,
  pestanas,
}: SecurityHeroProps) {
  const meta = STATUS_CONFIG[status];
  return (
    <CabeceraConPestanas
      icon={Shield}
      title="Security Center"
      kicker="Plataforma · Seguridad"
      info={{
        title: "Security Center",
        what: "Monitorea la seguridad del superadmin: sesiones activas, accesos, auditoría y credenciales.",
        affects: "Solo el superadmin. Acá detectas y cortas accesos sospechosos a la plataforma.",
        example: "Si hay un login raro desde otra IP, lo ves acá y cierras esa sesión.",
      }}
      pestanas={pestanas}
      className="mb-4"
      acciones={
        <>
          {/* Status pill */}
          <div className={`rounded-xl border px-3.5 py-2 min-w-[88px] ${meta.cls}`}>
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
              Estado
            </p>
            <p className="font-display text-sm font-extrabold tracking-tight mt-1 leading-none inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
              {meta.label}
            </p>
          </div>

          {/* Last scan pill */}
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
              Último escaneo
            </p>
            <p className="font-display text-sm font-extrabold tracking-tight mt-1 leading-none text-[var(--text-primary)] inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-[var(--text-tertiary)]" aria-hidden />
              {lastScanLabel}
            </p>
          </div>

          {/* Refresh button */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 py-2 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={2.25}
                aria-hidden
              />
              Actualizar
            </button>
          )}
        </>
      }
    />
  );
}
