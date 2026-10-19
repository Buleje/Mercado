"use client";

import { useState, useCallback } from "react";
import { Calendar, CalendarDays } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { formatDate, formatDateShort } from "@/lib/format";

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
    formatDateShort(d);
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
/** A la vista van los tres períodos de todos los días; Año, Día y Rango, en «Más» (19-10: la banda del Inicio bajó de 122 a ~66 px). */
const PRESETS_A_LA_VISTA = PRESETS.slice(0, 3);

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
      ? formatDate(value.from)
      : value.preset === "personalizado"
        ? `${formatDateShort(value.from)} — ${formatDateShort(value.to)}`
        : null;

  const anualActivo = value.preset === "anual" && mode === "none";
  const diaActivo = mode === "specific" || value.preset === "especifica";
  const rangoActivo = mode === "range" || value.preset === "personalizado";
  const extraActivo = anualActivo || diaActivo || rangoActivo;
  const etiquetaMas = anualActivo ? "Año" : diaActivo ? "Día" : rangoActivo ? "Rango" : "Más";
  const accionesMas: MenuAccion[] = [
    { id: "anual", label: "Este año", icon: Calendar, activo: anualActivo, onSelect: () => handlePreset("anual") },
    { id: "dia", label: "Un día", hint: "Elige la fecha exacta", icon: Calendar, activo: diaActivo, onSelect: handleSpecificToggle },
    { id: "rango", label: "Rango de fechas", hint: "Desde y hasta", icon: CalendarDays, activo: rangoActivo, onSelect: handleRangeToggle },
  ];

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {/* Preset pills */}
      <div className="flex items-center gap-0.5 rounded-xl bg-[var(--surface-sunken)]">
        {PRESETS_A_LA_VISTA.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePreset(p.id)}
            className={cn(
              "h-12 min-w-12 px-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
              value.preset === p.id && mode === "none"
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] ",
            )}
          >
            <span className="hidden sm:inline">{p.label}</span>
            <span className="sm:hidden">{p.short}</span>
          </button>
        ))}
      </div>

      {/* Año, un día y un rango: menos usados, en un menú. El botón dice cuál rige. */}
      <ActionMenu
        label={etiquetaMas}
        icon={CalendarDays}
        size="md"
        variant="outline"
        title="Más períodos: año, un día o un rango"
        className={cn(extraActivo && "border-[var(--accent)]")}
        actions={accionesMas}
      />

      {/* Specific date input */}
      {mode === "specific" && (
        <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-[var(--dur-base)]">
          <input
            type="date"
            value={toInputDate(value.from)}
            onChange={handleSpecific}
            className="h-12 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)]"
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
            className="h-12 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)]"
            aria-label="Fecha desde"
          />
          <span className="text-sm text-[var(--text-tertiary)] dark:text-muted font-medium">a</span>
          <input
            type="date"
            value={toInputDate(value.to)}
            onChange={handleCustomTo}
            className="h-12 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)]"
            aria-label="Fecha hasta"
          />
        </div>
      )}

      {/* Summary label en modo idle */}
      {summaryLabel && mode === "none" && (
        <span className="text-sm text-[var(--text-tertiary)] dark:text-muted font-semibold">
          {summaryLabel}
        </span>
      )}
    </div>
  );
}
