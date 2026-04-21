"use client";

/**
 * @buleje/design-system/dashboard — PeriodFilter
 *
 * Componente canónico de filtro de período para dashboards.
 * Reemplaza los pill-toggles ad-hoc dispersos en DashboardTab.
 *
 * Períodos: hoy | semana | mes | año | custom
 * - custom muestra 2 <input type="date"> para rango.
 *
 * @example
 * <PeriodFilter value={period} onChange={setPeriod} includeCustom />
 * <PeriodFilter value={period} onChange={setPeriod} dateRange={range} onDateRangeChange={setRange} />
 */

import type { ReactNode } from "react";
import { cn } from "../utils";

export type Period = "hoy" | "semana" | "mes" | "año" | "custom";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export interface PeriodFilterProps {
  value: Period;
  onChange: (period: Period) => void;
  /** Activar opción "custom" con date picker. Default false. */
  includeCustom?: boolean;
  /** Rango de fechas activo cuando value === "custom". */
  dateRange?: DateRange;
  /** Callback cuando cambia el rango de fechas. */
  onDateRangeChange?: (range: DateRange) => void;
  /** Slot de acciones adicionales a la derecha (botón exportar, etc.). */
  actions?: ReactNode;
  className?: string;
}

const PILLS: { id: Period; label: string }[] = [
  { id: "hoy",    label: "Hoy" },
  { id: "semana", label: "7d" },
  { id: "mes",    label: "Mes" },
  { id: "año",    label: "Año" },
];

export function PeriodFilter({
  value,
  onChange,
  includeCustom = false,
  dateRange,
  onDateRangeChange,
  actions,
  className,
}: PeriodFilterProps) {
  const pills = includeCustom
    ? [...PILLS, { id: "custom" as Period, label: "Custom" }]
    : PILLS;

  const handleDateChange = (key: keyof DateRange, val: string) => {
    if (!onDateRangeChange) return;
    onDateRangeChange({
      from: key === "from" ? val : (dateRange?.from ?? ""),
      to:   key === "to"   ? val : (dateRange?.to   ?? ""),
    });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Pill toggle group */}
      <div
        className="flex items-center bg-[var(--surface-sunken)] rounded-lg p-0.5"
        role="group"
        aria-label="Filtrar por período"
      >
        {pills.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            aria-pressed={value === p.id}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              value === p.id
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date range inputs — solo cuando custom está activo */}
      {includeCustom && value === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateRange?.from ?? ""}
            max={dateRange?.to ?? undefined}
            onChange={(e) => handleDateChange("from", e.target.value)}
            aria-label="Fecha inicio"
            className={cn(
              "px-2 py-1 text-xs rounded-lg border border-[var(--rule-base)]",
              "bg-[var(--surface-raised)] text-[var(--text-primary)]",
              "focus:outline-none focus:border-[var(--accent)]",
            )}
          />
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">—</span>
          <input
            type="date"
            value={dateRange?.to ?? ""}
            min={dateRange?.from ?? undefined}
            onChange={(e) => handleDateChange("to", e.target.value)}
            aria-label="Fecha fin"
            className={cn(
              "px-2 py-1 text-xs rounded-lg border border-[var(--rule-base)]",
              "bg-[var(--surface-raised)] text-[var(--text-primary)]",
              "focus:outline-none focus:border-[var(--accent)]",
            )}
          />
        </div>
      )}

      {/* Action slot */}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
