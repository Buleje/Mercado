"use client";

import { useState, useMemo, useEffect, startTransition } from "react";
import { GitCompareArrows, ArrowUp, ArrowDown, Minus, Calendar, Download, BarChart3 } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Metric = { label: string; periodA: number; periodB: number; format: "money" | "number" | "pct" };

function fmt(n: number) { return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtNum(n: number, format: Metric["format"]) {
  if (format === "money") return fmt(n);
  if (format === "pct") return `${n.toFixed(1)}%`;
  return n.toLocaleString("es-PE");
}

const PRESETS = [
  { id: "week", label: "Semana vs anterior", aLabel: "Esta semana", bLabel: "Semana pasada" },
  { id: "month", label: "Mes vs anterior", aLabel: "Este mes", bLabel: "Mes pasado" },
  { id: "quarter", label: "Trimestre vs anterior", aLabel: "Q actual", bLabel: "Q anterior" },
  { id: "year", label: "Año vs anterior", aLabel: "Este año", bLabel: "Año pasado" },
  { id: "custom", label: "Personalizado", aLabel: "Periodo A", bLabel: "Periodo B" },
];

type SaleRecord = { total: number; totalCogs?: number; customerPhone?: string; createdAt: string; items?: Array<unknown> };

/** Get the [start, end) Date boundaries for each preset period and its comparison */
function getPeriodBounds(preset: string): { aStart: Date; aEnd: Date; bStart: Date; bEnd: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "week") {
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; // Mon=0
    const aStart = new Date(today); aStart.setDate(today.getDate() - dayOfWeek);
    const aEnd = new Date(aStart); aEnd.setDate(aStart.getDate() + 7);
    const bStart = new Date(aStart); bStart.setDate(aStart.getDate() - 7);
    const bEnd = new Date(aStart);
    return { aStart, aEnd, bStart, bEnd };
  }
  if (preset === "month") {
    const aStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const aEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const bStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const bEnd = aStart;
    return { aStart, aEnd, bStart, bEnd };
  }
  if (preset === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const aStart = new Date(now.getFullYear(), q * 3, 1);
    const aEnd = new Date(now.getFullYear(), q * 3 + 3, 1);
    const bStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
    const bEnd = aStart;
    return { aStart, aEnd, bStart, bEnd };
  }
  if (preset === "year") {
    const aStart = new Date(now.getFullYear(), 0, 1);
    const aEnd = new Date(now.getFullYear() + 1, 0, 1);
    const bStart = new Date(now.getFullYear() - 1, 0, 1);
    const bEnd = aStart;
    return { aStart, aEnd, bStart, bEnd };
  }
  // custom — default to current month vs previous
  const aStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const aEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const bStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { aStart, aEnd, bStart, bEnd: aStart };
}

function computeMetrics(periodSales: SaleRecord[]): { revenue: number; txns: number; avgTicket: number; uniqueClients: number; cogs: number; grossMargin: number } {
  const revenue = periodSales.reduce((s, x) => s + x.total, 0);
  const txns = periodSales.length;
  const avgTicket = txns > 0 ? revenue / txns : 0;
  const uniqueClients = new Set(periodSales.map(x => x.customerPhone ?? "anon")).size;
  const cogs = periodSales.reduce((s, x) => s + (x.totalCogs ?? 0), 0);
  const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0;
  return { revenue, txns, avgTicket, uniqueClients, cogs, grossMargin };
}

function buildMetrics(aM: ReturnType<typeof computeMetrics>, bM: ReturnType<typeof computeMetrics>): Metric[] {
  return [
    { label: "Ventas totales", periodA: aM.revenue, periodB: bM.revenue, format: "money" },
    { label: "Nº transacciones", periodA: aM.txns, periodB: bM.txns, format: "number" },
    { label: "Ticket promedio", periodA: aM.avgTicket, periodB: bM.avgTicket, format: "money" },
    { label: "Clientes únicos", periodA: aM.uniqueClients, periodB: bM.uniqueClients, format: "number" },
    { label: "Costo de ventas", periodA: aM.cogs, periodB: bM.cogs, format: "money" },
    { label: "Margen bruto", periodA: aM.grossMargin, periodB: bM.grossMargin, format: "pct" },
  ];
}

export default function PeriodComparatorTab() {
  const [preset, setPreset] = useState("month");
  const [allSales, setAllSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        startTransition(() => {
          setAllSales((data?.sales ?? []) as SaleRecord[]);
          setLoading(false);
        });
      })
      .catch(() => startTransition(() => setLoading(false)));
  }, []);

  const data = useMemo<Metric[]>(() => {
    if (allSales.length === 0) return [];
    const { aStart, aEnd, bStart, bEnd } = getPeriodBounds(preset);
    const aSales = allSales.filter(s => { const d = new Date(s.createdAt); return d >= aStart && d < aEnd; });
    const bSales = allSales.filter(s => { const d = new Date(s.createdAt); return d >= bStart && d < bEnd; });
    return buildMetrics(computeMetrics(aSales), computeMetrics(bSales));
  }, [allSales, preset]);
  const current = PRESETS.find(p => p.id === preset) ?? PRESETS[1];

  const improvements = useMemo(() => data.filter(m => {
    const change = m.periodA - m.periodB;
    // For "bad" metrics (devoluciones, stock agotado), decrease is good
    const isInverse = m.label.includes("Devoluciones") || m.label.includes("Stock agotado");
    return isInverse ? change < 0 : change > 0;
  }).length, [data]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><GitCompareArrows className="h-6 w-6 text-primary" /> Comparador de Periodos</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Compara métricas clave entre dos rangos de fecha</p>
        </div>
        <button onClick={() => exportToCSV(data.map(m => ({ metrica: m.label, [current.aLabel]: fmtNum(m.periodA, m.format), [current.bLabel]: fmtNum(m.periodB, m.format), cambio: `${((m.periodA - m.periodB) / m.periodB * 100).toFixed(1)}%` })), `comparador-${preset}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10 transition-colors"><Download className="h-3.5 w-3.5" /> Exportar CSV</button>
      </div>

      {/* Preset selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-4 w-4 text-gray-400" />
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => setPreset(p.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", preset === p.id ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-accent")}>{p.label}</button>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Resumen</h3>
          <span className="text-xs font-semibold text-emerald-600">{improvements}/{data.length} métricas mejoraron</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-center text-xs font-bold text-gray-500 dark:text-muted mb-3">
          <span>Métrica</span>
          <span className="text-blue-600">{current.aLabel}</span>
          <span className="text-violet-600">{current.bLabel}</span>
        </div>
      </div>

      {/* Comparison cards */}
      {loading ? (
        <div className="text-center py-10 text-sm text-gray-400">Cargando datos de ventas...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-10">
          <BarChart3 className="h-10 w-10 text-gray-200 dark:text-surface mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-400">Sin ventas en este período</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.map(m => {
          const diff = m.periodA - m.periodB;
          const pct = m.periodB !== 0 ? (diff / m.periodB) * 100 : 0;
          const isInverse = m.label.includes("Devoluciones") || m.label.includes("Stock agotado");
          const isGood = isInverse ? diff <= 0 : diff >= 0;
          const maxVal = Math.max(m.periodA, m.periodB);

          return (
            <div key={m.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-gray-900 dark:text-foreground">{m.label}</span>
                <span className={cn("flex items-center gap-0.5 text-xs font-bold", isGood ? "text-emerald-500" : "text-red-500")}>
                  {diff === 0 ? <Minus className="h-3 w-3" /> : isGood ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-blue-600 font-semibold">{current.aLabel}</span>
                    <span className="font-bold text-gray-900 dark:text-foreground">{fmtNum(m.periodA, m.format)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(m.periodA / maxVal) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-violet-600 font-semibold">{current.bLabel}</span>
                    <span className="font-bold text-gray-900 dark:text-foreground">{fmtNum(m.periodB, m.format)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${(m.periodB / maxVal) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
