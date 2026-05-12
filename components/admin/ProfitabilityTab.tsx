"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  TrendingUp, Download, Search, Eye, X, ArrowUpRight, ArrowDownRight,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

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
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(n: number) { return `${n.toFixed(1)}%`; }

const CATEGORIES = ["Bebidas", "Abarrotes", "Lácteos", "Limpieza", "Snacks", "Licores"];

// ── Seed Data ─────────────────────────────────────────────────────────────────

function seed(): ProfitLine[] {
  const items: Omit<ProfitLine, "id" | "grossMargin" | "marginPct">[] = [];
  return items.map((it, i) => {
    const gm = it.revenue - it.cogs;
    return { ...it, id: `p${i + 1}`, grossMargin: gm, marginPct: it.revenue > 0 ? (gm / it.revenue) * 100 : 0 };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfitabilityTab() {
  const [lines] = useState<ProfitLine[]>(seed);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("todos");
  const [sortBy, setSortBy] = useState<"marginPct" | "grossMargin" | "revenue" | "unitsSold">("marginPct");
  const [detail, setDetail] = useState<ProfitLine | null>(null);

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

  const totals = useMemo(() => {
    const rev = lines.reduce((s, l) => s + l.revenue, 0);
    const cost = lines.reduce((s, l) => s + l.cogs, 0);
    const gm = rev - cost;
    return { revenue: rev, cogs: cost, grossMargin: gm, marginPct: rev > 0 ? (gm / rev) * 100 : 0, units: lines.reduce((s, l) => s + l.unitsSold, 0) };
  }, [lines]);

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
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Cuánto Gano por Producto
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Mira cuánto ganas con cada producto y categoría</p>
        </div>
        <button onClick={() => exportToCSV(filtered.map(l => ({ producto: l.product, categoria: l.category, unidades: l.unitsSold, ingresos: l.revenue, costo: l.cogs, margen_bruto: l.grossMargin, margen_pct: Number(l.marginPct).toFixed(1) + "%" })), "ganancias-producto")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Descargar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Ingresos totales", value: fmt(totals.revenue), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Costo de venta", value: fmt(totals.cogs), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-orange-950/30" },
          { label: "Margen bruto", value: fmt(totals.grossMargin), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
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
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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
              {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-[var(--text-tertiary)] text-sm">Sin datos.</td></tr>}
              {filtered.map((l, i) => (
                <tr key={l.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-tertiary)]">{i + 1}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{l.product}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{l.category}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-secondary)] dark:text-muted">{l.unitsSold.toLocaleString("es-PE")}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(l.revenue)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-secondary)]">{fmt(l.cogs)}</td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right font-bold", l.grossMargin >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{fmt(l.grossMargin)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                    <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", l.marginPct >= 35 ? "text-[var(--data-success-500)]" : l.marginPct >= 25 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                      {l.marginPct >= 35 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {pct(l.marginPct)}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3">
                    <button onClick={() => setDetail(l)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]"><Eye className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface/50">
              <tr className="font-extrabold">
                <td colSpan={3} className="px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase text-[var(--text-secondary)]">Totales</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">{totals.units.toLocaleString("es-PE")}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(totals.revenue)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-secondary)]">{fmt(totals.cogs)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--data-success-500)]">{fmt(totals.grossMargin)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--data-success-500)]">{pct(totals.marginPct)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">Detalle de producto</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
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
