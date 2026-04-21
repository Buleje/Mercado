"use client";

import { CardTitle } from "@buleje/design-system";
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
import { RefreshCw, TrendingUp, TrendingDown, Wallet } from "@buleje/design-system/icons";

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
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] px-4 py-3 min-w-[180px]">
      <p className="text-xs font-semibold text-[var(--text-primary)] mb-1.5">
        {formatDate(d.fecha)}
        {d.isProjected && <span className="ml-2 text-[length:var(--ts-2xs)] font-normal text-[var(--data-warning)]">(Proyectado)</span>}
      </p>
      <p className="text-xs text-[var(--text-secondary)] flex justify-between gap-4">
        <span>Ingresos</span>
        <span className="font-mono font-medium text-primary">{formatCurrency(d.ingresos)}</span>
      </p>
      <p className="text-xs text-[var(--text-secondary)] flex justify-between gap-4">
        <span>Egresos</span>
        <span className="font-mono font-medium text-[var(--data-error)]">{formatCurrency(d.egresos)}</span>
      </p>
      <div className="border-t border-[var(--rule-base)] dark:border-gray-600 mt-1.5 pt-1.5">
        <p className="text-xs flex justify-between gap-4">
          <span className="font-semibold text-[var(--text-secondary)]">Balance</span>
          <span className={cn("font-mono font-bold", d.balance >= 0 ? "text-primary" : "text-[var(--data-error)]")}>{formatCurrency(d.balance)}</span>
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
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse" />
        <div className="grid grid-cols-3 gap-3 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-[var(--surface-sunken)] rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-56 bg-[var(--surface-sunken)] rounded-lg animate-pulse" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="rounded-xl border border-[var(--data-error)] dark:border-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 p-6 flex flex-col items-center justify-center h-64">
        <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)] mb-3">No se pudieron cargar los datos de flujo de caja</p>
        <button
          onClick={() => { const days = CF_PILLS.find(p => p.key === cfPeriod)?.days ?? 30; fetchData(days); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/40 text-[var(--data-error)] dark:text-[var(--data-error)] hover:bg-[var(--data-error)] transition-colors"
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
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 flex items-center justify-center h-64">
        <p className="text-sm text-[var(--text-tertiary)]">No hay datos de flujo de caja</p>
      </div>
    );
  }

  const summaryCards = summary
    ? [
        { label: "Total ingresos", value: formatCurrency(summary.totalIngresos), icon: TrendingUp, color: "text-[var(--data-success)] dark:text-[var(--data-success)]" },
        { label: "Total egresos", value: formatCurrency(summary.totalEgresos), icon: TrendingDown, color: "text-[var(--data-error)] dark:text-[var(--data-error)]" },
        { label: "Balance proyectado", value: formatCurrency(summary.balanceFinal), icon: Wallet, color: summary.balanceFinal >= 0 ? "text-[var(--data-success)] dark:text-[var(--data-success)]" : "text-[var(--data-error)] dark:text-[var(--data-error)]" },
      ]
    : [];

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      {/* Header + period pills */}
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
          Flujo de Caja
        </CardTitle>
        <div className="flex items-center gap-1">
          {CF_PILLS.map((p) => (
            <button
              key={p.key}
              onClick={() => setCfPeriod(p.key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                cfPeriod === p.key
                  ? "bg-gray-900 dark:bg-white text-white dark:text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
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
                className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 p-3 "
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-medium">
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
      <ResponsiveContainer minWidth={0} width="100%" height={400}>
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
