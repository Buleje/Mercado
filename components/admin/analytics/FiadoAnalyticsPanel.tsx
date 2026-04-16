"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import { RefreshCw, AlertTriangle, TrendingDown, TrendingUp, DollarSign } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

// Shape from /api/analytics/fiado-analytics
interface FiadoAnalyticsResponse {
  totales: {
    pendiente: number;
    vencidoHoy: number;
    cobradoEsteMes: number;
    tasaRecuperacion: number;
  };
  distribucion: {
    rango: string;
    monto: number;
    count: number;
    color: string;
  }[];
  tendencia12m: {
    mes: string;
    cobrados: number;
    nuevos: number;
  }[];
  topDeudores: {
    nombre: string;
    phone?: string;
    monto: number;
    dias: number;
    status: "vencido" | "riesgo" | "al_dia";
  }[];
}

// Fallback shape from /api/fiados
interface FiadoRecord {
  id: string;
  customerName?: string;
  customer?: { name: string; phone?: string };
  saldo: number;
  total: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(v: number): string {
  if (Math.abs(v) >= 1000) return `S/ ${(v / 1000).toFixed(1)}k`;
  return `S/ ${v.toFixed(2)}`;
}

function daysBetween(from: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Tooltips ────────────────────────────────────────────────────────────────

function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 min-w-[160px]">
      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5">{payload[0].name}</p>
      <p className="text-xs text-gray-500 flex justify-between gap-4">
        <span>Monto</span>
        <span className="font-mono font-medium text-[#00B4A6]">{formatCurrency(payload[0].value)}</span>
      </p>
    </div>
  );
}

interface TrendRow { mes: string; cobrados: number; nuevos: number }

function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendRow }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const neto = d.cobrados - d.nuevos;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 min-w-[180px]">
      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5">{d.mes}</p>
      <p className="text-xs text-gray-500 flex justify-between gap-4">
        <span>Cobrados</span>
        <span className="font-mono font-medium text-[#00B4A6]">{formatCurrency(d.cobrados)}</span>
      </p>
      <p className="text-xs text-gray-500 flex justify-between gap-4">
        <span>Nuevos</span>
        <span className="font-mono font-medium text-[#e63946]">{formatCurrency(d.nuevos)}</span>
      </p>
      <div className="border-t border-gray-200 dark:border-gray-600 mt-1.5 pt-1.5">
        <p className="text-xs flex justify-between gap-4">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Neto</span>
          <span className={cn("font-mono font-bold", neto >= 0 ? "text-[#00B4A6]" : "text-[#e63946]")}>{formatCurrency(neto)}</span>
        </p>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FiadoAnalyticsPanel() {
  const [v2Data, setV2Data] = useState<FiadoAnalyticsResponse | null>(null);
  const [v1Fiados, setV1Fiados] = useState<FiadoRecord[]>([]);
  const [isV2, setIsV2] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(false);
      // Try dedicated analytics endpoint first
      const res = await fetch("/api/analytics/fiado-analytics", { credentials: "include" });

      if (res.ok) {
        const json: FiadoAnalyticsResponse = await res.json();
        setV2Data(json);
        setIsV2(true);
        return;
      }

      // Fallback: fetch raw fiados
      const fallbackRes = await fetch("/api/fiados?limit=500", { credentials: "include" });
      if (!fallbackRes.ok) throw new Error("fetch failed");
      const json = await fallbackRes.json();
      const items = json.fiados ?? json.data ?? (Array.isArray(json) ? json : []);
      setV1Fiados(items);
      setIsV2(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Compute V1 fallback data ──
  const now = useMemo(() => new Date(), []);

  const v1Computed = useMemo(() => {
    if (isV2 || !v1Fiados.length) return null;

    const activos = v1Fiados.filter((f) => f.status === "ACTIVO");
    const totalPendiente = activos.reduce((s, f) => s + (f.saldo ?? 0), 0);
    const totalClientes = new Set(activos.map((f) => f.customer?.name ?? f.customerName ?? f.id)).size;
    const vencidos = activos.filter((f) => daysBetween(f.createdAt, now) > 30).length;

    // Donut by aging
    const buckets = [
      { rango: "0-7 dias", monto: 0, count: 0, color: "#00B4A6" },
      { rango: "8-30 dias", monto: 0, count: 0, color: "#f97316" },
      { rango: "31-60 dias", monto: 0, count: 0, color: "#f77f00" },
      { rango: "+60 dias", monto: 0, count: 0, color: "#e63946" },
    ];
    for (const f of activos) {
      const days = daysBetween(f.createdAt, now);
      const idx = days <= 7 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : 3;
      buckets[idx].monto += f.saldo ?? 0;
      buckets[idx].count++;
    }

    // Top debtors
    const byCustomer = new Map<string, { monto: number; dias: number }>();
    for (const f of activos) {
      const name = f.customer?.name ?? f.customerName ?? "Sin nombre";
      const prev = byCustomer.get(name);
      const days = daysBetween(f.createdAt, now);
      if (!prev) {
        byCustomer.set(name, { monto: f.saldo ?? 0, dias: days });
      } else {
        prev.monto += f.saldo ?? 0;
        prev.dias = Math.max(prev.dias, days);
      }
    }
    const topDeudores = Array.from(byCustomer.entries())
      .map(([nombre, d]) => ({
        nombre,
        monto: Math.round(d.monto * 100) / 100,
        dias: d.dias,
        status: (d.dias > 30 ? "riesgo" : "al_dia") as "vencido" | "riesgo" | "al_dia",
      }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 10);

    return {
      totales: { pendiente: totalPendiente, vencidoHoy: 0, cobradoEsteMes: 0, tasaRecuperacion: 0 },
      distribucion: buckets.filter((b) => b.monto > 0),
      tendencia12m: [] as TrendRow[],
      topDeudores,
      totalClientes,
      vencidos,
    };
  }, [isV2, v1Fiados, now]);

  // ── Unified data access ──
  const totales = isV2 ? v2Data?.totales : v1Computed?.totales;
  const distribucion = isV2 ? v2Data?.distribucion : v1Computed?.distribucion;
  const tendencia = isV2 ? v2Data?.tendencia12m : v1Computed?.tendencia12m;
  const topDeudores = isV2 ? v2Data?.topDeudores : v1Computed?.topDeudores;

  // ── Loading ──
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
        <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 h-48 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          <div className="flex-1 h-48 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 flex flex-col items-center justify-center h-64">
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">No se pudieron cargar los datos de fiados</p>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 transition-colors"
        >
          <RefreshCw className="h-3 w-3 inline mr-1" />
          Reintentar
        </button>
      </div>
    );
  }

  // ── Empty ──
  if (!totales) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 flex items-center justify-center h-64">
        <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos de fiados registrados</p>
      </div>
    );
  }

  const kpiCards = [
    { label: "Total pendiente", value: formatCurrency(totales.pendiente), icon: DollarSign, accent: "text-red-600 dark:text-red-400" },
    { label: "Vencido hoy", value: formatCurrency(totales.vencidoHoy), icon: AlertTriangle, accent: totales.vencidoHoy > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
    { label: "Cobrado este mes", value: formatCurrency(totales.cobradoEsteMes), icon: TrendingUp, accent: "text-emerald-600 dark:text-emerald-400" },
    { label: "Tasa recuperacion", value: `${totales.tasaRecuperacion.toFixed(1)}%`, icon: TrendingDown, accent: totales.tasaRecuperacion >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400" },
  ];

  const donutData = (distribucion ?? []).filter((d) => d.monto > 0);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
        Analisis de Fiados
      </h3>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 "
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                  {kpi.label}
                </span>
              </div>
              <p className={cn("text-xl font-mono font-bold", kpi.accent)} style={{ fontVariantNumeric: "tabular-nums" }}>
                {kpi.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Donut */}
        <div className="flex-1">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Distribucion por antiguedad
          </h4>
          {donutData.length > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={95}
                    dataKey="monto"
                    nameKey="rango"
                    stroke="#fff"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-xl font-mono font-bold text-gray-900 dark:text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(totales.pendiente)}
                  </p>
                  <p className="text-[10px] text-gray-400">Pendiente</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-xs text-gray-400">
              Sin datos
            </div>
          )}
          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {donutData.map((seg) => (
              <div key={seg.rango} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{seg.rango}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recovery trend */}
        <div className="flex-1">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Tendencia de recuperacion
          </h4>
          {tendencia && tendencia.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={tendencia} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(107,114,128,0.15)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="mes"
                  tickFormatter={(v: string) => v.slice(5)}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip content={<TrendTooltip />} />
                <defs>
                  <linearGradient id="fiado-green" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00B4A6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00B4A6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fiado-red" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e63946" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#e63946" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="cobrados"
                  stroke="#00B4A6"
                  fill="url(#fiado-green)"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="nuevos"
                  stroke="#e63946"
                  fill="url(#fiado-red)"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-xs text-gray-400">
              Sin datos de tendencia
            </div>
          )}
        </div>
      </div>

      {/* Top deudores */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Top deudores
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Cliente</th>
                <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Saldo</th>
                <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Dias</th>
                <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(topDeudores ?? []).map((d, idx) => (
                <tr key={d.nombre} className={cn("border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", idx % 2 === 1 && "bg-gray-50/50 dark:bg-gray-800/20")}>
                  <td className="py-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
                    {d.nombre}
                  </td>
                  <td className="py-1.5 text-right font-mono font-medium text-gray-900 dark:text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(d.monto)}
                  </td>
                  <td className={cn(
                    "py-1.5 text-right font-mono",
                    d.dias > 30 ? "text-red-600 dark:text-red-400" : d.dias > 15 ? "text-amber-600 dark:text-amber-400" : "text-gray-500"
                  )} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {d.dias}d
                  </td>
                  <td className="py-1.5 text-right">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      d.status === "vencido" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : d.status === "riesgo" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    )}>
                      {d.status === "vencido" ? "Vencido" : d.status === "riesgo" ? "Riesgo" : "Al dia"}
                    </span>
                  </td>
                </tr>
              ))}
              {(!topDeudores || topDeudores.length === 0) && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400">Sin deudores activos</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
