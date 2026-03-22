"use client";

import { useState, useMemo } from "react";
import {
  BarChart3, Download, Search, Eye, X, AlertTriangle,
  ArrowUp, ArrowDown, Minus, TrendingUp,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Positioning = "competitivo" | "premium" | "economico" | "alineado";

type BenchmarkItem = {
  id: string;
  product: string;
  category: string;
  ownPrice: number;
  competitor1: { name: string; price: number | null };
  competitor2: { name: string; price: number | null };
  competitor3: { name: string; price: number | null };
  marketAvg: number;
  diffPct: number;       // % vs market avg  (positive = more expensive)
  positioning: Positioning;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toFixed(2);
const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

const POS_META: Record<Positioning, { label: string; color: string; bg: string }> = {
  competitivo: { label: "Competitivo", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  premium:     { label: "Premium",     color: "text-violet-600",  bg: "bg-violet-100 dark:bg-violet-900/30" },
  economico:   { label: "Económico",   color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30" },
  alineado:    { label: "Alineado",    color: "text-gray-600",    bg: "bg-gray-100 dark:bg-gray-800/30" },
};

const CATEGORIES = ["Bebidas", "Abarrotes", "Lácteos", "Limpieza", "Snacks", "Licores"];

// ── Data ──────────────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────

export default function PriceBenchmarkTab() {
  const [items] = useState<BenchmarkItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("todos");
  const [filterPos, setFilterPos] = useState<Positioning | "todos">("todos");
  const [detail, setDetail] = useState<BenchmarkItem | null>(null);

  const filtered = useMemo(() => {
    let list = [...items];
    if (filterCat !== "todos") list = list.filter(i => i.category === filterCat);
    if (filterPos !== "todos") list = list.filter(i => i.positioning === filterPos);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.product.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.diffPct - a.diffPct);
  }, [items, filterCat, filterPos, search]);

  const stats = useMemo(() => {
    const overpriced = items.filter(i => i.diffPct > 10).length;
    const competitive = items.filter(i => i.positioning === "competitivo" || i.positioning === "alineado").length;
    const avgDiff = items.length > 0 ? items.reduce((s, i) => s + i.diffPct, 0) / items.length : 0;
    return { total: items.length, overpriced, competitive, avgDiff };
  }, [items]);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Benchmark de Precios
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Comparativa de precios vs competencia local para posicionamiento estratégico</p>
        </div>
        <button onClick={() => exportToCSV(filtered.map(i => ({ producto: i.product, categoria: i.category, precio_propio: i.ownPrice, comp1: i.competitor1.price ?? "N/A", comp2: i.competitor2.price ?? "N/A", comp3: i.competitor3.price ?? "N/A", promedio_mercado: i.marketAvg.toFixed(2), diferencia_pct: i.diffPct.toFixed(1), posicionamiento: POS_META[i.positioning].label })), "benchmark-precios")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Productos analizados", value: String(stats.total), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Competitivos / Alineados", value: String(stats.competitive), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Sobre mercado (>10%)", value: String(stats.overpriced), color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "Dif. promedio", value: pct(stats.avgDiff), color: stats.avgDiff > 0 ? "text-amber-600" : "text-emerald-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alert */}
      {stats.overpriced > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-700 dark:text-red-400 text-sm">Productos sobre el mercado</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">{stats.overpriced} producto(s) con precio &gt;10% sobre el promedio de la competencia. Considerar ajustes para mantener competitividad.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterPos} onChange={e => setFilterPos(e.target.value as Positioning | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los posicionamientos</option>
          {(Object.keys(POS_META) as Positioning[]).map(p => <option key={p} value={p}>{POS_META[p].label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-gray-200 dark:border-card-border">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Producto</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Nuestro</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Comp. 1</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Comp. 2</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Comp. 3</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Prom. mercado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Diferencia</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Posición</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">Sin productos.</td></tr>}
              {filtered.map(i => {
                const pos = POS_META[i.positioning];
                const DiffIcon = i.diffPct > 3 ? ArrowUp : i.diffPct < -3 ? ArrowDown : Minus;
                const diffColor = i.diffPct > 10 ? "text-red-500" : i.diffPct > 3 ? "text-amber-600" : i.diffPct < -3 ? "text-emerald-600" : "text-gray-400";
                return (
                  <tr key={i.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <p className="font-semibold text-gray-800 dark:text-foreground text-xs">{i.product}</p>
                      <p className="text-[10px] text-gray-400">{i.category}</p>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-xs text-gray-800 dark:text-foreground">{fmt(i.ownPrice)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-gray-500">{i.competitor1.price != null ? fmt(i.competitor1.price) : "—"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-gray-500">{i.competitor2.price != null ? fmt(i.competitor2.price) : "—"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-gray-500">{i.competitor3.price != null ? fmt(i.competitor3.price) : "—"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-gray-600 dark:text-muted">{fmt(i.marketAvg)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                      <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", diffColor)}>
                        <DiffIcon className="h-3 w-3" />{pct(i.diffPct)}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", pos.bg, pos.color)}>{pos.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(i)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"><Eye className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price distribution */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5 space-y-3">
        <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Distribución de posicionamiento
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.keys(POS_META) as Positioning[]).map(p => {
            const count = items.filter(i => i.positioning === p).length;
            const pctVal = items.length > 0 ? (count / items.length) * 100 : 0;
            return (
              <div key={p} className={cn("rounded-xl p-3", POS_META[p].bg)}>
                <p className={cn("text-lg font-extrabold", POS_META[p].color)}>{count}</p>
                <p className="text-xs text-gray-500 dark:text-muted">{POS_META[p].label} ({pctVal.toFixed(0)}%)</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm">{detail.product}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Nuestro precio</span><span className="font-bold text-gray-800 dark:text-foreground">{fmt(detail.ownPrice)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{detail.competitor1.name}</span><span className="font-semibold">{detail.competitor1.price != null ? fmt(detail.competitor1.price) : "N/D"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{detail.competitor2.name}</span><span className="font-semibold">{detail.competitor2.price != null ? fmt(detail.competitor2.price) : "N/D"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{detail.competitor3.name}</span><span className="font-semibold">{detail.competitor3.price != null ? fmt(detail.competitor3.price) : "N/D"}</span></div>
              <hr className="border-gray-200 dark:border-card-border" />
              <div className="flex justify-between"><span className="text-gray-500">Promedio mercado</span><span className="font-bold">{fmt(detail.marketAvg)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Diferencia</span><span className={cn("font-bold", detail.diffPct > 10 ? "text-red-500" : "text-emerald-600")}>{pct(detail.diffPct)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Posicionamiento</span><span className={cn("font-bold", POS_META[detail.positioning].color)}>{POS_META[detail.positioning].label}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
