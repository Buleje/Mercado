"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "@buleje/design-system/icons";
import { VacioMetricas } from "@/components/admin/analisis/metricas-tarjetas";
import type { Sale, SaleItem } from "@/types/erp";
import { formatCurrency, formatDateShort } from "@/lib/format";

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
    return formatDateShort(dateStr);
  } catch {
    return dateStr;
  }
}

function fmt(n: number) {
  return `${formatCurrency(n)}`;
}

const SEVERITY_STYLE: Record<Severity, { bg: string; text: string; border: string; dot: string; label: string }> = {
  info:     { bg: "bg-primary/10 dark:bg-primary/15",   text: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",   border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30",   dot: "bg-primary/10",  label: "Info" },
  warning:  { bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20", text: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", border: "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]", dot: "bg-[var(--data-warning-500)]", label: "Aviso" },
  critical: { bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20",     text: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",     border: "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]",     dot: "bg-[var(--data-error-500)]",   label: "Crítico" },
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
        what: `Ventas de ${fmt(val)} en un día`,
        when: fmtDate(day),
        deviation: `+${deviations.toFixed(1)} desv. est. sobre el promedio (${fmt(avgDaily)}/día)`,
        cause: "Posible evento especial, promoción o pago de quincena",
        severity: "info",
      });
    } else if (deviations < -2 && avgDaily > 0) {
      anomalies.push({
        id: `low-${day}`,
        type: "Venta baja",
        what: `Ventas de solo ${fmt(val)} en un día`,
        when: fmtDate(day),
        deviation: `${deviations.toFixed(1)} desv. est. bajo el promedio (${fmt(avgDaily)}/día)`,
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
        what: `Tasa de cancelación: ${cancelRate.toFixed(1)}% (${cancelled}/${orders.length} pedidos)`,
        when: "Período seleccionado",
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
          what: `"${p.name}" vende ${Number(p.rate).toFixed(1)} unid/día (${p.units} total)`,
          when: `Últimos ${p.daysActive} días activos`,
          deviation: `+${dev.toFixed(1)} desv. est. sobre productos similares`,
          cause: "Producto viral, promoción activa o temporada específica",
          severity: "info",
        });
      } else if (dev < -2 && p.daysActive > 3) {
        anomalies.push({
          id: `stall-${p.name}`,
          type: "Producto estancado",
          what: `"${p.name}" solo vende ${Number(p.rate).toFixed(1)} unid/día`,
          when: `Últimos ${p.daysActive} días`,
          deviation: `${dev.toFixed(1)} desv. est. bajo el promedio de productos`,
          cause: "Revisar: precio, visibilidad en catálogo, vencimiento o competencia",
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

  // Sin nada fuera de lo normal: el estado vacío del panel, no tres casillas en 0.
  if (anomalies.length === 0) {
    return (
      <VacioMetricas
        icono={CheckCircle2}
        titulo="Sin días fuera de lo normal"
        descripcion="Hacen falta al menos 10 días con ventas para comparar cada día contra tu promedio."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* Cuántas de cada gravedad */}
      <div className="flex gap-2">
        {(["critical", "warning", "info"] as Severity[]).map((sev) => {
          const style = SEVERITY_STYLE[sev];
          return (
            <div key={sev} className={cn("flex-1 rounded-lg border p-2 text-center", style.bg, style.border)}>
              <p className={cn("text-lg font-bold", style.text)}>{counts[sev]}</p>
              <p className={cn("text-sm font-medium", style.text)}>{style.label}</p>
            </div>
          );
        })}
      </div>

      <div className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
        {anomalies.map((anomaly) => {
          const style = SEVERITY_STYLE[anomaly.severity];
          return (
            <div key={anomaly.id} className={cn("rounded-lg border p-3", style.bg, style.border)}>
              <div className="flex items-start gap-2">
                <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", style.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-x-2">
                    <span className={cn("text-sm font-bold", style.text)}>{style.label}</span>
                    <span className={cn("text-sm", style.text)}>{anomaly.type}</span>
                    <span className="ml-auto shrink-0 text-sm text-[var(--text-tertiary)]">{anomaly.when}</span>
                  </div>
                  <p className={cn("text-sm font-medium leading-snug", style.text)}>{anomaly.what}</p>
                  <p className="mt-0.5 text-sm leading-snug text-[var(--text-secondary)]">
                    Desviación: {anomaly.deviation} · Posible causa: {anomaly.cause}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
