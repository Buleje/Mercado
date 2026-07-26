"use client";

import { Mail, Clock, CheckCircle2, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { SupportKpiData, KpiFilter } from "./shared";
import type { LucideIcon } from "@buleje/design-system/icons";

interface KpiCardDef {
  key: KpiFilter;
  label: string;
  value: number;
  color: string;
  bg: string;
  activeRing: string;
  icon: LucideIcon;
}

interface Props {
  kpis: SupportKpiData;
  active: KpiFilter;
  /** Toggle: volver a hacer click desactiva el filtro (→ "all"). */
  onPick: (key: KpiFilter) => void;
}

/** Tarjetas KPI clickeables — patrón DocumentKpis. Click activa/desactiva filtro. */
export default function SupportKpis({ kpis, active, onPick }: Props) {
  const cards: KpiCardDef[] = [
    {
      key: "open",
      label: "Abiertos",
      value: kpis.open,
      color: "text-[var(--data-error-500)]",
      bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10",
      activeRing: "ring-[var(--data-error-500)]",
      icon: Mail,
    },
    {
      key: "in_progress",
      label: "En progreso",
      value: kpis.inProgress,
      color: "text-[var(--accent)]",
      bg: "bg-primary/10 dark:bg-[var(--accent)]/10",
      activeRing: "ring-[var(--accent)]",
      icon: Clock,
    },
    {
      key: "closed",
      label: "Cerrados",
      value: kpis.closed,
      color: "text-[var(--data-success-500)]",
      bg: "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10",
      activeRing: "ring-[var(--data-success-500)]",
      icon: CheckCircle2,
    },
    {
      key: "urgent",
      label: "Urgentes",
      value: kpis.urgent,
      color: "text-[var(--data-warning-500)]",
      bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",
      activeRing: "ring-[var(--data-warning-500)]",
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(({ key, label, value, color, bg, activeRing, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(isActive ? "all" : key)}
            aria-pressed={isActive}
            className={cn(
              "rounded-xl p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              bg,
              isActive
                ? cn("ring-2", activeRing)
                : "ring-1 ring-transparent hover:ring-[var(--rule-base)]",
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={cn("h-4 w-4", color)} aria-hidden="true" />
              <p className="text-sm font-semibold text-[var(--text-secondary)]">{label}</p>
            </div>
            <p className={cn("text-2xl font-extrabold", color)}>{value}</p>
          </button>
        );
      })}
    </div>
  );
}
