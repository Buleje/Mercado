"use client";

import { useState, useEffect } from "react";
import { Loader2, Users, TrendingUp, ShoppingCart, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CLVResponse } from "@/app/api/analytics/clv/route";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

function KPI({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground">{value}</p>
      <p className="text-xs font-semibold text-gray-500 dark:text-muted mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export default function CLVAnalyticsTab() {
  const [data, setData] = useState<CLVResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"customers" | "cohorts">("customers");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/analytics/clv")
      .then(r => r.ok ? r.json() : null)
      .then((d: CLVResponse | null) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!data)   return <div className="text-center py-20 text-gray-400 dark:text-muted">Error cargando datos CLV</div>;

  const filtered = data.customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Valor de Vida del Cliente (CLV)
        </h2>
        <p className="text-sm text-gray-500 dark:text-muted">Análisis de cohortes y retención de clientes</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Clientes activos"     value={String(data.summary.totalCustomers)} icon={Users}        color="bg-blue-500" />
        <KPI label="CLV promedio"         value={fmt(data.summary.avgLTV)}             icon={TrendingUp}  color="bg-emerald-500" />
        <KPI label="Pedidos por cliente"  value={String(data.summary.avgOrderCount)}   icon={ShoppingCart} color="bg-amber-500" />
        <KPI label="Cohortes identificadas" value={String(data.cohorts.length)}        icon={Calendar}    color="bg-violet-500" />
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {(["customers", "cohorts"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-card"
            )}>
            {v === "customers" ? "Clientes" : "Cohortes"}
          </button>
        ))}
        {view === "customers" && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="ml-auto px-4 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm w-48" />
        )}
      </div>

      {view === "customers" ? (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-card-border text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">#</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">CLV Total</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right hidden sm:table-cell">Pedidos</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right hidden md:table-cell">Ticket prom.</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden lg:table-cell">Cohorte</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right hidden md:table-cell">Últ. pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => {
                  const urgency = c.daysSinceLast > 60 ? "text-red-500" : c.daysSinceLast > 30 ? "text-amber-500" : "text-gray-500 dark:text-muted";
                  return (
                    <tr key={c.phone} className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 dark:text-muted text-xs">{data.customers.indexOf(c) + 1}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-gray-900 dark:text-foreground">{c.name}</p>
                        <p className="text-xs text-gray-400 dark:text-muted">{c.phone}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-foreground">{fmt(c.totalSpent)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 dark:text-muted hidden sm:table-cell">{c.orderCount}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 dark:text-muted hidden md:table-cell">{fmt(c.avgOrderValue)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-muted hidden lg:table-cell">{c.cohortMonth}</td>
                      <td className={cn("px-4 py-2.5 text-right text-xs hidden md:table-cell", urgency)}>hace {c.daysSinceLast}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="h-20 flex items-center justify-center text-gray-400 dark:text-muted text-sm">No se encontraron clientes</div>}
        </div>
      ) : (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-card-border text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Cohorte (mes)</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Clientes</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Ingresos totales</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">CLV promedio</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Pedidos prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.cohorts.map(cohort => (
                  <tr key={cohort.month} className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-foreground">{cohort.month}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-foreground">{cohort.customers}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-foreground">{fmt(cohort.totalRevenue)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">{fmt(cohort.avgLTV)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-muted">{cohort.avgOrders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.cohorts.length === 0 && <div className="h-20 flex items-center justify-center text-gray-400 dark:text-muted text-sm">Sin datos de cohortes</div>}
        </div>
      )}
    </div>
  );
}

