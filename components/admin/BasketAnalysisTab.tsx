"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ShoppingCart, ArrowRight, Download, Link2, Package, RefreshCw, Lightbulb } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";
import type { Association } from "@/app/api/analytics/basket-analysis/route";

type SortKey = "count" | "confidence" | "support" | "lift";

export default function BasketAnalysisTab() {
  const [associations, setAssociations] = useState<Association[]>([]);
  const [avgBasketSize, setAvgBasketSize] = useState(0);
  const [avgBasketValue, setAvgBasketValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [sortBy, setSortBy] = useState<SortKey>("count");
  const [filterCategory, setFilterCategory] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/basket-analysis?period=${period}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAssociations(data.associations ?? []);
      setAvgBasketSize(data.avgBasketSize ?? 0);
      setAvgBasketValue(data.avgBasketValue ?? 0);
      setIsDemo(!!data.demo);
    } catch {
      setError("No se pudo cargar el análisis de cesta");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(associations.map(a => a.category)))], [associations]);

  const sorted = useMemo(() => {
    const list = filterCategory === "all" ? associations : associations.filter(a => a.category === filterCategory);
    return [...list].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [associations, sortBy, filterCategory]);

  // Top combos: pares con mayor confianza
  const topCombos = useMemo(() => sorted.slice(0, 6), [sorted]);

  // Cross-sell suggestions: pares con lift > 1.8
  const crossSell = useMemo(() => sorted.filter(a => a.lift >= 1.8).slice(0, 4), [sorted]);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" /> Análisis de Cesta
            {isDemo && <span className="text-xs font-normal text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">datos demo</span>}
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Descubre qué productos se compran juntos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["7d", "30d", "90d"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                period === p ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>
              {p === "7d" ? "7 días" : p === "30d" ? "30 días" : "90 días"}
            </button>
          ))}
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface text-gray-400">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button onClick={() => exportToCSV(sorted.map(a => ({ producto_a: a.productA, producto_b: a.productB, categoria: a.category, soporte: (a.support * 100).toFixed(1) + "%", confianza: (a.confidence * 100).toFixed(1) + "%", lift: a.lift.toFixed(1), transacciones: a.count })), "analisis-cesta")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Asociaciones detectadas", value: associations.length, color: "text-emerald-500" },
          { label: "Tamaño prom. cesta", value: `${avgBasketSize.toFixed(1)} items`, color: "text-emerald-500" },
          { label: "Valor prom. cesta", value: `S/ ${avgBasketValue.toFixed(2)}`, color: "text-violet-500" },
          { label: "Sugerencias cross-sell", value: crossSell.length, color: "text-amber-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            {loading
              ? <div className="h-7 w-16 bg-gray-100 dark:bg-surface rounded animate-pulse mt-1" />
              : <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-4 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {/* Cross-sell suggestions */}
      {!loading && crossSell.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-3 sm:p-5">
          <h3 className="font-bold text-sm text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" /> Sugerencias de Cross-sell (lift &gt; 1.8x)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {crossSell.map((a, i) => (
              <div key={i} className="bg-white dark:bg-card rounded-xl p-3 flex items-center gap-3 border border-amber-100 dark:border-amber-900/20">
                <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-extrabold text-amber-700 dark:text-amber-400">{a.lift.toFixed(1)}x</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 dark:text-foreground truncate">
                    Quien compra <span className="text-primary">{a.productA}</span> también lleva <span className="text-primary">{a.productB}</span>
                  </p>
                  <p className="text-[10px] text-gray-400">{(a.confidence * 100).toFixed(0)}% de las veces · {a.count} transacciones</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top combos */}
      {!loading && topCombos.length > 0 && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Combos más frecuentes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topCombos.map((a, i) => (
              <div key={i} className="bg-gray-50 dark:bg-surface rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-extrabold text-primary">#{i + 1}</span>
                  <span className="text-[10px] text-gray-400">{a.count}x · {a.category}</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  <span className="text-xs bg-white dark:bg-card px-2 py-1 rounded-lg border border-gray-200 dark:border-card-border font-semibold text-gray-700 dark:text-foreground">{a.productA}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-400 self-center" />
                  <span className="text-xs bg-white dark:bg-card px-2 py-1 rounded-lg border border-gray-200 dark:border-card-border font-semibold text-gray-700 dark:text-foreground">{a.productB}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-card rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${a.confidence * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{(a.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla reglas de asociación */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-3 bg-gray-50 dark:bg-surface gap-2 flex-wrap">
          <h3 className="font-bold text-sm text-gray-700 dark:text-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Reglas de asociación
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro categoría */}
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 dark:bg-card text-gray-600 dark:text-muted border-0">
              {categories.map(c => <option key={c} value={c}>{c === "all" ? "Todas las categorías" : c}</option>)}
            </select>
            {/* Ordenar */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">Orden:</span>
              {(["count", "confidence", "support", "lift"] as SortKey[]).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={cn("px-2 py-0.5 rounded text-[10px] font-bold transition-colors",
                    sortBy === s ? "bg-primary text-white" : "bg-gray-200 dark:bg-card text-gray-500 dark:text-muted")}>
                  {s === "count" ? "Frec." : s === "confidence" ? "Conf." : s === "support" ? "Sop." : "Lift"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 dark:bg-surface rounded animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <ShoppingCart className="h-10 w-10 mb-2" />
            <p className="text-sm">Sin asociaciones para el periodo seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-muted bg-gray-50 dark:bg-surface">
                  <th className="px-4 py-2 font-bold">Producto A</th>
                  <th className="px-2 py-2 font-bold" />
                  <th className="px-4 py-2 font-bold">Producto B</th>
                  <th className="px-4 py-2 font-bold">Categoría</th>
                  <th className="px-4 py-2 font-bold text-right">Soporte</th>
                  <th className="px-4 py-2 font-bold text-right">Confianza</th>
                  <th className="px-4 py-2 font-bold text-right">Lift</th>
                  <th className="px-4 py-2 font-bold text-right">Transacciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface/50">
                    <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-foreground">{a.productA}</td>
                    <td className="px-2 py-2.5"><ArrowRight className="h-3 w-3 text-gray-400" /></td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-foreground">{a.productB}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted">{a.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right"><span className="text-xs font-bold text-emerald-500">{(a.support * 100).toFixed(0)}%</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${a.confidence * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-emerald-500">{(a.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn("text-xs font-bold", a.lift >= 2 ? "text-violet-500" : a.lift >= 1.5 ? "text-amber-500" : "text-gray-500")}>{a.lift.toFixed(1)}x</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-700 dark:text-foreground">{a.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
