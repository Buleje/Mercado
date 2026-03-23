"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────────

type MetricComparison = {
  id: string;
  label: string;
  current: number;
  previous: number;
  unit: string;
  format: "currency" | "number" | "percent";
  advice?: string;
  tone: "positive" | "negative" | "neutral";
};

// ── Coach engine ───────────────────────────────────────────────────────────────

function buildComparisons(data: BusinessData | null): MetricComparison[] {
  if (!data) return [];

  const { orders, sales, customers } = data;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const prevMonthAgo = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");

  // Revenue helpers
  const revAndTxns = (from: string, to: string) => {
    const ord = validOrders.filter((o) => {
      const d = o.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    });
    const sal = sales.filter((s) => {
      const d = s.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    });
    const rev = ord.reduce((s, o) => s + o.total, 0) + sal.reduce((s, sl) => s + sl.total, 0);
    const txns = ord.length + sal.length;
    return { rev, txns };
  };

  const thisWeek = revAndTxns(weekAgo, now.toISOString().slice(0, 10));
  const lastWeek = revAndTxns(twoWeekAgo, weekAgo);

  // Avg ticket
  const avgTicket = (txns: number, rev: number) => (txns > 0 ? rev / txns : 0);
  const thisAvgTicket = avgTicket(thisWeek.txns, thisWeek.rev);
  const lastAvgTicket = avgTicket(lastWeek.txns, lastWeek.rev);

  // Sales per day
  const thisSalesPerDay = thisWeek.txns / 7;
  const lastSalesPerDay = lastWeek.txns / 7;

  // Cancellation rate
  const cancelThis = orders.filter(
    (o) => o.status === "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= weekAgo
  ).length;
  const cancelLast = orders.filter((o) => {
    const d = o.createdAt?.slice(0, 10) ?? "";
    return o.status === "cancelado" && d >= twoWeekAgo && d < weekAgo;
  }).length;
  const totalThis = orders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo).length;
  const totalLast = orders.filter((o) => {
    const d = o.createdAt?.slice(0, 10) ?? "";
    return d >= twoWeekAgo && d < weekAgo;
  }).length;
  const cancelRateThis = totalThis > 0 ? (cancelThis / totalThis) * 100 : 0;
  const cancelRateLast = totalLast > 0 ? (cancelLast / totalLast) * 100 : 0;

  // New customers
  const newThisWeek = customers.filter((c) => (c.createdAt?.slice(0, 10) ?? "") >= weekAgo).length;
  const newLastWeek = customers.filter((c) => {
    const d = c.createdAt?.slice(0, 10) ?? "";
    return d >= twoWeekAgo && d < weekAgo;
  }).length;

  // Revenue this month vs last month
  const thisMonth = revAndTxns(monthAgo, now.toISOString().slice(0, 10));
  const lastMonth = revAndTxns(prevMonthAgo, monthAgo);

  const results: MetricComparison[] = [];

  const addMetric = (
    id: string,
    label: string,
    current: number,
    previous: number,
    unit: string,
    format: "currency" | "number" | "percent",
    advicePos: string,
    adviceNeg: string
  ): MetricComparison => {
    const delta = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const significant = Math.abs(delta) >= 10;
    const tone: MetricComparison["tone"] = !significant ? "neutral" : delta >= 0 ? "positive" : "negative";
    return {
      id, label, current, previous, unit, format,
      advice: significant ? (delta >= 0 ? advicePos : adviceNeg) : undefined,
      tone,
    };
  };

  results.push(
    addMetric(
      "revenue-week",
      "Ingresos semanales",
      thisWeek.rev, lastWeek.rev, "S/", "currency",
      "Las ventas semanales crecen — mantene el ritmo y cuida el stock de los productos que mas rotan.",
      "Las ventas bajaron esta semana. Revisa si hay productos sin stock o si perdiste horarios de atencion."
    ),
    addMetric(
      "avg-ticket",
      "Ticket promedio",
      thisAvgTicket, lastAvgTicket, "S/", "currency",
      "El ticket promedio sube — la estrategia de combos o precios esta funcionando bien.",
      "El ticket promedio bajo. Activa venta cruzada: sugiere combos en el punto de venta."
    ),
    addMetric(
      "sales-per-day",
      "Ventas por dia",
      thisSalesPerDay, lastSalesPerDay, "txn", "number",
      "Mas transacciones diarias — tu capacidad de atencion esta mejorando.",
      "Menos transacciones por dia. Verifica si hay horas de baja demanda que puedas potenciar con promos."
    ),
    addMetric(
      "cancel-rate",
      "Tasa de cancelacion",
      cancelRateThis, cancelRateLast, "%", "percent",
      cancelRateThis < 5 ? "Cancelaciones bajo control — excelente gestion de pedidos." : "Las cancelaciones bajaron, buena senal. Sigue monitoreando las causas mas comunes.",
      "Las cancelaciones subieron. Identifica las causas: stock, tiempo de espera o precios erroneos."
    ),
    addMetric(
      "new-customers",
      "Clientes nuevos",
      newThisWeek, newLastWeek, "", "number",
      "Mas clientes nuevos esta semana — las acciones de captacion estan funcionando.",
      "Menos clientes nuevos. Considera una promocion de referidos o mayor visibilidad en redes."
    ),
    addMetric(
      "monthly-revenue",
      "Ingresos del mes",
      thisMonth.rev, lastMonth.rev, "S/", "currency",
      "El mes va mejor que el anterior. Enfocate en mantener el servicio y el stock.",
      "El mes va por debajo del anterior. Identifica que cambio: precios, competencia, temporada."
    )
  );

  return results;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatValue(value: number, format: "currency" | "number" | "percent", unit: string): string {
  if (format === "currency") {
    return `S/${value.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (format === "percent") {
    return `${value.toFixed(1)}%`;
  }
  return `${value.toFixed(1)} ${unit}`.trim();
}

function calcDelta(current: number, previous: number): { pct: number; label: string } {
  if (previous === 0) return { pct: 0, label: "N/D" };
  const pct = ((current - previous) / previous) * 100;
  return { pct, label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` };
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

export default function AIPerformanceCoach({ data }: Props) {
  const metrics = useMemo(() => buildComparisons(data), [data]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Coach de Rendimiento
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Comparativa esta semana vs semana anterior. Consejos basados en variaciones mayores al 10%.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        {metrics.map((m) => {
          const { pct, label } = calcDelta(m.current, m.previous);
          const isPositive = pct > 0;
          const isNeutral = Math.abs(pct) < 10 || m.previous === 0;

          // For cancel rate: lower is better
          const isCancelMetric = m.id === "cancel-rate";
          const effectivelyGood = isCancelMetric ? !isPositive : isPositive;

          const TrendIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
          const trendColor = isNeutral
            ? "text-gray-400"
            : effectivelyGood
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-500 dark:text-red-400";

          return (
            <div
              key={m.id}
              className={cn(
                "rounded-xl p-3.5 border transition-colors",
                isNeutral
                  ? "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                  : effectivelyGood
                  ? "border-emerald-100 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-red-100 dark:border-red-800/30 bg-red-50/50 dark:bg-red-950/20"
              )}
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{m.label}</p>
              <div className="flex items-end justify-between">
                <span className="text-xl font-bold text-gray-900 dark:text-gray-50">
                  {formatValue(m.current, m.format, m.unit)}
                </span>
                <div className={cn("flex items-center gap-0.5 text-xs font-semibold", trendColor)}>
                  <TrendIcon className="w-3.5 h-3.5" />
                  {label}
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Antes: {formatValue(m.previous, m.format, m.unit)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Advice section */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
          Consejos del coach
        </h3>
        <div className="flex flex-col gap-2">
          {metrics.filter((m) => m.advice).map((m) => {
            const isCancelMetric = m.id === "cancel-rate";
            const { pct } = calcDelta(m.current, m.previous);
            const effectivelyGood = isCancelMetric ? pct < 0 : pct > 0;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex items-start gap-2.5 p-3 rounded-lg border text-sm",
                  effectivelyGood
                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800/30"
                    : "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-800/30"
                )}
              >
                <div className={cn(
                  "mt-0.5 w-1.5 h-1.5 rounded-full shrink-0",
                  effectivelyGood ? "bg-emerald-500" : "bg-amber-500"
                )} />
                <div>
                  <span className={cn(
                    "text-xs font-semibold block mb-0.5",
                    effectivelyGood ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                  )}>
                    {m.label}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300 text-xs">{m.advice}</span>
                </div>
              </div>
            );
          })}
          {metrics.filter((m) => m.advice).length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Todas las metricas estan estables esta semana. Sin variaciones significativas que reportar.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
