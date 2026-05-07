"use client";

/**
 * EmptyDateRangeState — empty-state contextual cuando no hay datos
 * (ventas/compras/clientes/etc) para el rango de fecha seleccionado.
 *
 * Muestra:
 *   - Icono temático (paiche o el icono propio del módulo)
 *   - Headline con la métrica + el rango ("No hay ventas hoy")
 *   - Descripción con sugerencia útil
 *   - 3 chips para saltar a "Hoy / Esta semana / Este mes"
 *
 * Reutilizable en VentasDashboard, CajaDashboard, InventarioDashboard,
 * ComprasDashboard, ProductosDashboard, ClientesDashboard, InicioDashboardV2.
 */

import { useCallback } from "react";
import { Calendar, ArrowRight, type LucideIcon } from "@buleje/design-system/icons";
import {
  type DateRange,
  type DatePreset,
  describeRange,
} from "./DashboardDateRange";
import { PaicheMascot } from "@/components/ui-system/illustrations/PaicheMascot";

interface Props {
  /** Rango actual del dashboard. */
  dateRange: DateRange;
  /** Etiqueta de la métrica vacía: "ventas", "compras", "clientes nuevos", etc. */
  metric: string;
  /** Callback opcional para saltar a un preset. Si se da, muestra los chips. */
  onChangeRange?: (range: DateRange) => void;
  /** Icono específico del módulo (default Calendar). Reemplaza al paiche. */
  icon?: LucideIcon;
  /** Override del título (default: contextual). */
  title?: string;
  /** Override de la descripción. */
  description?: string;
  /** Acción adicional (ej: "Crear venta manual"). */
  action?: { label: string; href?: string; onClick?: () => void };
}

const PRESET_LABELS: Record<DatePreset, string> = {
  diario: "hoy",
  semanal: "esta semana",
  mensual: "este mes",
  anual: "este año",
  especifica: "ese día",
  personalizado: "ese período",
};

function computeQuickRange(
  preset: Exclude<DatePreset, "personalizado" | "especifica">,
): DateRange {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let from: Date;
  switch (preset) {
    case "diario":
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "semanal": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      break;
    }
    case "mensual":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "anual":
      from = new Date(now.getFullYear(), 0, 1);
      break;
  }
  return { preset, from, to };
}

export default function EmptyDateRangeState({
  dateRange,
  metric,
  onChangeRange,
  icon: Icon,
  title,
  description,
  action,
}: Props) {
  const rangeTxt = PRESET_LABELS[dateRange.preset];
  const headline =
    title ??
    `Sin ${metric} ${dateRange.preset === "especifica" ? describeRange(dateRange) : rangeTxt}`;
  const desc =
    description ??
    "Probá ampliar el rango o cambiá a otro período. Cuando empieces a registrar movimientos, los datos van a aparecer acá.";

  const handleQuick = useCallback(
    (p: Exclude<DatePreset, "personalizado" | "especifica">) => {
      onChangeRange?.(computeQuickRange(p));
    },
    [onChangeRange],
  );

  // Chips solo para presets diferentes al actual
  const chips = (["diario", "semanal", "mensual", "anual"] as const).filter(
    (p) => p !== dateRange.preset,
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-12 sm:py-16">
      {/* Aura sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklab, var(--accent) 6%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-md text-center">
        {/* Ilustración */}
        <div className="mx-auto mb-6 flex items-center justify-center">
          {Icon ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--accent-soft,color-mix(in oklab, var(--accent) 8%, transparent))] text-[var(--accent)]">
              <Icon className="h-10 w-10" strokeWidth={1.75} />
            </div>
          ) : (
            <div className="text-[var(--accent)] opacity-90">
              <PaicheMascot size={140} strokeWidth={1.5} />
            </div>
          )}
        </div>

        {/* Headline */}
        <h3 className="text-[length:clamp(1.25rem,2.5vw,1.625rem)] font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {headline}
        </h3>

        {/* Descripción */}
        <p className="mt-3 text-[length:var(--ts-base)] font-medium text-[var(--text-secondary)] leading-relaxed">
          {desc}
        </p>

        {/* Quick range chips */}
        {onChangeRange && chips.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              <Calendar className="h-3.5 w-3.5" />
              Probá con
            </span>
            {chips.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleQuick(p)}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-2 text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-md"
              >
                {p === "diario"
                  ? "Hoy"
                  : p === "semanal"
                    ? "Esta semana"
                    : p === "mensual"
                      ? "Este mes"
                      : "Este año"}
              </button>
            ))}
          </div>
        )}

        {/* Acción adicional opcional */}
        {action && (
          <div className="mt-6">
            {action.href ? (
              <a
                href={action.href}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[length:var(--ts-sm)] font-extrabold text-white shadow-md hover:gap-2 transition-all"
              >
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[length:var(--ts-sm)] font-extrabold text-white shadow-md hover:gap-2 transition-all"
              >
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
