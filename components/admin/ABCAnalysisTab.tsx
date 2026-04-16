"use client";

import { useState, useEffect } from "react";
import { Loader2, BarChart2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";
import type { ABCProduct } from "@/app/api/analytics/abc/route";

const CLASS_STYLES: Record<"A" | "B" | "C", { badge: string; row: string; label: string; border: string; variant: BadgeVariant }> = {
  A: { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", row: "bg-emerald-50/30 dark:bg-emerald-900/10", label: "A — Critico", border: "border-l-4 border-l-green-500", variant: "success" },
  B: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",   row: "bg-amber-50/20 dark:bg-amber-900/10",   label: "B — Importante", border: "border-l-4 border-l-amber-500", variant: "warning" },
  C: { badge: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",      row: "",                 label: "C — Bajo impacto", border: "border-l-4 border-l-red-500", variant: "error" },
};

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

export default function ABCAnalysisTab() {
  const [data, setData]   = useState<ABCProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "A" | "B" | "C">("all");

  useEffect(() => {
    fetch("/api/analytics/abc")
      .then(r => r.ok ? r.json() : [])
      .then((d: ABCProduct[]) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = data.filter(p => {
    if (filter !== "all" && p.class !== filter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = { A: data.filter(p => p.class === "A").length, B: data.filter(p => p.class === "B").length, C: data.filter(p => p.class === "C").length };
  const revenue = { A: data.filter(p => p.class === "A").reduce((s, p) => s + p.revenue, 0), B: data.filter(p => p.class === "B").reduce((s, p) => s + p.revenue, 0), C: data.filter(p => p.class === "C").reduce((s, p) => s + p.revenue, 0) };
  const totalRevenue = data.reduce((s, p) => s + p.revenue, 0);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" /> Análisis ABC
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted">Clasificación de productos por impacto en ingresos (principio de Pareto)</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="pl-9 pr-4 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm w-56" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
        {(["A", "B", "C"] as const).map(cls => (
          <button
            key={cls}
            onClick={() => setFilter(f => f === cls ? "all" : cls)}
            className={cn(
              "text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md",
              CLASS_STYLES[cls].border,
              filter === cls ? "border-primary shadow-md ring-2 ring-primary/20" : "border-gray-200 dark:border-card-border",
              CLASS_STYLES[cls].row
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <StatusBadge variant={CLASS_STYLES[cls].variant} label={`Clase ${cls}`} />
              <span className="text-sm font-extrabold text-gray-900 dark:text-foreground">{counts[cls]} productos</span>
            </div>
            <p className="text-xl font-mono font-extrabold text-gray-900 dark:text-foreground">{fmt(revenue[cls])}</p>
            <p className="text-xs text-gray-500 dark:text-muted mt-1">{totalRevenue > 0 ? ((revenue[cls] / totalRevenue) * 100).toFixed(1) : 0}% del ingreso total -- {CLASS_STYLES[cls].label}</p>
          </button>
        ))}
      </div>

      {/* Table */}
      {data.length === 0 ? (
        <div className="bg-white dark:bg-card border-2 border-dashed border-gray-200 dark:border-card-border rounded-2xl p-10 text-center text-gray-400 dark:text-muted">
          <BarChart2 className="h-10 w-10 mx-auto mb-3" />
          <p className="font-semibold">Sin datos de ventas para analizar</p>
          <p className="text-xs mt-1">Registra ventas o pedidos para ver el análisis ABC</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-card-border text-left">
                  <th className="px-2 sm:px-4 py-2 sm:py-3 w-8 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">#</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Producto</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden sm:table-cell">Categoría</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Ingresos</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right hidden md:table-cell">Unidades</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right hidden md:table-cell">Acum. %</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-center">Clase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr key={p.productId} className={cn("hover:bg-gray-50 dark:hover:bg-surface transition-colors", CLASS_STYLES[p.class].row)}>
                    <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-gray-400 dark:text-muted text-xs">{data.indexOf(p) + 1}</td>
                    <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-semibold text-gray-900 dark:text-foreground">{p.name}</td>
                    <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-gray-500 dark:text-muted text-xs hidden sm:table-cell">{p.category}</td>
                    <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-right font-bold text-gray-900 dark:text-foreground">{fmt(p.revenue)}</td>
                    <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-right text-gray-600 dark:text-muted hidden md:table-cell">{p.units}</td>
                    <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-right text-gray-500 dark:text-muted hidden md:table-cell">{p.cumulativePct}%</td>
                    <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-center">
                      <StatusBadge variant={CLASS_STYLES[p.class].variant} label={p.class} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="h-20 flex items-center justify-center text-gray-400 dark:text-muted text-sm">No se encontraron productos</div>
          )}
        </div>
      )}
    </div>
  );
}

