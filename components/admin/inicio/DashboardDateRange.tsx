"use client";

import { useState, useCallback } from "react";
import { Calendar, ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type DatePreset = "diario" | "semanal" | "mensual" | "anual" | "personalizado";

export interface DateRange {
  preset: DatePreset;
  from: Date;
  to: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeRange(preset: Exclude<DatePreset, "personalizado">): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  switch (preset) {
    case "diario": {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { from, to };
    }
    case "semanal": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      return { from, to };
    }
    case "mensual": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to };
    }
    case "anual": {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from, to };
    }
  }
}

export function getDefaultRange(): DateRange {
  const { from, to } = computeRange("mensual");
  return { preset: "mensual", from, to };
}

// ── Presets ───────────────────────────────────────────────────────────────────

const PRESETS: { id: Exclude<DatePreset, "personalizado">; label: string; short: string }[] = [
  { id: "diario",  label: "Hoy",     short: "Hoy" },
  { id: "semanal", label: "Semana",   short: "Sem" },
  { id: "mensual", label: "Mes",      short: "Mes" },
  { id: "anual",   label: "Año",      short: "Año" },
];

// ── Component ────────────────────────────────────────────────────────────────

interface DashboardDateRangeProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardDateRange({ value, onChange, className }: DashboardDateRangeProps) {
  const [showCustom, setShowCustom] = useState(value.preset === "personalizado");

  const handlePreset = useCallback((preset: Exclude<DatePreset, "personalizado">) => {
    setShowCustom(false);
    const { from, to } = computeRange(preset);
    onChange({ preset, from, to });
  }, [onChange]);

  const handleCustomToggle = useCallback(() => {
    setShowCustom(prev => !prev);
    if (!showCustom) {
      onChange({ ...value, preset: "personalizado" });
    }
  }, [showCustom, onChange, value]);

  const handleCustomFrom = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const from = new Date(e.target.value + "T00:00:00");
    if (!isNaN(from.getTime())) {
      onChange({ preset: "personalizado", from, to: value.to });
    }
  }, [onChange, value.to]);

  const handleCustomTo = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const to = new Date(e.target.value + "T23:59:59");
    if (!isNaN(to.getTime())) {
      onChange({ preset: "personalizado", from: value.from, to });
    }
  }, [onChange, value.from]);

  const rangeLabel = value.preset !== "personalizado"
    ? null
    : `${value.from.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })} — ${value.to.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}`;

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {/* Preset pills */}
      <div className="flex items-center gap-0.5 bg-[var(--surface-sunken)] rounded-lg p-0.5">
        {PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => handlePreset(p.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
              value.preset === p.id && !showCustom
                ? "bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground "
                : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)] hover:bg-gray-50 dark:hover:bg-gray-700",
            )}
          >
            <span className="hidden sm:inline">{p.label}</span>
            <span className="sm:hidden">{p.short}</span>
          </button>
        ))}
        <button
          onClick={handleCustomToggle}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
            showCustom
              ? "bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground "
              : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)] hover:bg-gray-50 dark:hover:bg-gray-700",
          )}
          title="Rango personalizado"
        >
          <Calendar className="h-3.5 w-3.5" />
          <ChevronDown className={cn("h-3 w-3 transition-transform", showCustom && "rotate-180")} />
        </button>
      </div>

      {/* Custom range inputs */}
      {showCustom && (
        <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-[var(--dur-base)]">
          <input
            type="date"
            value={toInputDate(value.from)}
            onChange={handleCustomFrom}
            className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-card text-xs text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)]"
          />
          <span className="text-xs text-[var(--text-tertiary)] dark:text-muted font-medium">a</span>
          <input
            type="date"
            value={toInputDate(value.to)}
            onChange={handleCustomTo}
            className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-card text-xs text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)]"
          />
        </div>
      )}

      {/* Range label for custom */}
      {rangeLabel && !showCustom && (
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{rangeLabel}</span>
      )}
    </div>
  );
}
