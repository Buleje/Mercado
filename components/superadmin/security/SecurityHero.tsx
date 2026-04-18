"use client";

/**
 * SecurityHero — Header principal del Security Center.
 *
 * Banner superior con título, subtítulo, chip de último scan, y chip de estado
 * global ("Protegido" / "Revisar" / "Crítico"). Usa tokens DS, sin colores
 * saturados — se mantiene en la zona neutral del admin minimalista.
 */

import { Shield, Clock, RefreshCw } from "@buleje/design-system/icons";
import { PageTitle, BodyText, Caption, BadgeStatus } from "@buleje/design-system";
import type { BadgeStatusVariant } from "@buleje/design-system";

export interface SecurityHeroProps {
  lastScanLabel: string;
  /** Estado agregado: protegido / atención / crítico */
  status?: "healthy" | "warning" | "critical";
  onRefresh?: () => void;
  refreshing?: boolean;
}

const STATUS_CONFIG: Record<
  NonNullable<SecurityHeroProps["status"]>,
  { variant: BadgeStatusVariant; label: string }
> = {
  healthy: { variant: "success", label: "Protegido" },
  warning: { variant: "warning", label: "Requiere atención" },
  critical: { variant: "error", label: "Crítico" },
};

export function SecurityHero({
  lastScanLabel,
  status = "healthy",
  onRefresh,
  refreshing,
}: SecurityHeroProps) {
  const badge = STATUS_CONFIG[status];
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg p-2 bg-[var(--surface-sunken)]">
          <Shield className="h-6 w-6 text-[var(--text-secondary)]" aria-hidden />
        </div>
        <div className="space-y-1 min-w-0">
          <PageTitle>Security Center</PageTitle>
          <BodyText className="text-[var(--text-secondary)]">
            Estado consolidado de seguridad de la plataforma
          </BodyText>
          <div className="flex items-center gap-2 pt-1">
            <BadgeStatus variant={badge.variant} label={badge.label} dot />
            <Caption className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
              <Clock className="h-3 w-3" aria-hidden />
              Último escaneo: {lastScanLabel}
            </Caption>
          </div>
        </div>
      </div>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-[length:var(--ts-sm)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden
          />
          Actualizar
        </button>
      )}
    </header>
  );
}
