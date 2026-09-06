"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo, useCallback } from "react";
import { ShoppingCart, ArrowRight, Download, Link2, Package, RefreshCw, Lightbulb } from "@buleje/design-system/icons";
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
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" /> Análisis de Cesta
            {isDemo && <span className="text-xs font-normal text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 px-2 py-0.5 rounded-full">datos demo</span>}
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Descubre qué productos se compran juntos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["7d", "30d", "90d"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                period === p ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
              {p === "7d" ? "7 días" : p === "30d" ? "30 días" : "90 días"}
            </button>
          ))}
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface text-[var(--text-tertiary)]">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button onClick={() => exportToCSV(sorted.map(a => ({ producto_a: a.productA, producto_b: a.productB, categoria: a.category, soporte: (a.support * 100).toFixed(1) + "%", confianza: (a.confidence * 100).toFixed(1) + "%", lift: Number(a.lift).toFixed(1), transacciones: a.count })), "analisis-cesta")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Asociaciones detectadas", value: associations.length, color: "text-[var(--data-success-500)]" },
          { label: "Tamaño prom. cesta", value: `${avgBasketSize.toFixed(1)} items`, color: "text-[var(--data-success-500)]" },
          { label: "Valor prom. cesta", value: `S/ ${avgBasketValue.toFixed(2)}`, color: "text-[var(--text-secondary)]" },
          { label: "Sugerencias cross-sell", value: crossSell.length, color: "text-[var(--data-warning-500)]" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            {loading
              ? <div className="h-7 w-16 bg-[var(--surface-sunken)] dark:bg-surface rounded animate-pulse mt-1" />
              : <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 rounded-xl p-4 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</div>
      )}

      {/* Cross-sell suggestions */}
      {!loading && crossSell.length > 0 && (
        <div className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-xl p-3 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" /> Sugerencias de Cross-sell (lift &gt; 1.8x)
          </CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {crossSell.map((a, i) => (
              <div key={i} className="bg-[var(--surface-raised)] rounded-xl p-3 flex items-center gap-3 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/20">
                <div className="h-8 w-8 rounded-lg bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-extrabold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{Number(a.lift).toFixed(1)}x</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                    Quien compra <span className="text-primary">{a.productA}</span> también lleva <span className="text-primary">{a.productB}</span>
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{(a.confidence * 100).toFixed(0)}% de las veces · {a.count} transacciones</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top combos */}
      {!loading && topCombos.length > 0 && (
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Combos más frecuentes
          </CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topCombos.map((a, i) => (
              <div key={i} className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-extrabold text-primary">#{i + 1}</span>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{a.count}x · {a.category}</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  <span className="text-xs bg-[var(--surface-raised)] px-2 py-1 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.productA}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)] self-center" />
                  <span className="text-xs bg-[var(--surface-raised)] px-2 py-1 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.productB}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full overflow-hidden">
                    <div className="h-full bg-primary/10 rounded-full" style={{ width: `${a.confidence * 100}%` }} />
                  </div>
                  <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{(a.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla reglas de asociación */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-3 bg-[var(--surface-alt)] dark:bg-surface gap-2 flex-wrap">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Reglas de asociación
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro categoría */}
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="px-2 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] text-[var(--text-secondary)] dark:text-muted border-0">
              {categories.map(c => <option key={c} value={c}>{c === "all" ? "Todas las categorías" : c}</option>)}
            </select>
            {/* Ordenar */}
            <div className="flex items-center gap-1">
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Orden:</span>
              {(["count", "confidence", "support", "lift"] as SortKey[]).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={cn("px-2 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold transition-colors",
                    sortBy === s ? "bg-primary text-white" : "bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] text-[var(--text-secondary)] dark:text-muted")}>
                  {s === "count" ? "Frec." : s === "confidence" ? "Conf." : s === "support" ? "Sop." : "Lift"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-[var(--surface-sunken)] dark:bg-surface rounded animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--text-tertiary)]">
            <ShoppingCart className="h-10 w-10 mb-2" />
            <p className="text-sm">Sin asociaciones para el periodo seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-secondary)] dark:text-muted bg-[var(--surface-alt)] dark:bg-surface">
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
                  <tr key={i} className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:bg-[var(--surface-alt)] dark:hover:bg-surface/50">
                    <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.productA}</td>
                    <td className="px-2 py-2.5"><ArrowRight className="h-3 w-3 text-[var(--text-tertiary)]" /></td>
                    <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.productB}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted">{a.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right"><span className="text-xs font-bold text-[var(--data-success-500)]">{(a.support * 100).toFixed(0)}%</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 h-1.5 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-primary/10 rounded-full" style={{ width: `${a.confidence * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-[var(--data-success-500)]">{(a.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn("text-xs font-bold", a.lift >= 2 ? "text-[var(--text-secondary)]" : a.lift >= 1.5 ? "text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]")}>{Number(a.lift).toFixed(1)}x</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.count}</td>
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
