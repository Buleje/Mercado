"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Sale, SaleItem } from "@/types/erp";

// ── Types ──────────────────────────────────────────────────────────────────────
type OrderStatus = "pendiente" | "completado" | "cancelado" | string;

interface Order {
  id: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  items?: { productId?: string | number; name?: string; quantity: number; price: number }[];
}

interface AnomalyDetectorProps {
  sales: Sale[];
  orders: Order[];
}

type Severity = "info" | "warning" | "critical";

interface Anomaly {
  id: string;
  type: string;
  what: string;
  when: string;
  deviation: string;
  cause: string;
  severity: Severity;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  } catch {
    return dateStr;
  }
}

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SEVERITY_STYLE: Record<Severity, { bg: string; text: string; border: string; dot: string; label: string }> = {
  info:     { bg: "bg-emerald-50 dark:bg-emerald-900/20",   text: "text-emerald-700 dark:text-emerald-300",   border: "border-emerald-200 dark:border-emerald-800",   dot: "bg-emerald-500",  label: "Info" },
  warning:  { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800", dot: "bg-amber-500", label: "Aviso" },
  critical: { bg: "bg-red-50 dark:bg-red-900/20",     text: "text-red-700 dark:text-red-300",     border: "border-red-200 dark:border-red-800",     dot: "bg-red-500",   label: "Critico" },
};

// ── Anomaly Detection Logic ────────────────────────────────────────────────────
function detectAnomalies(sales: Sale[], orders: Order[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Group sales by day
  const salesByDay: Record<string, number> = {};
  sales.forEach((sale) => {
    const day = sale.createdAt.slice(0, 10);
    salesByDay[day] = (salesByDay[day] ?? 0) + (sale.total ?? 0);
  });

  const dayValues = Object.values(salesByDay);
  const dayKeys = Object.keys(salesByDay).sort();
  const avgDaily = mean(dayValues);
  const sdDaily = stdDev(dayValues, avgDaily);

  // Detect high/low days (beyond ±2 SD)
  dayKeys.forEach((day) => {
    const val = salesByDay[day];
    const deviations = sdDaily > 0 ? (val - avgDaily) / sdDaily : 0;
    if (deviations > 2) {
      anomalies.push({
        id: `high-${day}`,
        type: "Venta alta",
        what: `Ventas de ${fmt(val)} en un dia`,
        when: fmtDate(day),
        deviation: `+${deviations.toFixed(1)} desv. est. sobre el promedio (${fmt(avgDaily)}/dia)`,
        cause: "Posible evento especial, promocion o pago de quincena",
        severity: "info",
      });
    } else if (deviations < -2 && avgDaily > 0) {
      anomalies.push({
        id: `low-${day}`,
        type: "Venta baja",
        what: `Ventas de solo ${fmt(val)} en un dia`,
        when: fmtDate(day),
        deviation: `${deviations.toFixed(1)} desv. est. bajo el promedio (${fmt(avgDaily)}/dia)`,
        cause: "Posible cierre anticipado, feriado no registrado o problema de caja",
        severity: deviations < -3 ? "critical" : "warning",
      });
    }
  });

  // Cancellation rate anomaly
  if (orders.length > 10) {
    const cancelled = orders.filter((o) => o.status === "cancelado").length;
    const cancelRate = (cancelled / orders.length) * 100;
    if (cancelRate > 20) {
      anomalies.push({
        id: "cancel-rate",
        type: "Cancelaciones",
        what: `Tasa de cancelacion: ${cancelRate.toFixed(1)}% (${cancelled}/${orders.length} pedidos)`,
        when: "Periodo seleccionado",
        deviation: `${cancelRate.toFixed(1)}% — lo normal es menos del 10%`,
        cause: "Revisar: problemas de stock, demoras en entrega o clientes insatisfechos",
        severity: cancelRate > 30 ? "critical" : "warning",
      });
    }
  }

  // Product velocity anomalies
  const productVolume: Record<string, { name: string; units: number; days: Set<string> }> = {};
  sales.forEach((sale) => {
    const day = sale.createdAt.slice(0, 10);
    (sale.items ?? []).forEach((item: SaleItem) => {
      const key = String(item.productId ?? item.name ?? "?");
      if (!productVolume[key]) productVolume[key] = { name: item.name ?? key, units: 0, days: new Set() };
      productVolume[key].units += item.quantity ?? 1;
      productVolume[key].days.add(day);
    });
  });

  const productRates = Object.values(productVolume).map((p) => ({
    name: p.name,
    rate: p.days.size > 0 ? p.units / p.days.size : 0,
    units: p.units,
    daysActive: p.days.size,
  }));

  if (productRates.length > 5) {
    const rates = productRates.map((p) => p.rate);
    const avgRate = mean(rates);
    const sdRate = stdDev(rates, avgRate);

    productRates.forEach((p) => {
      const dev = sdRate > 0 ? (p.rate - avgRate) / sdRate : 0;
      if (dev > 2.5) {
        anomalies.push({
          id: `velocity-${p.name}`,
          type: "Velocidad de venta",
          what: `"${p.name}" vende ${p.rate.toFixed(1)} unid/dia (${p.units} total)`,
          when: `Ultimos ${p.daysActive} dias activos`,
          deviation: `+${dev.toFixed(1)} desv. est. sobre productos similares`,
          cause: "Producto viral, promocion activa o temporada especifica",
          severity: "info",
        });
      } else if (dev < -2 && p.daysActive > 3) {
        anomalies.push({
          id: `stall-${p.name}`,
          type: "Producto estancado",
          what: `"${p.name}" solo vende ${p.rate.toFixed(1)} unid/dia`,
          when: `Ultimos ${p.daysActive} dias`,
          deviation: `${dev.toFixed(1)} desv. est. bajo el promedio de productos`,
          cause: "Revisar: precio, visibilidad en catalogo, vencimiento o competencia",
          severity: "warning",
        });
      }
    });
  }

  // Sort by severity
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return anomalies.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AnomalyDetector({ sales, orders }: AnomalyDetectorProps) {
  const anomalies = useMemo(() => detectAnomalies(sales, orders), [sales, orders]);

  const counts = useMemo(() => ({
    critical: anomalies.filter((a) => a.severity === "critical").length,
    warning:  anomalies.filter((a) => a.severity === "warning").length,
    info:     anomalies.filter((a) => a.severity === "info").length,
  }), [anomalies]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* Summary badges */}
      <div className="flex gap-2">
        {(["critical", "warning", "info"] as Severity[]).map((sev) => {
          const style = SEVERITY_STYLE[sev];
          return (
            <div
              key={sev}
              className={cn(
                "flex-1 rounded-lg border p-2 text-center",
                style.bg,
                style.border
              )}
            >
              <p className={cn("text-lg font-bold", style.text)}>{counts[sev]}</p>
              <p className={cn("text-[length:var(--ts-2xs)] font-medium", style.text)}>{style.label}</p>
            </div>
          );
        })}
      </div>

      {/* Anomaly list */}
      <div className="flex flex-col gap-2 overflow-auto max-h-80">
        {anomalies.length === 0 && (
          <div className="text-center py-8">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-2">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Sin anomalias detectadas en este periodo</p>
            <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 mt-0.5">
              Necesitas al menos 10 dias de ventas para deteccion estadistica
            </p>
          </div>
        )}

        {anomalies.map((anomaly) => {
          const style = SEVERITY_STYLE[anomaly.severity];
          return (
            <div
              key={anomaly.id}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                style.bg,
                style.border
              )}
            >
              <div className="flex items-start gap-2">
                <div className={cn("w-2 h-2 rounded-full mt-1 shrink-0", style.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn("text-[length:var(--ts-2xs)] font-bold", style.text)}>
                      {style.label}
                    </span>
                    <span className={cn("text-[length:var(--ts-2xs)]", style.text)}>
                      {anomaly.type}
                    </span>
                    <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 ml-auto shrink-0">
                      {anomaly.when}
                    </span>
                  </div>
                  <p className={cn("text-xs font-medium leading-snug", style.text)}>
                    {anomaly.what}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                    Desviacion: {anomaly.deviation}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-600 dark:text-gray-300 mt-1 leading-snug italic">
                    Posible causa: {anomaly.cause}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {anomalies.length > 0 && (
        <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 text-center">
          Umbral estadistico: media ± 2 desviaciones estandar
        </p>
      )}
    </div>
  );
}
