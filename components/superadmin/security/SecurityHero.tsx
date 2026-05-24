"use client";

/**
 * SecurityHero — Header principal del Security Center.
 *
 * Sigue el patrón canónico del superadmin (banners/marca/marketplace):
 *   - <header border-b + surface-raised + max-w-[1400px]>
 *   - Icon badge h-12 sólido --accent
 *   - Kicker uppercase + Title font-display extrabold + descripción
 *   - Stat pills (estado + último scan) + botón refrescar a la derecha
 */

import { Shield, Clock, RefreshCw } from "@buleje/design-system/icons";

export interface SecurityHeroProps {
  lastScanLabel: string;
  /** Estado agregado: protegido / atención / crítico */
  status?: "healthy" | "warning" | "critical";
  onRefresh?: () => void;
  refreshing?: boolean;
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
    cls: "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  critical: {
    label: "Crítico",
    cls: "border-rose-300/60 bg-rose-50/60 text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]",
    dot: "bg-rose-500",
  },
};

export function SecurityHero({
  lastScanLabel,
  status = "healthy",
  onRefresh,
  refreshing,
}: SecurityHeroProps) {
  const meta = STATUS_CONFIG[status];
  return (
    <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="w-full">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3.5">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <Shield className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Seguridad
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                Security Center
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                Estado consolidado de seguridad de la plataforma — sesiones, permisos,
                vulnerabilidades, compliance y registro de auditoría.
              </p>
            </div>
          </div>

          <div className="flex items-stretch gap-2 flex-wrap">
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
          </div>
        </div>
      </div>
    </header>
  );
}
