"use client";

import { PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  ListChecks, Download, Search, AlertTriangle, ArrowDown,
  ArrowUp, Minus, ShoppingCart, TrendingUp, BarChart3,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Trend = "subiendo" | "estable" | "bajando";
type Urgency = "urgente" | "pronto" | "normal" | "ok";

type PlanItem = {
  id: string;
  product: string;
  category: string;
  stock: number;
  unit: string;
  avgDailyDemand: number;
  leadTimeDays: number;
  safetyFactor: number;
  reorderPoint: number;
  suggestedQty: number;
  lastPurchasePrice: number;
  estimatedCost: number;
  trend: Trend;
  daysToStockout: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("es-PE");

function getUrgency(daysToStockout: number): Urgency {
  if (daysToStockout <= 3) return "urgente";
  if (daysToStockout <= 7) return "pronto";
  if (daysToStockout <= 14) return "normal";
  return "ok";
}

const URGENCY_META: Record<Urgency, { label: string; color: string; bg: string }> = {
  urgente: { label: "Urgente",  color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30" },
  pronto:  { label: "Pronto",   color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  normal:  { label: "Normal",   color: "text-[var(--data-success-500)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  ok:      { label: "OK",       color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
};

const TREND_ICON: Record<Trend, { icon: typeof ArrowUp; color: string; label: string }> = {
  subiendo: { icon: ArrowUp,   color: "text-[var(--data-success-500)]", label: "Subiendo" },
  estable:  { icon: Minus,     color: "text-[var(--text-tertiary)]",    label: "Estable" },
  bajando:  { icon: ArrowDown, color: "text-[var(--data-error-500)]",     label: "Bajando" },
};

const CATEGORIES = ["Bebidas", "Abarrotes", "Lácteos", "Limpieza", "Snacks", "Licores"];

// ── Data ──────────────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────

export default function PurchasePlanningTab() {
  const [items] = useState<PlanItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("todos");
  const [filterUrgency, setFilterUrgency] = useState<Urgency | "todos">("todos");

  const filtered = useMemo(() => {
    let list = [...items];
    if (filterCat !== "todos") list = list.filter(i => i.category === filterCat);
    if (filterUrgency !== "todos") list = list.filter(i => getUrgency(i.daysToStockout) === filterUrgency);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.product.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.daysToStockout - b.daysToStockout);
  }, [items, filterCat, filterUrgency, search]);

  const stats = useMemo(() => {
    const needReorder = items.filter(i => i.suggestedQty > 0);
    const urgent = items.filter(i => getUrgency(i.daysToStockout) === "urgente");
    const totalCost = needReorder.reduce((s, i) => s + i.estimatedCost, 0);
    return { needReorder: needReorder.length, urgent: urgent.length, totalCost, total: items.length };
  }, [items]);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary" /> Planificación de Compras
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Sugerencia inteligente basada en rotación, demanda y stock de seguridad</p>
        </div>
        <button onClick={() => exportToCSV(filtered.map(i => ({ producto: i.product, categoria: i.category, stock: i.stock, demanda_diaria: i.avgDailyDemand, punto_reorden: i.reorderPoint, sugerido: i.suggestedQty, costo_estimado: i.estimatedCost, dias_agotamiento: i.daysToStockout, tendencia: i.trend })), "plan-compras")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Productos", value: String(stats.total), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: BarChart3 },
          { label: "Necesitan reorden", value: String(stats.needReorder), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30", icon: ShoppingCart },
          { label: "Urgentes", value: String(stats.urgent), color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30", icon: AlertTriangle },
          { label: "Inversión sugerida", value: fmt(stats.totalCost), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: TrendingUp },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={cn("h-3.5 w-3.5", color)} />
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{label}</p>
            </div>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterUrgency} onChange={e => setFilterUrgency(e.target.value as Urgency | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todas las urgencias</option>
          {(Object.keys(URGENCY_META) as Urgency[]).map(u => <option key={u} value={u}>{URGENCY_META[u].label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Urgencia</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Producto</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Stock</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Dem. diaria</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Pto. Reorden</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Sugerido</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Costo est.</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Tendencia</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Días stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-[var(--text-tertiary)] text-sm">Sin productos.</td></tr>}
              {filtered.map(i => {
                const urg = URGENCY_META[getUrgency(i.daysToStockout)];
                const tr = TREND_ICON[i.trend];
                const TrIcon = tr.icon;
                return (
                  <tr key={i.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", urg.bg, urg.color)}>{urg.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <p className="font-semibold text-[var(--text-primary)] dark:text-foreground text-xs">{i.product}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{i.category} · {i.unit}</p>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-xs text-[var(--text-primary)] dark:text-foreground">{num(i.stock)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-[var(--text-secondary)]">{i.avgDailyDemand}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-[var(--text-secondary)]">{i.reorderPoint}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                      <span className={cn("font-bold text-xs", i.suggestedQty > 0 ? "text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]")}>
                        {i.suggestedQty > 0 ? `+${num(i.suggestedQty)}` : "—"}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{i.estimatedCost > 0 ? fmt(i.estimatedCost) : "—"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center"><TrIcon className={cn("h-4 w-4 mx-auto", tr.color)} /></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{i.daysToStockout}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Algorithm note */}
      <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-4 text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
        <p className="font-bold mb-1">Algoritmo de sugerencia</p>
        <p>Punto de reorden = demanda_diaria × plazo_entrega × (1 + factor_seguridad)</p>
        <p>Cantidad sugerida = máx(0, punto_reorden − stock_actual)</p>
        <p className="mt-1 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">El factor de seguridad varía por producto (20-30%) según variabilidad de demanda.</p>
      </div>
    </div>
  );
}
