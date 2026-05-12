"use client";

import { useState, useCallback } from "react";
import { Calendar, CalendarDays, ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type DatePreset =
  | "diario"
  | "semanal"
  | "mensual"
  | "anual"
  | "especifica"
  | "personalizado";

export interface DateRange {
  preset: DatePreset;
  from: Date;
  to: Date;
}

/** Etiqueta humana legible de un rango — para empty-states y headers. */
export function describeRange(r: DateRange): string {
  const fmtDay = (d: Date) =>
    d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  switch (r.preset) {
    case "diario":
      return "hoy";
    case "semanal":
      return "esta semana";
    case "mensual":
      return "este mes";
    case "anual":
      return "este año";
    case "especifica":
      return `el ${fmtDay(r.from)}`;
    case "personalizado":
      return `del ${fmtDay(r.from)} al ${fmtDay(r.to)}`;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeRange(
  preset: Exclude<DatePreset, "personalizado" | "especifica">,
): { from: Date; to: Date } {
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

const PRESETS: { id: Exclude<DatePreset, "personalizado" | "especifica">; label: string; short: string }[] = [
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

type CustomMode = "none" | "specific" | "range";

export default function DashboardDateRange({ value, onChange, className }: DashboardDateRangeProps) {
  const initialMode: CustomMode =
    value.preset === "especifica"
      ? "specific"
      : value.preset === "personalizado"
        ? "range"
        : "none";
  const [mode, setMode] = useState<CustomMode>(initialMode);

  const handlePreset = useCallback(
    (preset: Exclude<DatePreset, "personalizado" | "especifica">) => {
      setMode("none");
      const { from, to } = computeRange(preset);
      onChange({ preset, from, to });
    },
    [onChange],
  );

  const handleSpecificToggle = useCallback(() => {
    setMode((prev) => (prev === "specific" ? "none" : "specific"));
    if (mode !== "specific") {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      onChange({ preset: "especifica", from, to });
    }
  }, [mode, onChange]);

  const handleRangeToggle = useCallback(() => {
    setMode((prev) => (prev === "range" ? "none" : "range"));
    if (mode !== "range") {
      onChange({ ...value, preset: "personalizado" });
    }
  }, [mode, onChange, value]);

  const handleSpecific = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const d = new Date(e.target.value + "T00:00:00");
      if (isNaN(d.getTime())) return;
      const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      onChange({ preset: "especifica", from, to });
    },
    [onChange],
  );

  const handleCustomFrom = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const from = new Date(e.target.value + "T00:00:00");
      if (!isNaN(from.getTime())) {
        onChange({ preset: "personalizado", from, to: value.to });
      }
    },
    [onChange, value.to],
  );

  const handleCustomTo = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const to = new Date(e.target.value + "T23:59:59");
      if (!isNaN(to.getTime())) {
        onChange({ preset: "personalizado", from: value.from, to });
      }
    },
    [onChange, value.from],
  );

  const summaryLabel =
    value.preset === "especifica"
      ? value.from.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
      : value.preset === "personalizado"
        ? `${value.from.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })} — ${value.to.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}`
        : null;

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {/* Preset pills */}
      <div className="flex items-center gap-0.5 bg-[var(--surface-sunken)] rounded-lg p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePreset(p.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
              value.preset === p.id && mode === "none"
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)] hover:bg-gray-50 dark:hover:bg-gray-700",
            )}
          >
            <span className="hidden sm:inline">{p.label}</span>
            <span className="sm:hidden">{p.short}</span>
          </button>
        ))}
        {/* Específica (un solo día) */}
        <button
          onClick={handleSpecificToggle}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
            mode === "specific" || value.preset === "especifica"
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)] hover:bg-gray-50 dark:hover:bg-gray-700",
          )}
          title="Día específico"
        >
          <Calendar className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Día</span>
        </button>
        {/* Rango personalizado */}
        <button
          onClick={handleRangeToggle}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
            mode === "range" || value.preset === "personalizado"
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)] hover:bg-gray-50 dark:hover:bg-gray-700",
          )}
          title="Rango personalizado"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Rango</span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              (mode === "range" || mode === "specific") && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* Specific date input */}
      {mode === "specific" && (
        <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-[var(--dur-base)]">
          <input
            type="date"
            value={toInputDate(value.from)}
            onChange={handleSpecific}
            className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)]"
            aria-label="Fecha específica"
          />
        </div>
      )}

      {/* Custom range inputs */}
      {mode === "range" && (
        <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-[var(--dur-base)]">
          <input
            type="date"
            value={toInputDate(value.from)}
            onChange={handleCustomFrom}
            className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)]"
            aria-label="Fecha desde"
          />
          <span className="text-xs text-[var(--text-tertiary)] dark:text-muted font-medium">a</span>
          <input
            type="date"
            value={toInputDate(value.to)}
            onChange={handleCustomTo}
            className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)]"
            aria-label="Fecha hasta"
          />
        </div>
      )}

      {/* Summary label en modo idle */}
      {summaryLabel && mode === "none" && (
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted font-semibold">
          {summaryLabel}
        </span>
      )}
    </div>
  );
}
