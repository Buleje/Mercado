"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { RefreshCw, TrendingUp, TrendingDown, Wallet } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

// Shape from /api/analytics/cash-flow
interface CashFlowDia {
  fecha: string;
  ingresos: number;
  egresos: number;
  balance: number;
  isProjected: boolean;
}

interface CashFlowResponse {
  dias: CashFlowDia[];
  resumen: {
    promedioIngreso: number;
    promedioEgreso: number;
    saldoProyectado7d: number;
  };
}

// Fallback shape from /api/analytics/rentabilidad
interface RentabilidadDia {
  fecha: string;
  ingresos: number;
  costos: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(v: number): string {
  if (Math.abs(v) >= 1000) return `S/ ${(v / 1000).toFixed(1)}k`;
  return `S/ ${v.toFixed(0)}`;
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

interface ChartDia extends CashFlowDia {
  egresosNeg: number;
}

function CashFlowTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDia }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-[var(--rule-base)] px-4 py-3 min-w-[180px]">
      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5">
        {formatDate(d.fecha)}
        {d.isProjected && <span className="ml-2 text-[length:var(--ts-2xs)] font-normal text-amber-500">(Proyectado)</span>}
      </p>
      <p className="text-xs text-gray-500 flex justify-between gap-4">
        <span>Ingresos</span>
        <span className="font-mono font-medium text-[#00B4A6]">{formatCurrency(d.ingresos)}</span>
      </p>
      <p className="text-xs text-gray-500 flex justify-between gap-4">
        <span>Egresos</span>
        <span className="font-mono font-medium text-[#e63946]">{formatCurrency(d.egresos)}</span>
      </p>
      <div className="border-t border-[var(--rule-base)] dark:border-gray-600 mt-1.5 pt-1.5">
        <p className="text-xs flex justify-between gap-4">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Balance</span>
          <span className={cn("font-mono font-bold", d.balance >= 0 ? "text-[#00B4A6]" : "text-[#e63946]")}>{formatCurrency(d.balance)}</span>
        </p>
      </div>
    </div>
  );
}

// ─── Period pills ────────────────────────────────────────────────────────────
type CashFlowPeriod = "30d" | "60d" | "90d";
const CF_PILLS: { key: CashFlowPeriod; label: string; days: number }[] = [
  { key: "30d", label: "30D", days: 30 },
  { key: "60d", label: "60D", days: 60 },
  { key: "90d", label: "90D", days: 90 },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function CashFlowChart() {
  const [rawData, setRawData] = useState<CashFlowDia[]>([]);
  const [resumen, setResumen] = useState<CashFlowResponse["resumen"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cfPeriod, setCfPeriod] = useState<CashFlowPeriod>("30d");

  const fetchData = useCallback(async (days: number) => {
    try {
      setError(false);
      setLoading(true);
      // Try dedicated cash-flow endpoint
      const res = await fetch(`/api/analytics/cash-flow?days=${days}`, { credentials: "include" });

      if (res.ok) {
        const json: CashFlowResponse = await res.json();
        setRawData(json.dias ?? []);
        setResumen(json.resumen ?? null);
        return;
      }

      // Fallback: use rentabilidad data and transform
      const fallbackRes = await fetch("/api/analytics/rentabilidad", { credentials: "include" });
      if (!fallbackRes.ok) throw new Error("fetch failed");
      const json = await fallbackRes.json();
      const items: RentabilidadDia[] = Array.isArray(json) ? json : json.dias ?? [];

      let runningBalance = 0;
      const today = new Date().toISOString().slice(0, 10);
      const transformed: CashFlowDia[] = items.map((d) => {
        const ingresos = d.ingresos ?? 0;
        const egresos = d.costos ?? 0;
        runningBalance += ingresos - egresos;
        return {
          fecha: d.fecha,
          ingresos,
          egresos,
          balance: Math.round(runningBalance * 100) / 100,
          isProjected: d.fecha > today,
        };
      });
      setRawData(transformed);
      setResumen(null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const days = CF_PILLS.find(p => p.key === cfPeriod)?.days ?? 30;
    fetchData(days);
  }, [cfPeriod, fetchData]);

  // Transform for chart: egresos as negative values for downward bars
  const chartData = useMemo((): ChartDia[] => {
    return rawData.map((d) => ({
      ...d,
      egresosNeg: -Math.abs(d.egresos),
    }));
  }, [rawData]);

  // ── Summary KPIs ──
  const summary = useMemo(() => {
    if (resumen) {
      return {
        totalIngresos: resumen.promedioIngreso * 30,
        totalEgresos: resumen.promedioEgreso * 30,
        balanceFinal: resumen.saldoProyectado7d,
      };
    }
    if (!rawData.length) return null;
    const realDays = rawData.filter((d) => !d.isProjected);
    const totalIngresos = realDays.reduce((s, d) => s + d.ingresos, 0);
    const totalEgresos = realDays.reduce((s, d) => s + d.egresos, 0);
    const balanceFinal = rawData[rawData.length - 1]?.balance ?? 0;
    return { totalIngresos, totalEgresos, balanceFinal };
  }, [rawData, resumen]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-gray-900 p-4">
        <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse" />
        <div className="grid grid-cols-3 gap-3 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-56 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 flex flex-col items-center justify-center h-64">
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">No se pudieron cargar los datos de flujo de caja</p>
        <button
          onClick={() => { const days = CF_PILLS.find(p => p.key === cfPeriod)?.days ?? 30; fetchData(days); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 transition-colors"
        >
          <RefreshCw className="h-3 w-3 inline mr-1" />
          Reintentar
        </button>
      </div>
    );
  }

  // ── Empty ──
  if (!chartData.length) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-gray-900 p-6 flex items-center justify-center h-64">
        <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos de flujo de caja</p>
      </div>
    );
  }

  const summaryCards = summary
    ? [
        { label: "Total ingresos", value: formatCurrency(summary.totalIngresos), icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
        { label: "Total egresos", value: formatCurrency(summary.totalEgresos), icon: TrendingDown, color: "text-red-500 dark:text-red-400" },
        { label: "Balance proyectado", value: formatCurrency(summary.balanceFinal), icon: Wallet, color: summary.balanceFinal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400" },
      ]
    : [];

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-gray-900 p-4">
      {/* Header + period pills */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Flujo de Caja
        </h3>
        <div className="flex items-center gap-1">
          {CF_PILLS.map((p) => (
            <button
              key={p.key}
              onClick={() => setCfPeriod(p.key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                cfPeriod === p.key
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {summaryCards.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-xl border border-[var(--rule-base)] bg-gray-50 dark:bg-gray-800/50 p-3 "
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400 font-medium">
                    {card.label}
                  </span>
                </div>
                <p className={cn("text-xl font-mono font-bold", card.color)} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {card.value}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
          <XAxis
            dataKey="fecha"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="bars"
            tickFormatter={(v: number) => v >= 0 ? `S/${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}` : `-S/${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(0)}k` : Math.abs(v)}`}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={55}
          />
          <YAxis
            yAxisId="line"
            orientation="right"
            tickFormatter={(v: number) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip content={<CashFlowTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
          />
          <ReferenceLine yAxisId="bars" y={0} stroke="#9ca3af" strokeWidth={1} />

          <Bar
            yAxisId="bars"
            dataKey="ingresos"
            fill="#00B4A6"
            radius={[4, 4, 0, 0]}
            barSize={12}
            isAnimationActive={false}
            name="Ingresos"
          />
          <Bar
            yAxisId="bars"
            dataKey="egresosNeg"
            fill="#e63946"
            radius={[0, 0, 4, 4]}
            barSize={12}
            isAnimationActive={false}
            name="Egresos"
          />
          <Line
            yAxisId="line"
            type="monotone"
            dataKey="balance"
            stroke="#f97316"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#f97316", stroke: "#fff", strokeWidth: 1 }}
            isAnimationActive={false}
            name="Balance"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
