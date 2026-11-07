"use client";

import { HardDrive } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmtBytes, type DocStats, type QuickFilter } from "./shared";

interface KpiDef {
  key: QuickFilter;
  label: string;
  value: number;
  color: string;
  bg: string;
  activeRing: string;
}

interface Props {
  stats: DocStats;
  active: QuickFilter;
  onPick: (key: QuickFilter) => void;
}

/** KPIs clickeables: cada tarjeta actúa como filtro rápido (toggle). */
export default function DocumentKpis({ stats, active, onPick }: Props) {
  const cards: KpiDef[] = [
    {
      key: "todos",
      label: "Total",
      value: stats.total,
      color: "text-[var(--text-primary)]",
      bg: "bg-[var(--surface-sunken)]",
      activeRing: "ring-[var(--text-tertiary)]",
    },
    {
      key: "favoritos",
      label: "Favoritos",
      value: stats.favoritos,
      color: "text-[var(--data-warning-500)]",
      bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",
      activeRing: "ring-[var(--data-warning-500)]",
    },
    {
      key: "porVencer",
      label: "Por vencer",
      value: stats.porVencer,
      color: "text-[var(--data-warning-500)]",
      bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",
      activeRing: "ring-[var(--data-warning-500)]",
    },
    {
      key: "vencidos",
      label: "Vencidos",
      value: stats.vencidos,
      color: "text-[var(--data-error-500)]",
      bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",
      activeRing: "ring-[var(--data-error-500)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {cards.map(({ key, label, value, color, bg, activeRing }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            aria-pressed={isActive}
            className={cn(
              "rounded-xl p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              bg,
              isActive
                ? cn("ring-2", activeRing)
                : "ring-1 ring-transparent hover:ring-[var(--rule-base)]",
            )}
          >
            <p className="text-sm font-semibold text-[var(--text-secondary)] mb-1">{label}</p>
            <p className={cn("text-2xl font-extrabold", color)}>{value}</p>
          </button>
        );
      })}
      {/* Almacenamiento usado — informativo, no filtra. */}
      <div className="rounded-xl p-4 bg-[var(--surface-sunken)] flex flex-col justify-center col-span-2 sm:col-span-1">
        <p className="flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)] mb-1">
          <HardDrive className="h-4 w-4" /> Almacenado
        </p>
        <p className="text-2xl font-extrabold text-[var(--text-primary)]">
          {fmtBytes(stats.totalSize)}
        </p>
      </div>
    </div>
  );
}
