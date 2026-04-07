"use client";

import { Loader2, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { GrowthEntry } from "./types";

interface TenantGrowthTabProps {
  growthData: GrowthEntry[];
  loading: boolean;
}

export function TenantGrowthTab({ growthData, loading }: TenantGrowthTabProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando datos de crecimiento…
      </div>
    );
  }

  if (growthData.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
        No hay datos de crecimiento
      </div>
    );
  }

  const totalRevenue = growthData.reduce((s, g) => s + (g.months[g.months.length - 1]?.revenue ?? 0), 0);
  const totalOrders = growthData.reduce((s, g) => s + (g.months[g.months.length - 1]?.orders ?? 0), 0);
  const avgGrowth = growthData.reduce((s, g) => s + g.growthPct, 0) / (growthData.length || 1);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Tiendas activas", value: growthData.length, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30" },
          { label: "Ingresos totales/mes", value: `S/${totalRevenue.toFixed(0)}`, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
          { label: "Pedidos totales/mes", value: totalOrders, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Crecimiento promedio", value: `${avgGrowth.toFixed(0)}%`, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 text-center`}>
            <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
            <div className="text-gray-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Per-store growth cards */}
      <div className="space-y-4">
        {growthData.map((store) => {
          const lastMonth = store.months[store.months.length - 1];
          const prevMonth = store.months[store.months.length - 2];
          const maxRevenue = Math.max(...store.months.map((m) => m.revenue), 1);

          return (
            <div key={store.slug} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-3 hover:border-teal-300 dark:hover:border-teal-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-linear-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
                    {store.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white">{store.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{store.slug}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${store.growthPct > 0 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : store.growthPct < 0 ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                    {store.growthPct > 0 ? <ArrowUpRight className="w-3 h-3" /> : store.growthPct < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                    {store.growthPct > 0 ? "+" : ""}{store.growthPct}%
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-900 dark:text-white">S/{(lastMonth?.revenue ?? 0).toFixed(0)}</div>
                    <div className="text-[10px] text-gray-400">{lastMonth?.orders ?? 0} pedidos</div>
                  </div>
                </div>
              </div>

              {/* Mini bar chart — 6 months */}
              <div className="flex items-end gap-1.5 h-16">
                {store.months.map((m, i) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className={`w-full rounded-t-md transition-all ${i === store.months.length - 1 ? "bg-teal-500" : "bg-gray-200 dark:bg-gray-700"}`}
                      style={{ height: `${Math.max(4, (m.revenue / maxRevenue) * 100)}%` }}
                      title={`${m.month}: S/${m.revenue.toFixed(0)} (${m.orders} pedidos)`}
                    />
                    <span className="text-[8px] text-gray-400 leading-none">{m.month}</span>
                  </div>
                ))}
              </div>

              {/* Monthly detail row */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div className="text-center">
                  <div className="text-xs font-bold text-gray-900 dark:text-white">S/{store.totalRevenue.toFixed(0)}</div>
                  <div className="text-[9px] text-gray-400">Ingresos 6 meses</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-gray-900 dark:text-white">{store.totalOrders}</div>
                  <div className="text-[9px] text-gray-400">Pedidos 6 meses</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-gray-900 dark:text-white">
                    S/{store.totalOrders > 0 ? (store.totalRevenue / store.totalOrders).toFixed(0) : "0"}
                  </div>
                  <div className="text-[9px] text-gray-400">Ticket promedio</div>
                </div>
              </div>

              {/* Projection */}
              {lastMonth && prevMonth && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2 text-xs flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                  <span className="text-gray-500">
                    Proyección próximo mes:{" "}
                    <span className="font-bold text-gray-900 dark:text-white">
                      S/{Math.max(0, lastMonth.revenue + (lastMonth.revenue - prevMonth.revenue)).toFixed(0)}
                    </span>
                    {" "}({Math.max(0, lastMonth.orders + (lastMonth.orders - prevMonth.orders))} pedidos)
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
