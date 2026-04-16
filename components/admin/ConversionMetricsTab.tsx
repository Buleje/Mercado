"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  ShoppingCart,
  Eye,
  DollarSign,
  Users,
  Package,
  RefreshCw,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import * as Sentry from "@sentry/nextjs";

type Stats = {
  pendingOrders: number;
  todayRevenue: number;
  lowStock: number;
  weeklyOrders: number;
  totalCustomers: number;
};

type ABCProduct = {
  productId: number;
  name: string;
  revenue: number;
  percentage: number;
  cumulative: number;
  classification: "A" | "B" | "C";
};

type MarginProduct = {
  productId: number;
  name: string;
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
};

type Segment = {
  segment: string;
  count: number;
  revenue: number;
  color: string;
};

export default function ConversionMetricsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [abc, setAbc] = useState<ABCProduct[]>([]);
  const [margins, setMargins] = useState<MarginProduct[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [statsRes, abcRes, marginsRes, segmentsRes] = await Promise.all([
        fetch("/api/admin/stats").then((r) => r.ok ? r.json() : null),
        fetch("/api/analytics/abc").then((r) => r.ok ? r.json() : []),
        fetch("/api/analytics/margins").then((r) => r.ok ? r.json() : []),
        fetch("/api/analytics/segments").then((r) => r.ok ? r.json() : []),
      ]);
      setStats(statsRes);
      setAbc(Array.isArray(abcRes) ? abcRes.slice(0, 20) : abcRes.products?.slice(0, 20) ?? []);
      setMargins(
        Array.isArray(marginsRes) ? marginsRes.slice(0, 20) : marginsRes.products?.slice(0, 20) ?? [],
      );
      setSegments(Array.isArray(segmentsRes) ? segmentsRes : segmentsRes.segments ?? []);
      setLastRefresh(new Date());
    } catch (e) {
      setFetchError("Error al cargar métricas de conversión");
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(n % 1 === 0 ? 0 : 2);

  const kpiCards = stats
    ? [
        {
          label: "Ingresos hoy",
          value: `S/ ${fmt(stats.todayRevenue)}`,
          icon: DollarSign,
          color: "text-green-400",
          bg: "bg-green-500/10",
        },
        {
          label: "Pedidos semana",
          value: String(stats.weeklyOrders),
          icon: ShoppingCart,
          color: "text-emerald-400",
          bg: "bg-emerald-500/10",
        },
        {
          label: "Clientes totales",
          value: String(stats.totalCustomers),
          icon: Users,
          color: "text-purple-400",
          bg: "bg-purple-500/10",
        },
        {
          label: "Pedidos pendientes",
          value: String(stats.pendingOrders),
          icon: Package,
          color: "text-amber-400",
          bg: "bg-amber-500/10",
        },
        {
          label: "Stock bajo",
          value: String(stats.lowStock),
          icon: Eye,
          color: stats.lowStock > 5 ? "text-red-400" : "text-gray-400",
          bg: stats.lowStock > 5 ? "bg-red-500/10" : "bg-gray-500/10",
        },
      ]
    : [];

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-xl font-bold text-white flex flex-wrap items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Métricas de Conversión
          </h2>
          {lastRefresh && (
            <p className="text-xs text-gray-500 mt-1">
              Actualizado: {lastRefresh.toLocaleTimeString("es-PE")}
            </p>
          )}
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refrescar
        </button>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
          <span>{fetchError}</span>
          <button onClick={fetchAll} className="ml-auto text-xs font-bold hover:underline">Reintentar</button>
        </div>
      )}

      {loading && !stats ? (
        <div className="text-center py-20 text-gray-500">Cargando métricas...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {kpiCards.map((c) => (
              <div key={c.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-lg ${c.bg}`}>
                    <c.icon className={`w-4 h-4 ${c.color}`} />
                  </div>
                </div>
                <p className="text-base sm:text-xl font-bold text-white">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            ))}
          </div>

          {/* ABC Classification */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex flex-wrap items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Clasificación ABC (Top 20 productos por ingreso)
            </h3>
            {abc.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin datos de clasificación ABC</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-400 text-left">
                      <th className="pb-2">Producto</th>
                      <th className="pb-2 text-right">Ingreso</th>
                      <th className="pb-2 text-right">% Acum.</th>
                      <th className="pb-2 text-center">Clase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abc.map((p) => (
                      <tr key={p.productId} className="border-b border-white/5">
                        <td className="py-1.5 text-white">{p.name}</td>
                        <td className="py-1.5 text-right text-gray-300">
                          S/ {fmt(p.revenue)}
                        </td>
                        <td className="py-1.5 text-right text-gray-400">
                          {(p.cumulative * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.classification === "A"
                                ? "bg-green-500/20 text-green-300"
                                : p.classification === "B"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-red-500/20 text-red-300"
                            }`}
                          >
                            {p.classification}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Margins */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex flex-wrap items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              Márgenes de Ganancia (Top 20)
            </h3>
            {margins.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin datos de márgenes</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-400 text-left">
                      <th className="pb-2">Producto</th>
                      <th className="pb-2">Categoría</th>
                      <th className="pb-2 text-right">Ingreso</th>
                      <th className="pb-2 text-right">Costo</th>
                      <th className="pb-2 text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {margins.map((m) => (
                      <tr key={m.productId} className="border-b border-white/5">
                        <td className="py-1.5 text-white">{m.name}</td>
                        <td className="py-1.5 text-gray-400">{m.category}</td>
                        <td className="py-1.5 text-right text-gray-300">
                          S/ {fmt(m.revenue)}
                        </td>
                        <td className="py-1.5 text-right text-gray-400">
                          S/ {fmt(m.cost)}
                        </td>
                        <td className="py-1.5 text-right">
                          <span
                            className={`inline-flex items-center gap-1 ${m.marginPercent >= 30 ? "text-green-400" : m.marginPercent >= 15 ? "text-amber-400" : "text-red-400"}`}
                          >
                            {m.marginPercent >= 30 ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {m.marginPercent.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Customer Segments */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex flex-wrap items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              Segmentos de Clientes
            </h3>
            {segments.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin datos de segmentación</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {segments.map((s) => (
                  <div
                    key={s.segment}
                    className="bg-white/5 border border-white/10 rounded-lg p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="text-sm font-medium text-white">{s.segment}</span>
                    </div>
                    <p className="text-lg font-bold text-white">{s.count}</p>
                    <p className="text-xs text-gray-500">
                      S/ {fmt(s.revenue)} en ingresos
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

