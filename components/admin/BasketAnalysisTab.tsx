"use client";

import { CardTitle, DataTable } from "@buleje/design-system";
import { useState, useEffect, useMemo, useCallback } from "react";
import { ShoppingCart, ArrowRight, Download, Package, Lightbulb } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import type { Association } from "@/app/api/analytics/basket-analysis/route";
import { formatCurrency } from "@/lib/format";
import { VacioMetricas } from "@/components/admin/analisis/metricas-tarjetas";

type SortKey = "count" | "confidence" | "support" | "lift";

const ORDEN: Record<SortKey, string> = { count: "Más frecuentes", confidence: "Más confianza", support: "Más soporte", lift: "Más lift" };
const CONTROL = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)]";

/** `period` lo manda Análisis › Métricas: el selector va en su panel. */
export default function BasketAnalysisTab({ period: periodoExterno }: { period?: "7d" | "30d" | "90d" } = {}) {
  const [associations, setAssociations] = useState<Association[]>([]);
  const [avgBasketSize, setAvgBasketSize] = useState(0);
  const [avgBasketValue, setAvgBasketValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [periodoPropio, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const period = periodoExterno ?? periodoPropio;
  const [sortBy, setSortBy] = useState<SortKey>("count");
  const [filterCategory, setFilterCategory] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/basket-analysis?period=${period}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      // `demo` = el endpoint falló y mandó pares de ejemplo: no son tus ventas,
      // se muestran como vacío (mismo criterio que los indicadores propios).
      const demo = !!data.demo;
      setAssociations(demo ? [] : data.associations ?? []);
      setAvgBasketSize(demo ? 0 : data.avgBasketSize ?? 0);
      setAvgBasketValue(demo ? 0 : data.avgBasketValue ?? 0);
      setIsDemo(demo);
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

  const exportar = () => exportToCSV(sorted.map(a => ({ producto_a: a.productA, producto_b: a.productB, categoria: a.category, soporte: (a.support * 100).toFixed(1) + "%", confianza: (a.confidence * 100).toFixed(1) + "%", lift: Number(a.lift).toFixed(1), transacciones: a.count })), "analisis-cesta");

  if (!loading && !error && associations.length === 0) {
    return (
      <VacioMetricas
        conPeriodo
        icono={ShoppingCart}
        titulo={isDemo ? "No se pudo calcular la cesta" : "Todavía no hay compras con varios productos"}
        descripcion={isDemo ? "Vuelve a intentar con Actualizar en «Más»." : "Prueba con un período más largo; se arma con los pedidos que llevan dos o más productos."}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Período (sólo suelto: en Métricas lo trae el panel) */}
      {!periodoExterno && (
        <div className="flex flex-wrap items-center gap-2">
          {(["7d", "30d", "90d"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn("min-h-12 px-4 rounded-xl text-sm font-bold transition-colors",
                period === p ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-muted")}>
              {p === "7d" ? "7 días" : p === "30d" ? "30 días" : "90 días"}
            </button>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Asociaciones detectadas", value: associations.length, color: "text-[var(--data-success-500)]" },
          { label: "Tamaño prom. cesta", value: `${avgBasketSize.toFixed(1)} items`, color: "text-[var(--data-success-500)]" },
          { label: "Valor prom. cesta", value: `${formatCurrency(avgBasketValue)}`, color: "text-[var(--text-secondary)]" },
          { label: "Sugerencias cross-sell", value: crossSell.length, color: "text-[var(--data-warning-500)]" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
            <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            {loading
              ? <div className="h-7 w-16 bg-[var(--surface-sunken)] rounded animate-pulse mt-1" />
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
            <Lightbulb className="h-4 w-4" /> Para ofrecer juntos (lift mayor a 1,8)
          </CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {crossSell.map((a, i) => (
              <div key={i} className="bg-[var(--surface-raised)] rounded-xl p-3 flex items-center gap-3 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/20">
                <div className="h-8 w-8 rounded-lg bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 flex items-center justify-center shrink-0">
                  <span className="text-sm font-extrabold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{Number(a.lift).toFixed(1)}x</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                    Quien compra <span className="text-primary">{a.productA}</span> también lleva <span className="text-primary">{a.productB}</span>
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">{(a.confidence * 100).toFixed(0)}% de las veces · {a.count} transacciones</p>
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
              <div key={i} className="bg-[var(--surface-alt)] rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm font-extrabold text-primary">#{i + 1}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{a.count}x · {a.category}</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  <span className="text-sm bg-[var(--surface-raised)] px-2 py-1 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.productA}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)] self-center" />
                  <span className="text-sm bg-[var(--surface-raised)] px-2 py-1 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.productB}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full overflow-hidden">
                    <div className="h-full bg-primary/10 rounded-full" style={{ width: `${a.confidence * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{(a.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla reglas de asociación, con sus filtros pegados */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} aria-label="Filtrar por categoría" className={CONTROL}>
            {categories.map(c => <option key={c} value={c}>{c === "all" ? "Todas las categorías" : c}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} aria-label="Ordenar" className={CONTROL}>
            {(Object.keys(ORDEN) as SortKey[]).map(k => <option key={k} value={k}>{ORDEN[k]}</option>)}
          </select>
          <button type="button" onClick={exportar} className={cn(CONTROL, "ml-auto inline-flex items-center gap-1.5 text-[var(--accent-ink)] dark:text-[var(--accent)]")}>
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-[var(--surface-sunken)] rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <DataTable className="min-w-[600px]">
              <thead>
                <tr>
                  <th>Producto A</th>
                  <th />
                  <th>Producto B</th>
                  <th>Categoría</th>
                  <th className="text-right">Soporte</th>
                  <th className="text-right">Confianza</th>
                  <th className="text-right">Lift</th>
                  <th className="text-right">Transacciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{a.productA}</td>
                    <td><ArrowRight className="h-3 w-3 text-[var(--text-tertiary)]" /></td>
                    <td className="font-semibold">{a.productB}</td>
                    <td>
                      <span className="text-[var(--text-secondary)]">{a.category}</span>
                    </td>
                    <td className="text-right"><span className="font-bold">{(a.support * 100).toFixed(0)}%</span></td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                          <div className="h-full bg-primary/10 rounded-full" style={{ width: `${a.confidence * 100}%` }} />
                        </div>
                        <span className="font-bold">{(a.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <span className={cn("font-bold", a.lift >= 2 ? "text-[var(--text-secondary)]" : a.lift >= 1.5 ? "text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]")}>{Number(a.lift).toFixed(1)}x</span>
                    </td>
                    <td className="text-right font-bold">{a.count}</td>
                  </tr>
                ))}
              </tbody>
          </DataTable>
        )}
      </div>
    </div>
  );
}
