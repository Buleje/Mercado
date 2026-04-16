"use client";

/**
 * MeteringCard.client — componentes interactivos (sparklines + tooltips)
 * "use client" se ubica aquí, lo más abajo posible en el árbol.
 * El RSC padre (MeteringCard.tsx) importa estos componentes y los renderiza.
 */

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { MeteredEvent } from "@/lib/billing/metering";
import type { MeteringSnapshot, TrafficLight } from "./types";
import { EVENT_LABELS, PLAN_LABELS, computePercentage, computeTrafficLight } from "./types";

// ─── Sparkline por métrica ────────────────────────────────────────────────────

interface SparklineProps {
  event: MeteredEvent;
  data: number[];
  color: string;
  label: string;
}

function Sparkline({ data, color, label }: SparklineProps) {
  const chartData = data.map((value, i) => ({ day: `D-${7 - i}`, value }));

  return (
    <div aria-label={`Gráfico de tendencia 7 días: ${label}`} role="img" className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine y={0} stroke="transparent" />
          <Tooltip
            contentStyle={{
              fontSize: "11px",
              padding: "4px 8px",
              borderRadius: "6px",
              backgroundColor: "var(--tooltip-bg, #1f2937)",
              border: "none",
              color: "#f9fafb",
            }}
            formatter={(value) => [value, label]}
            labelFormatter={(lbl) => String(lbl)}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Barra de progreso por métrica ────────────────────────────────────────────

interface QuotaBarProps {
  used: number;
  limit: number;
  light: TrafficLight;
  event: MeteredEvent;
}

const LIGHT_COLORS: Record<TrafficLight, string> = {
  green:  "bg-emerald-500 dark:bg-emerald-400",
  yellow: "bg-amber-400  dark:bg-amber-300",
  red:    "bg-red-500    dark:bg-red-400",
};

const LIGHT_TEXT: Record<TrafficLight, string> = {
  green:  "text-emerald-700 dark:text-emerald-300",
  yellow: "text-amber-700   dark:text-amber-300",
  red:    "text-red-700     dark:text-red-400",
};

function QuotaBar({ used, limit, light, event }: QuotaBarProps) {
  const pct = computePercentage(used, limit);
  const label = EVENT_LABELS[event];

  return (
    <div className="w-full" role="group" aria-label={`Cuota de ${label}`}>
      <div
        className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% de cuota utilizada para ${label}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${LIGHT_COLORS[light]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs mt-0.5 text-right ${LIGHT_TEXT[light]}`}>
        {limit === Infinity ? "Sin límite" : `${used.toLocaleString("es-PE")} / ${limit.toLocaleString("es-PE")}`}
      </p>
    </div>
  );
}

// ─── Celda individual de métrica ──────────────────────────────────────────────

interface MetricCellProps {
  event: MeteredEvent;
  snapshot: MeteringSnapshot;
}

function MetricCell({ event, snapshot }: MetricCellProps) {
  const used = snapshot.usage[event] ?? 0;
  const quota = snapshot.quotas[event];
  const limit = quota?.limit ?? Infinity;
  const light = computeTrafficLight(used, limit);
  const sparklineData = snapshot.sparklines[event] ?? Array(7).fill(0);
  const label = EVENT_LABELS[event];

  const SPARKLINE_COLORS: Record<TrafficLight, string> = {
    green:  "#10b981",
    yellow: "#f59e0b",
    red:    "#ef4444",
  };

  return (
    <div
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col gap-2 min-h-[44px]"
      aria-label={`Métrica: ${label}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate pr-2">
          {label}
        </span>
        <span
          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${LIGHT_COLORS[light]}`}
          aria-label={`Estado: ${light === "green" ? "saludable" : light === "yellow" ? "advertencia" : "crítico"}`}
        />
      </div>

      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
        {used.toLocaleString("es-PE")}
      </p>

      <QuotaBar used={used} limit={limit} light={light} event={event} />

      <Sparkline event={event} data={sparklineData} color={SPARKLINE_COLORS[light]} label={label} />
    </div>
  );
}

// ─── Badge de plan ────────────────────────────────────────────────────────────

interface PlanBadgeProps {
  plan: MeteringSnapshot["plan"];
}

const PLAN_BADGE_STYLES: Record<MeteringSnapshot["plan"], string> = {
  free:       "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  starter:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  pro:        "bg-primary-dark/10 text-primary-dark dark:bg-emerald-900/40 dark:text-emerald-300",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export function PlanBadge({ plan }: PlanBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${PLAN_BADGE_STYLES[plan]}`}
      aria-label={`Plan actual: ${PLAN_LABELS[plan]}`}
    >
      {PLAN_LABELS[plan]}
    </span>
  );
}

// ─── Componente principal interactivo ────────────────────────────────────────

const PRIORITY_EVENTS: MeteredEvent[] = [
  "order.created",
  "ai.call",
  "storage.blob",
  "whatsapp.sent",
];

interface MeteringCardClientProps {
  snapshot: MeteringSnapshot;
  onUpgrade?: () => void;
}

export function MeteringCardClient({ snapshot, onUpgrade }: MeteringCardClientProps) {
  const [expanded, setExpanded] = useState(false);

  const allEvents = Object.keys(snapshot.usage) as MeteredEvent[];
  const visibleEvents = expanded ? allEvents : PRIORITY_EVENTS;

  const hasWarning = allEvents.some((evt) => {
    const used = snapshot.usage[evt] ?? 0;
    const limit = snapshot.quotas[evt]?.limit ?? Infinity;
    return computeTrafficLight(used, limit) !== "green";
  });

  const hasCritical = allEvents.some((evt) => {
    const used = snapshot.usage[evt] ?? 0;
    const limit = snapshot.quotas[evt]?.limit ?? Infinity;
    return computeTrafficLight(used, limit) === "red";
  });

  return (
    <section
      aria-label="Uso facturable del mes"
      className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 flex flex-col gap-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Uso facturable
          </h2>
          <PlanBadge plan={snapshot.plan} />
          {hasCritical && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              role="alert"
              aria-live="polite"
            >
              Limite alcanzado
            </span>
          )}
          {!hasCritical && hasWarning && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              role="status"
              aria-live="polite"
            >
              Cerca del limite
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400">Costo estimado</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              USD {snapshot.estimatedCostUsd.toFixed(2)}
            </p>
          </div>
          {(snapshot.plan === "free" || snapshot.plan === "starter") && (
            <button
              onClick={onUpgrade}
              className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg bg-primary-dark hover:bg-[#245a42] text-white text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-dark"
              aria-label="Mejorar plan de facturación"
            >
              Mejorar plan
            </button>
          )}
        </div>
      </div>

      {/* Grid de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleEvents.map((event) => (
          <MetricCell key={event} event={event} snapshot={snapshot} />
        ))}
      </div>

      {/* Toggle ver todas */}
      {allEvents.length > PRIORITY_EVENTS.length && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="min-h-[44px] text-sm text-primary-dark dark:text-emerald-400 hover:underline font-medium self-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-dark"
          aria-expanded={expanded}
          aria-controls="metering-all-metrics"
        >
          {expanded ? "Ver menos métricas" : `Ver todas (${allEvents.length})`}
        </button>
      )}

      {/* Período */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-auto">
        Período:{" "}
        {new Date(snapshot.period.from).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
        {" – "}
        {new Date(snapshot.period.to).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
      </p>
    </section>
  );
}
