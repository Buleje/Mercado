"use client";

import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { CardTitle } from "@buleje/design-system";
import { useState, useMemo, useEffect } from "react";
import {
  TrendingUp, Download, Search, Eye, X, ArrowUpRight, ArrowDownRight,
  AlertTriangle, RefreshCw,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import { useProductProfitability } from "@/hooks/use-product-profitability";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfitLine = {
  id: string;
  product: string;
  category: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  marginPct: number;
  period: string;
  /** El costo de alguna línea salió del producto, no de la venta: margen aproximado. */
  costEstimated: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(n: number) { return `${n.toFixed(1)}%`; }

const PERIODOS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfitabilityTab() {
  const [days, setDays] = useState<number>(30);
  const { lines: raw, resumen, since, loading, error, refetch } = useProductProfitability(days);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("todos");
  const [sortBy, setSortBy] = useState<"marginPct" | "grossMargin" | "revenue" | "unitsSold">("marginPct");
  const [detail, setDetail] = useState<ProfitLine | null>(null);

  const periodo = since ? `desde ${since}` : `últimos ${days} días`;

  // Escape cierra el detalle (regla del proyecto: todo modal con click-fuera + Escape).
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  const lines = useMemo<ProfitLine[]>(
    () => raw.map(l => ({
      id: String(l.productId),
      product: l.product,
      category: l.category,
      unitsSold: l.unitsSold,
      revenue: l.revenue,
      cogs: l.cogs,
      grossMargin: l.grossMargin,
      marginPct: l.marginPct,
      period: periodo,
      costEstimated: l.costEstimated,
    })),
    [raw, periodo]
  );

  // Las categorías salen de lo realmente vendido, no de una lista fija.
  const categories = useMemo(
    () => Array.from(new Set(lines.map(l => l.category))).sort((a, b) => a.localeCompare(b, "es")),
    [lines]
  );

  const estimatedCount = useMemo(() => lines.filter(l => l.costEstimated).length, [lines]);

  const filtered = useMemo(() => {
    let list = [...lines];
    if (filterCat !== "todos") list = list.filter(l => l.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => l.product.toLowerCase().includes(q));
    }
    list.sort((a, b) => b[sortBy] - a[sortBy]);
    return list;
  }, [lines, filterCat, search, sortBy]);

  // KPIs de arriba: el período completo, lo calcula el backend.
  const totals = useMemo(
    () => ({
      revenue: resumen.totalRevenue,
      cogs: resumen.totalCogs,
      grossMargin: resumen.totalMargin,
      marginPct: resumen.marginPct,
      units: resumen.totalUnits,
    }),
    [resumen]
  );

  // Pie de tabla: solo lo que se está viendo. Si no, filtrar por una categoría
  // dejaba una fila de "Totales" que no cerraba con las filas de arriba.
  const visibleTotals = useMemo(() => {
    const revenue = filtered.reduce((s, l) => s + l.revenue, 0);
    const cogs = filtered.reduce((s, l) => s + l.cogs, 0);
    const grossMargin = revenue - cogs;
    return {
      revenue,
      cogs,
      grossMargin,
      marginPct: revenue > 0 ? (grossMargin / revenue) * 100 : 0,
      units: filtered.reduce((s, l) => s + l.unitsSold, 0),
    };
  }, [filtered]);

  const isFiltered = filtered.length !== lines.length;

  const catSummary = useMemo(() => {
    const map: Record<string, { revenue: number; cogs: number; margin: number }> = {};
    lines.forEach(l => {
      if (!map[l.category]) map[l.category] = { revenue: 0, cogs: 0, margin: 0 };
      map[l.category].revenue += l.revenue;
      map[l.category].cogs += l.cogs;
      map[l.category].margin += l.grossMargin;
    });
    return Object.entries(map).sort(([, a], [, b]) => b.margin - a.margin);
  }, [lines]);

  const maxCatMargin = catSummary.length > 0 ? catSummary[0][1].margin : 1;

  return (
    <div className="space-y-4">
      {/* Header estándar del panel. Antes era un div armado a mano, que se
          saltea el font-display que AdminModuleHeader aplica al título. */}
      <AdminModuleHeader
        as="h2"
        title="Cuánto gano por producto"
        description={`Mirá cuánto ganás con cada producto y categoría · ${periodo}`}
        icon={TrendingUp}
      >
          <div className="flex rounded-lg border border-[var(--rule-base)] overflow-hidden">
            {PERIODOS.map(p => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={cn(
                  "px-3 py-2 text-sm font-semibold transition-colors",
                  days === p.days
                    ? "bg-primary text-white"
                    : "bg-white dark:bg-surface text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-accent"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={refetch}
            disabled={loading}
            aria-label="Actualizar rentabilidad"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
          </button>
          <button onClick={() => exportToCSV(filtered.map(l => ({ producto: l.product, categoria: l.category, unidades: l.unitsSold, ingresos: l.revenue, costo: l.cogs, margen_bruto: l.grossMargin, margen_pct: Number(l.marginPct).toFixed(1) + "%" })), "ganancias-producto")} disabled={filtered.length === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors disabled:opacity-50">
            <Download className="h-4 w-4" /> Descargar
          </button>
      </AdminModuleHeader>

      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] dark:bg-red-950/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)] flex-1">{error}</p>
          <button onClick={refetch} className="text-sm font-bold text-[var(--data-error-500)] underline">
            Reintentar
          </button>
        </div>
      )}

      {estimatedCount > 0 && !loading && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-amber-950/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)]" />
          <p className="text-sm text-[var(--text-primary)]">
            <span className="font-bold">{estimatedCount}</span>{" "}
            {estimatedCount === 1 ? "producto usa" : "productos usan"} el costo actual porque la venta
            no guardó el costo del momento. Ese margen es aproximado.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Ingresos totales", value: fmt(totals.revenue), color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15" },
          { label: "Costo de venta", value: fmt(totals.cogs), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-orange-950/30" },
          { label: "Margen bruto", value: fmt(totals.grossMargin), color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15" },
          { label: "% Margen", value: pct(totals.marginPct), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
          { label: "Uds. vendidas", value: totals.units.toLocaleString("es-PE"), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Category bar chart */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">Ganancia por categoría</CardTitle>
        <div className="space-y-3">
          {catSummary.map(([cat, data]) => {
            const pctFill = maxCatMargin > 0 ? (data.margin / maxCatMargin) * 100 : 0;
            const mPct = data.revenue > 0 ? (data.margin / data.revenue) * 100 : 0;
            return (
              <div key={cat} className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted w-20 truncate">{cat}</span>
                <div className="flex-1 bg-gray-100 dark:bg-surface rounded-full h-5 overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--data-success-500)] transition-all" style={{ width: `${pctFill}%` }} />
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] w-24 text-right">{fmt(data.margin)}</span>
                <span className="text-xs font-semibold text-[var(--data-success-500)] w-12 text-right">{pct(mPct)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters & sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todas las categorías</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="marginPct">Mayor % margen</option>
          <option value="grossMargin">Mayor margen bruto</option>
          <option value="revenue">Mayor ingreso</option>
          <option value="unitsSold">Mayor volumen</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">#</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Producto</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Categoría</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Uds.</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Ingresos</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Costo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Margen</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">%</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-[var(--text-tertiary)] text-sm">Calculando tus ganancias…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {lines.length === 0
                        ? `No hay ventas en los ${days === 7 ? "últimos 7" : days === 30 ? "últimos 30" : "últimos 90"} días`
                        : "Ningún producto coincide con el filtro"}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      {lines.length === 0
                        ? "Cuando registres ventas vas a ver acá cuánto ganás con cada producto."
                        : "Probá con otra categoría o limpiá la búsqueda."}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((l, i) => (
                <tr key={l.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-tertiary)]">{i + 1}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{l.product}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{l.category}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-secondary)] dark:text-muted">{l.unitsSold.toLocaleString("es-PE")}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(l.revenue)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-secondary)]">
                    <span className="inline-flex items-center justify-end gap-1">
                      {l.costEstimated && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0"
                          aria-label="Costo aproximado: la venta no guardó el costo del momento"
                        />
                      )}
                      {fmt(l.cogs)}
                    </span>
                  </td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right font-bold", l.grossMargin >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{fmt(l.grossMargin)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                    <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", l.marginPct >= 35 ? "text-[var(--data-success-500)]" : l.marginPct >= 25 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                      {l.marginPct >= 35 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {pct(l.marginPct)}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3">
                    <button onClick={() => setDetail(l)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15"><Eye className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface/50">
              <tr className="font-extrabold">
                <td colSpan={3} className="px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase text-[var(--text-secondary)]">
                  {isFiltered ? `Totales (${filtered.length} de ${lines.length})` : "Totales"}
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">{visibleTotals.units.toLocaleString("es-PE")}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(visibleTotals.revenue)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-secondary)]">{fmt(visibleTotals.cogs)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--data-success-500)]">{fmt(visibleTotals.grossMargin)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--data-success-500)]">{pct(visibleTotals.marginPct)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div
          className="modal-backdrop p-4"
          role="button"
          tabIndex={0}
          aria-label="Cerrar detalle"
          onClick={() => setDetail(null)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setDetail(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de producto"
            className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 w-full max-w-sm space-y-4"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">Detalle de producto</CardTitle>
              <button onClick={() => setDetail(null)} aria-label="Cerrar"><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Producto", detail.product], ["Categoría", detail.category], ["Período", detail.period],
                ["Uds. vendidas", detail.unitsSold.toLocaleString("es-PE")],
                ["Ingresos", fmt(detail.revenue)], ["Costo de venta", fmt(detail.cogs)],
                ["Margen bruto", fmt(detail.grossMargin)], ["% Margen", pct(detail.marginPct)],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                  <span className="text-[var(--text-secondary)] dark:text-muted">{k}</span>
                  <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
