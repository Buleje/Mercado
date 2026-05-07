"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Download, X } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

/* ── types ──────────────────────────────────────────────────── */
type ReorderProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  currentStock: number;
  avgDailySales: number;
  leadTimeDays: number;
  safetyStock: number;
  dynamicROP: number;
  eoq: number;
  daysUntilStockout: number;
  status: "urgente" | "pronto" | "ok" | "sobrestock";
  trend: "up" | "down" | "stable";
  lastOrderDate: string;
};

/* ── seed data ──────────────────────────────────────────────── */
const _fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PRODUCTS: ReorderProduct[] = [];

const CATEGORIES = ["Abarrotes", "Bebidas", "Lácteos", "Limpieza", "Higiene Personal", "Panadería", "Carnes y Embutidos", "Congelados", "Snacks", "Mascotas", "Otros"];
const STATUS_CONFIG = {
  urgente:    { label: "Urgente",     color: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",           dot: "bg-[var(--data-error-500)]" },
  pronto:     { label: "Pronto",      color: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",   dot: "bg-[var(--data-warning-500)]" },
  ok:         { label: "OK",          color: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", dot: "bg-[var(--accent-soft)]" },
  sobrestock: { label: "Sobrestock",  color: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",       dot: "bg-[var(--accent-soft)]" },
};

/* ── component ──────────────────────────────────────────────── */
export default function DynamicReorderTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "urgente" | "pronto" | "ok" | "sobrestock">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [detail, setDetail] = useState<ReorderProduct | null>(null);
  const [sortBy, setSortBy] = useState<"stockout" | "name" | "stock">("stockout");

  const filtered = useMemo(() => {
    const items = PRODUCTS.filter(p => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    if (sortBy === "stockout") items.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
    else if (sortBy === "name") items.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "stock") items.sort((a, b) => a.currentStock - b.currentStock);
    return items;
  }, [search, statusFilter, categoryFilter, sortBy]);

  const urgentCount = PRODUCTS.filter(p => p.status === "urgente").length;
  const prontCount = PRODUCTS.filter(p => p.status === "pronto").length;
  const overstockCount = PRODUCTS.filter(p => p.status === "sobrestock").length;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">Punto de Reorden Dinámico</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">Cálculo automático de cuándo y cuánto reordenar basado en demanda real</p>
        </div>
        <button
          onClick={() => exportToCSV(filtered.map(p => ({ Producto: p.name, SKU: p.sku, StockActual: p.currentStock, VentaDiaria: p.avgDailySales, LeadTime: p.leadTimeDays, PuntoReorden: p.dynamicROP, EOQ: p.eoq, DíasAgotamiento: p.daysUntilStockout, Estado: p.status })), "punto-reorden")}
          className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 rounded-xl border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] p-4 ">
          <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold">Reorden urgente</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-1">{urgentCount}</p>
          <p className="text-xs text-[var(--data-error-500)]">productos bajo ROP</p>
        </div>
        <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] p-4 ">
          <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-semibold">Reorden pronto</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-1">{prontCount}</p>
          <p className="text-xs text-[var(--data-warning-500)]">próximos 7 días</p>
        </div>
        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 p-4 ">
          <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold">Stock saludable</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1">{PRODUCTS.filter(p => p.status === "ok").length}</p>
          <p className="text-xs text-[var(--data-success-500)]">nivel adecuado</p>
        </div>
        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 p-4 ">
          <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold">Sobrestock</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1">{overstockCount}</p>
          <p className="text-xs text-[var(--data-success-500)]">capital inmovilizado</p>
        </div>
      </div>

      {/* Urgent alert */}
      {urgentCount > 0 && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-sm">¡{urgentCount} producto(s) necesitan reorden inmediata!</h4>
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-1">{PRODUCTS.filter(p => p.status === "urgente").map(p => p.name).join(", ")}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="text" placeholder="Buscar producto o SKU..." value={search} onChange={e => setSearch(e.target.value)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground text-sm outline-none focus:border-primary w-56" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="px-3 py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:border-primary">
          <option value="all">Todos los estados</option>
          <option value="urgente">Urgente</option>
          <option value="pronto">Pronto</option>
          <option value="ok">OK</option>
          <option value="sobrestock">Sobrestock</option>
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:border-primary">
          <option value="all">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="px-3 py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:border-primary">
          <option value="stockout">Días agotamiento</option>
          <option value="name">Nombre</option>
          <option value="stock">Stock actual</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border  overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border">
                <th className="text-left px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted font-semibold">Producto</th>
                <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted font-semibold">Stock</th>
                <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted font-semibold">Venta/día</th>
                <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted font-semibold">ROP</th>
                <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted font-semibold">EOQ</th>
                <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted font-semibold">Días restantes</th>
                <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted font-semibold">Tendencia</th>
                <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const cfg = STATUS_CONFIG[p.status];
                return (
                  <tr key={p.id} onClick={() => setDetail(p)} className="border-b border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface cursor-pointer transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <p className="font-semibold text-[var(--text-primary)] dark:text-foreground">{p.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{p.sku} · {p.category}</p>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-bold text-[var(--text-primary)] dark:text-foreground">{p.currentStock}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-[var(--text-primary)] dark:text-foreground">{p.avgDailySales.toFixed(1)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-bold text-primary">{p.dynamicROP}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-[var(--text-primary)] dark:text-foreground">{p.eoq}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                      <span className={cn("font-extrabold", p.daysUntilStockout <= 3 ? "text-[var(--data-error-500)]" : p.daysUntilStockout <= 7 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)] dark:text-foreground")}>{p.daysUntilStockout}d</span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                      {p.trend === "up" && <TrendingUp className="h-4 w-4 text-[var(--data-success-500)] mx-auto" />}
                      {p.trend === "down" && <TrendingDown className="h-4 w-4 text-[var(--data-error-500)] mx-auto" />}
                      {p.trend === "stable" && <span className="text-[var(--text-tertiary)]">→</span>}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                      <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold", cfg.color)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{detail.name}</CardTitle>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
                <div><p className="text-xs text-[var(--text-secondary)] dark:text-muted">SKU</p><p className="font-bold text-[var(--text-primary)] dark:text-foreground">{detail.sku}</p></div>
                <div><p className="text-xs text-[var(--text-secondary)] dark:text-muted">Categoría</p><p className="font-bold text-[var(--text-primary)] dark:text-foreground">{detail.category}</p></div>
                <div><p className="text-xs text-[var(--text-secondary)] dark:text-muted">Stock actual</p><p className="font-bold text-[var(--text-primary)] dark:text-foreground">{detail.currentStock} u</p></div>
                <div><p className="text-xs text-[var(--text-secondary)] dark:text-muted">Venta diaria promedio</p><p className="font-bold text-[var(--text-primary)] dark:text-foreground">{detail.avgDailySales.toFixed(1)} u/día</p></div>
                <div><p className="text-xs text-[var(--text-secondary)] dark:text-muted">Lead time proveedor</p><p className="font-bold text-[var(--text-primary)] dark:text-foreground">{detail.leadTimeDays} días</p></div>
                <div><p className="text-xs text-[var(--text-secondary)] dark:text-muted">Stock seguridad</p><p className="font-bold text-[var(--text-primary)] dark:text-foreground">{detail.safetyStock} u</p></div>
              </div>

              <div className="bg-primary/5 rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-primary text-sm">Cálculo dinámico</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Punto de reorden (ROP)</p>
                    <p className="font-extrabold text-primary text-lg">{detail.dynamicROP} u</p>
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">= (Venta/día × Lead time) + Stock seguridad</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Cantidad económica (EOQ)</p>
                    <p className="font-extrabold text-primary text-lg">{detail.eoq} u</p>
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Lote óptimo de compra</p>
                  </div>
                </div>
              </div>

              <div className={cn("rounded-xl p-4 text-center", detail.status === "urgente" ? "bg-[var(--data-error-50)] dark:bg-red-950/20" : detail.status === "pronto" ? "bg-[var(--data-warning-50)] dark:bg-amber-950/20" : detail.status === "sobrestock" ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]")}>
                <p className="text-xl sm:text-3xl font-extrabold">{detail.daysUntilStockout}</p>
                <p className="text-sm text-[var(--text-secondary)] dark:text-muted">días hasta agotamiento</p>
                {detail.status === "urgente" && <p className="text-xs text-[var(--data-error-500)] font-bold mt-2">¡Realizar pedido de {detail.eoq} unidades HOY!</p>}
                {detail.status === "sobrestock" && <p className="text-xs text-[var(--data-success-500)] font-bold mt-2">Considere reducir siguiente pedido o liquidar excedente</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Methodology */}
      <div className="bg-gray-50 dark:bg-surface rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5">
        <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-sm mb-2">Metodología del cálculo</CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs text-[var(--text-secondary)] dark:text-muted">
          <div><strong>ROP (Punto de Reorden):</strong> Venta diaria × Lead Time + Stock Seguridad. Ajustado dinámicamente según tendencia de ventas.</div>
          <div><strong>EOQ (Cantidad Económica):</strong> Lote óptimo de compra que minimiza costos totales de inventario. Basado en demanda anual y costos de ordenar.</div>
          <div><strong>Stock Seguridad:</strong> Buffer calculado con desviación estándar de la demanda × factor de servicio (95%). Protege contra variabilidad.</div>
        </div>
      </div>
    </div>
  );
}
