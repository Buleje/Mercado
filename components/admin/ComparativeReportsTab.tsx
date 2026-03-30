"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Comparison = "mes_pasado" | "mismo_mes_anyo";

interface PeriodData {
  ventas: number;
  pedidos: number;
  ticketPromedio: number;
  margen: number;
  clientesNuevos: number;
  fiadosPendientes: number;
}

interface MetricaDef {
  key: keyof PeriodData;
  label: string;
  prefix: string;
  higherIsBetter: boolean;
}

const METRICAS: MetricaDef[] = [
  { key: "ventas",           label: "Ventas totales",       prefix: "S/",  higherIsBetter: true  },
  { key: "pedidos",          label: "Pedidos",              prefix: "",    higherIsBetter: true  },
  { key: "ticketPromedio",   label: "Ticket promedio",      prefix: "S/",  higherIsBetter: true  },
  { key: "margen",           label: "Margen (%)",           prefix: "",    higherIsBetter: true  },
  { key: "clientesNuevos",   label: "Clientes nuevos",      prefix: "",    higherIsBetter: true  },
  { key: "fiadosPendientes", label: "Fiados pendientes",    prefix: "S/",  higherIsBetter: false },
];

const TOP_CHART_KEYS: (keyof PeriodData)[] = ["ventas", "pedidos", "ticketPromedio", "margen", "clientesNuevos"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtValue(key: keyof PeriodData, value: number) {
  const m = METRICAS.find(m => m.key === key);
  if (!m) return String(value);
  if (m.prefix === "S/") {
    return `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (key === "margen") return `${value.toFixed(1)}%`;
  return value.toLocaleString("es-PE");
}

function calcChange(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return ((a - b) / Math.abs(b)) * 100;
}

function getPeriodDates(comparison: Comparison) {
  const now = new Date();
  const yearA = now.getFullYear();
  const monthA = now.getMonth();

  const startA = new Date(yearA, monthA, 1).toISOString().slice(0, 10);
  const endA = new Date(yearA, monthA + 1, 0).toISOString().slice(0, 10);

  let startB: string;
  let endB: string;
  let labelA: string;
  let labelB: string;

  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  if (comparison === "mes_pasado") {
    const prevDate = new Date(yearA, monthA - 1, 1);
    startB = prevDate.toISOString().slice(0, 10);
    endB = new Date(yearA, monthA, 0).toISOString().slice(0, 10);
    labelA = `${monthNames[monthA]} ${yearA}`;
    labelB = `${monthNames[prevDate.getMonth()]} ${prevDate.getFullYear()}`;
  } else {
    startB = new Date(yearA - 1, monthA, 1).toISOString().slice(0, 10);
    endB = new Date(yearA - 1, monthA + 1, 0).toISOString().slice(0, 10);
    labelA = `${monthNames[monthA]} ${yearA}`;
    labelB = `${monthNames[monthA]} ${yearA - 1}`;
  }

  return { startA, endA, startB, endB, labelA, labelB };
}

function mapResponse(json: Record<string, unknown>): PeriodData {
  const ventas = Number(json.totalRevenue ?? json.ventas ?? json.revenue ?? 0);
  const pedidos = Number(json.totalOrders ?? json.pedidos ?? json.orders ?? 0);
  const ticketPromedio = pedidos > 0 ? ventas / pedidos : Number(json.ticketPromedio ?? 0);
  const margen = Number(json.margin ?? json.margen ?? 0);
  const clientesNuevos = Number(json.newCustomers ?? json.clientesNuevos ?? 0);
  const fiadosPendientes = Number(json.fiadosPending ?? json.fiadosPendientes ?? 0);
  return { ventas, pedidos, ticketPromedio, margen, clientesNuevos, fiadosPendientes };
}

// ── Trend Badge ───────────────────────────────────────────────────────────────

function TrendBadge({ change, higherIsBetter }: { change: number; higherIsBetter: boolean }) {
  const isGood = higherIsBetter ? change > 0 : change < 0;
  const isNeutral = Math.abs(change) < 0.5;

  if (isNeutral) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
        <Minus className="h-2.5 w-2.5" /> {change >= 0 ? "+" : ""}{change.toFixed(1)}%
      </span>
    );
  }

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
      isGood
        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
    )}>
      {change > 0
        ? <TrendingUp className="h-2.5 w-2.5" />
        : <TrendingDown className="h-2.5 w-2.5" />}
      {change > 0 ? "+" : ""}{change.toFixed(1)}%
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ComparativeReportsTab() {
  const [comparison, setComparison] = useState<Comparison>("mes_pasado");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dataA, setDataA] = useState<PeriodData | null>(null);
  const [dataB, setDataB] = useState<PeriodData | null>(null);

  const periods = useMemo(() => getPeriodDates(comparison), [comparison]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/admin/dashboard?from=${periods.startA}&to=${periods.endA}`),
        fetch(`/api/admin/dashboard?from=${periods.startB}&to=${periods.endB}`),
      ]);

      const [jsonA, jsonB] = await Promise.all([
        resA.ok ? resA.json() : {},
        resB.ok ? resB.json() : {},
      ]);

      setDataA(mapResponse(jsonA));
      setDataB(mapResponse(jsonB));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos comparativos");
    } finally {
      setLoading(false);
    }
  }, [periods]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartData = useMemo(() => {
    if (!dataA || !dataB) return [];
    return TOP_CHART_KEYS.map(key => {
      const m = METRICAS.find(m => m.key === key)!;
      return {
        name: m.label,
        [periods.labelA]: dataA[key],
        [periods.labelB]: dataB[key],
      };
    });
  }, [dataA, dataB, periods]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 border-4 border-[#2d6a4f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        <button onClick={fetchData} className="text-xs text-[#2d6a4f] hover:underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#2d6a4f] text-white flex items-center justify-center shadow-sm shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Reportes Comparativos</h2>
            <p className="text-xs text-gray-500 dark:text-muted">Comparación de métricas entre períodos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector */}
          <div className="flex bg-gray-100 dark:bg-white/5 rounded-xl p-0.5 gap-0.5">
            {(["mes_pasado", "mismo_mes_anyo"] as Comparison[]).map(opt => (
              <button
                key={opt}
                onClick={() => setComparison(opt)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  comparison === opt
                    ? "bg-white dark:bg-card text-[#2d6a4f] shadow-sm"
                    : "text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground",
                )}
              >
                {opt === "mes_pasado" ? "vs. Mes pasado" : "vs. Mismo mes año anterior"}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Actualizar"
          >
            <RefreshCw className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </div>

      {dataA && dataB && (
        <>
          {/* Table */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-card-border">
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-gray-400">Métrica</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase text-primary">{periods.labelA}</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase text-gray-400">{periods.labelB}</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase text-gray-400">Cambio</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase text-gray-400">Tendencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                  {METRICAS.map(m => {
                    const valA = dataA[m.key];
                    const valB = dataB[m.key];
                    const change = calcChange(valA, valB);
                    return (
                      <tr key={m.key} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{m.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-bold font-mono text-gray-900 dark:text-white">{fmtValue(m.key, valA)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-mono text-gray-500 dark:text-muted">{fmtValue(m.key, valB)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            "text-xs font-bold font-mono",
                            change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                          )}>
                            {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <TrendBadge change={change} higherIsBetter={m.higherIsBetter} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">Top 5 métricas — comparación</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border, #e5e7eb)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--muted, #9ca3af)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted, #9ca3af)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card, #fff)",
                      border: "1px solid var(--card-border, #e5e7eb)",
                      borderRadius: "0.5rem",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey={periods.labelA} fill="#2d6a4f" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={periods.labelB} fill="#f4a261" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
