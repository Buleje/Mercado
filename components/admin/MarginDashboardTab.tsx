"use client";

import { useState, useEffect } from "react";
import { Loader2, DollarSign, TrendingUp, BarChart3, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarginResponse } from "@/app/api/analytics/margins/route";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function pct(n: number, color = false) {
  const text = `${n.toFixed(1)}%`;
  if (!color) return text;
  if (n >= 30) return <span className="text-emerald-600 font-bold">{text}</span>;
  if (n >= 15) return <span className="text-amber-600 font-bold">{text}</span>;
  return <span className="text-red-500 font-bold">{text}</span>;
}

function MarginBar({ value }: { value: number }) {
  const pctClamped = Math.max(0, Math.min(100, value));
  const color = value >= 30 ? "bg-emerald-500" : value >= 15 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="w-full bg-gray-100 dark:bg-surface rounded-full h-1.5">
      <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${pctClamped}%` }} />
    </div>
  );
}

export default function MarginDashboardTab() {
  const [data, setData] = useState<MarginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"products" | "categories">("products");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/analytics/margins")
      .then(r => r.ok ? r.json() : null)
      .then((d: MarginResponse | null) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!data)   return <div className="text-center py-20 text-gray-400 dark:text-muted">Error cargando datos de márgenes</div>;

  const filtered = data.products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Dashboard de Márgenes
        </h2>
        <p className="text-sm text-gray-500 dark:text-muted">Rentabilidad bruta por producto y categoría</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
          <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center mb-3"><DollarSign className="h-4 w-4 text-white" /></div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground">{fmt(data.summary.totalRevenue)}</p>
          <p className="text-xs font-semibold text-gray-500 dark:text-muted mt-0.5">Ingresos totales</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center mb-3"><TrendingUp className="h-4 w-4 text-white" /></div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground">{fmt(data.summary.totalGrossProfit)}</p>
          <p className="text-xs font-semibold text-gray-500 dark:text-muted mt-0.5">Ganancia bruta</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
          <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center mb-3"><BarChart3 className="h-4 w-4 text-white" /></div>
          <p className={cn("text-2xl font-extrabold", data.summary.overallMarginPct >= 30 ? "text-emerald-600" : data.summary.overallMarginPct >= 15 ? "text-amber-600" : "text-red-500")}>{data.summary.overallMarginPct.toFixed(1)}%</p>
          <p className="text-xs font-semibold text-gray-500 dark:text-muted mt-0.5">Margen global</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center mb-3"><AlertCircle className="h-4 w-4 text-white" /></div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground">{data.summary.productsWithoutCost}</p>
          <p className="text-xs font-semibold text-gray-500 dark:text-muted mt-0.5">Sin costo registrado</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {(["products", "categories"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-card"
            )}>
            {v === "products" ? "Por producto" : "Por categoría"}
          </button>
        ))}
        {view === "products" && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="ml-auto px-4 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm w-48" />
        )}
      </div>

      {view === "products" ? (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-card-border text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Producto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden sm:table-cell">Categoría</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Ingresos</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right hidden md:table-cell">Costo</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right hidden md:table-cell">Ganancia</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => (
                  <tr key={p.productId} className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-gray-900 dark:text-foreground">{p.name}</p>
                      <div className="mt-1 w-24"><MarginBar value={p.marginPct} /></div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-muted hidden sm:table-cell">{p.category}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-foreground">{fmt(p.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 dark:text-muted hidden md:table-cell">{p.cost > 0 ? fmt(p.cost) : <span className="text-amber-400">—</span>}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-foreground hidden md:table-cell">{fmt(p.grossProfit)}</td>
                    <td className="px-4 py-2.5 text-right">{pct(p.marginPct, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="h-20 flex items-center justify-center text-gray-400 dark:text-muted text-sm">No se encontraron productos</div>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.byCategory.map(cat => (
            <div key={cat.category} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-foreground">{cat.category}</h3>
                {pct(cat.marginPct, true)}
              </div>
              <MarginBar value={cat.marginPct} />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-sm font-bold text-gray-900 dark:text-foreground">{fmt(cat.revenue)}</p><p className="text-xs text-gray-400 dark:text-muted">Ingresos</p></div>
                <div><p className="text-sm font-bold text-gray-900 dark:text-foreground">{fmt(cat.cost)}</p><p className="text-xs text-gray-400 dark:text-muted">Costo</p></div>
                <div><p className="text-sm font-bold text-emerald-600">{fmt(cat.grossProfit)}</p><p className="text-xs text-gray-400 dark:text-muted">Ganancia</p></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

