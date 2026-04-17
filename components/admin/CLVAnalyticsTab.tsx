"use client";

import { useState, useEffect } from "react";
import { Loader2, Users, TrendingUp, ShoppingCart, Calendar, Search, AlertTriangle, Medal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CLVResponse, CLVCustomer } from "@/app/api/analytics/clv/route";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${months[parseInt(mo) - 1]} ${y?.slice(2)}`;
}

/** Proyección simple: CLV actual × (1 + tasa de crecimiento estimada) */
function predictFutureCLV(c: CLVCustomer): number {
  if (c.orderCount < 2) return c.totalSpent * 1.5;
  const monthsActive = Math.max(1, c.daysSinceFirst / 30);
  const monthlyRate = c.totalSpent / monthsActive;
  return Math.round((c.totalSpent + monthlyRate * 6) * 100) / 100;
}

function KPI({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground">{value}</p>
      <p className="text-xs font-semibold text-gray-500 dark:text-muted mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export default function CLVAnalyticsTab() {
  const [data, setData] = useState<CLVResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"customers" | "cohorts" | "top10">("customers");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/analytics/clv")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: CLVResponse) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-gray-400 dark:text-muted">Calculando valor de vida del cliente...</p>
    </div>
  );
  if (error || !data) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertTriangle className="h-10 w-10 text-amber-400" />
      <p className="text-sm font-semibold text-gray-500 dark:text-muted">Error cargando datos CLV</p>
    </div>
  );

  const filtered = data.customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const top10 = [...data.customers].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);
  const maxCLV = top10[0]?.totalSpent ?? 1;

  // Comparativa mes a mes: últimos 2 meses de cohortes
  const lastTwoMonths = data.cohorts.slice(-2);
  const momChange = lastTwoMonths.length === 2
    ? ((lastTwoMonths[1].avgLTV - lastTwoMonths[0].avgLTV) / Math.max(lastTwoMonths[0].avgLTV, 1) * 100).toFixed(1)
    : null;

  const maxCohortLTV = Math.max(...data.cohorts.map(c => c.avgLTV), 1);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Valor de Vida del Cliente (CLV)
        </h2>
        <p className="text-sm text-gray-500 dark:text-muted">Análisis de cohortes y retención de clientes</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <KPI label="Clientes activos"       value={String(data.summary.totalCustomers)} icon={Users}        color="bg-emerald-500" />
        <KPI label="CLV promedio"           value={fmt(data.summary.avgLTV)}            icon={TrendingUp}   color="bg-emerald-500" sub={momChange ? `${Number(momChange) >= 0 ? "+" : ""}${momChange}% vs mes ant.` : undefined} />
        <KPI label="Pedidos por cliente"    value={String(data.summary.avgOrderCount)}  icon={ShoppingCart} color="bg-amber-500" />
        <KPI label="Cohortes identificadas" value={String(data.cohorts.length)}         icon={Calendar}     color="bg-[var(--text-primary)]" />
      </div>

      {/* View toggle */}
      <div className="flex flex-wrap gap-2">
        {([["customers", "Clientes"], ["top10", "Top 10"], ["cohorts", "Cohortes"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={cn("px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors",
              view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-card"
            )}>
            {v === "top10" && <Medal className="h-3.5 w-3.5 inline mr-1" />}{label}
          </button>
        ))}
        {view === "customers" && (
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-9 pr-4 py-1.5 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm w-48" />
          </div>
        )}
      </div>

      {/* Top 10 vista */}
      {view === "top10" && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
            <Medal className="h-4 w-4 text-yellow-500" /> Top 10 Clientes más valiosos
          </h3>
          {top10.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {top10.map((c, idx) => {
                const predicted = predictFutureCLV(c);
                const barPct = (c.totalSpent / maxCLV) * 100;
                const medals = ["1.","2.","3."];
                return (
                  <div key={c.phone}>
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base w-6 shrink-0">{medals[idx] ?? `${idx + 1}.`}</span>
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-foreground">{c.name}</p>
                          <p className="text-[length:var(--ts-2xs)] text-gray-400">{c.phone} · {c.orderCount} pedidos · cohorte {fmtMonth(c.cohortMonth)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-gray-900 dark:text-foreground">{fmt(c.totalSpent)}</p>
                        <p className="text-[length:var(--ts-2xs)] text-emerald-600 font-semibold">Proy. 6m: {fmt(predicted)}</p>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--text-primary)] rounded-full transition-all" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Cohortes con gráfico de barras */}
      {view === "cohorts" && (
        <div className="space-y-6">
          {/* Gráfico visual de CLV por cohorte */}
          {data.cohorts.length > 0 && (
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-bold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> CLV promedio por cohorte
              </h3>
              <div className="flex items-end gap-2 h-32">
                {data.cohorts.map(cohort => {
                  const heightPct = Math.max(5, (cohort.avgLTV / maxCohortLTV) * 100);
                  const isLast = cohort === data.cohorts[data.cohorts.length - 1];
                  const isPrev = cohort === data.cohorts[data.cohorts.length - 2];
                  return (
                    <div key={cohort.month} className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${fmtMonth(cohort.month)}: ${fmt(cohort.avgLTV)}`}>
                      <span className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-muted font-semibold">{fmt(cohort.avgLTV)}</span>
                      <div
                        className={cn("w-full rounded-t-lg transition-all", isLast ? "bg-primary" : isPrev ? "bg-primary/60" : "bg-primary/30")}
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="text-[length:var(--ts-2xs)] text-gray-400 truncate w-full text-center">{fmtMonth(cohort.month)}</span>
                    </div>
                  );
                })}
              </div>
              {momChange !== null && (
                <p className={cn("text-xs font-semibold mt-3 text-center", Number(momChange) >= 0 ? "text-emerald-600" : "text-red-500")}>
                  CLV promedio {Number(momChange) >= 0 ? "subió" : "bajó"} {Math.abs(Number(momChange))}% vs mes anterior
                </p>
              )}
            </div>
          )}

          {/* Tabla de cohortes */}
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden ">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)] dark:border-card-border text-left">
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted">Cohorte</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted text-right">Clientes</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted text-right">Ingresos totales</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted text-right">CLV promedio</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted text-right">Pedidos prom.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-card-border">
                  {data.cohorts.map((cohort, i) => {
                    const prev = data.cohorts[i - 1];
                    const delta = prev ? cohort.avgLTV - prev.avgLTV : 0;
                    return (
                      <tr key={cohort.month} className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                        <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-foreground">{fmtMonth(cohort.month)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-foreground">{cohort.customers}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-foreground">{fmt(cohort.totalRevenue)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-emerald-600 font-semibold">{fmt(cohort.avgLTV)}</span>
                          {prev && (
                            <span className={cn("ml-1.5 text-[length:var(--ts-2xs)] font-bold", delta >= 0 ? "text-emerald-500" : "text-red-500")}>
                              {delta >= 0 ? "+" : "-"}{Math.abs(delta).toFixed(0)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600 dark:text-muted">{cohort.avgOrders}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.cohorts.length === 0 && <div className="h-20 flex items-center justify-center text-gray-400 dark:text-muted text-sm">Sin datos de cohortes</div>}
          </div>
        </div>
      )}

      {/* Vista clientes */}
      {view === "customers" && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden ">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] dark:border-card-border text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted">#</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted text-right">CLV Total</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted text-right hidden sm:table-cell">Pedidos</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted text-right hidden md:table-cell">Ticket prom.</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted text-right hidden md:table-cell">Proy. 6m</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted hidden lg:table-cell">Cohorte</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted text-right hidden md:table-cell">Últ. pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-card-border">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400 dark:text-muted">No se encontraron clientes</td></tr>
                )}
                {filtered.map((c, idx) => {
                  const urgency = c.daysSinceLast > 60 ? "text-red-500 font-semibold" : c.daysSinceLast > 30 ? "text-amber-500 font-semibold" : "text-gray-500 dark:text-muted";
                  const predicted = predictFutureCLV(c);
                  return (
                    <tr key={c.phone} className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 dark:text-muted text-xs">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-gray-900 dark:text-foreground">{c.name}</p>
                        <p className="text-xs text-gray-400 dark:text-muted">{c.phone}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-foreground">{fmt(c.totalSpent)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 dark:text-muted hidden sm:table-cell">{c.orderCount}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 dark:text-muted hidden md:table-cell">{fmt(c.avgOrderValue)}</td>
                      <td className="px-4 py-2.5 text-right hidden md:table-cell">
                        <span className="text-emerald-600 font-semibold text-xs">{fmt(predicted)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-muted hidden lg:table-cell">{fmtMonth(c.cohortMonth)}</td>
                      <td className={cn("px-4 py-2.5 text-right text-xs hidden md:table-cell", urgency)}>hace {c.daysSinceLast}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
