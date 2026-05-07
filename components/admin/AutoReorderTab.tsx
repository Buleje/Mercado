"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useMemo } from "react";
import {
  RefreshCw, Loader2, CheckCircle2, ShoppingCart, ArrowRight,
  ToggleLeft, ToggleRight, Search, History, AlertTriangle,
  TrendingDown, Package, SlidersHorizontal, X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Supplier } from "@/types/erp";

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertLevel = "critical" | "low" | "warning";

type ReorderProduct = {
  id: string;
  name: string;
  stock: number;
  stockMin: number;
  stockMax: number;
  price: number;
  category: string;
  unit: string;
  suggestedQty: number;
  autoReorderEnabled: boolean;
};

type ReorderHistoryEntry = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  supplierId: string;
  supplierName: string;
  createdAt: string;
  status: "pendiente" | "enviada" | "recibida";
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function stockLevel(p: ReorderProduct): AlertLevel {
  const ratio = p.stockMin > 0 ? p.stock / p.stockMin : 1;
  if (ratio <= 0.3) return "critical";
  if (ratio <= 0.7) return "low";
  return "warning";
}

const LEVEL_CONFIG: Record<AlertLevel, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: "Crítico",   color: "text-[var(--data-error-500)]",    bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",    dot: "bg-[var(--data-error-500)]" },
  low:      { label: "Bajo",      color: "text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", dot: "bg-[var(--data-warning-500)]" },
  warning:  { label: "Alerta",    color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", dot: "bg-[var(--data-warning-500)]" },
};

const HISTORY_STATUS: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
  enviada:   { label: "Enviada",   color: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  recibida:  { label: "Recibida",  color: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AutoReorderTab() {
  const [products, setProducts]     = useState<ReorderProduct[]>([]);
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
  const [history, setHistory]       = useState<ReorderHistoryEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState<"products" | "history">("products");
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [supplierId, setSupplierId] = useState("");
  const [creating, setCreating]     = useState(false);
  const [created, setCreated]       = useState<string | null>(null);
  const [tick, setTick]             = useState(0);
  const [search, setSearch]         = useState("");
  const [filterLevel, setFilterLevel] = useState<AlertLevel | "all">("all");
  const [editThresholds, setEditThresholds] = useState<ReorderProduct | null>(null);
  const [thresholdForm, setThresholdForm]   = useState({ stockMin: 0, stockMax: 0 });
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch("/api/auto-reorder").then(r => r.ok ? r.json() : []),
      fetch("/api/suppliers").then(r => r.ok ? r.json() : []),
      fetch("/api/auto-reorder/history").then(r => r.ok ? r.json() : []),
    ]).then(([prods, sups, hist]) => {
      if (!active) return;
      setProducts(prods);
      setSuppliers(sups);
      setHistory(hist);
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tick]);

  const filtered = useMemo(() => {
    let list = products;
    if (filterLevel !== "all") list = list.filter(p => stockLevel(p) === filterLevel);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    return list;
  }, [products, filterLevel, search]);

  const kpis = useMemo(() => {
    const critical = products.filter(p => stockLevel(p) === "critical").length;
    const low      = products.filter(p => stockLevel(p) === "low").length;
    const autoOn   = products.filter(p => p.autoReorderEnabled).length;
    return { critical, low, warning: products.length - critical - low, autoOn };
  }, [products]);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleAutoReorder = async (product: ReorderProduct) => {
    setTogglingId(product.id);
    await fetch(`/api/auto-reorder/${product.id}`, {
      method: "PUT",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ autoReorderEnabled: !product.autoReorderEnabled }),
    });
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, autoReorderEnabled: !p.autoReorderEnabled } : p));
    setTogglingId(null);
  };

  const saveThresholds = async () => {
    if (!editThresholds) return;
    await fetch(`/api/auto-reorder/${editThresholds.id}`, {
      method: "PUT",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ stockMin: thresholdForm.stockMin, stockMax: thresholdForm.stockMax }),
    });
    setProducts(prev => prev.map(p => p.id === editThresholds.id ? { ...p, ...thresholdForm } : p));
    setEditThresholds(null);
  };

  const generatePO = async () => {
    if (selected.size === 0 || !supplierId) return;
    setCreating(true);
    const items = products
      .filter(p => selected.has(p.id))
      .map(p => ({ productId: p.id, productName: p.name, quantity: p.suggestedQty, unitCost: p.price * 0.7 }));

    const total = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ supplierId, items, total }),
    });
    if (res.ok) {
      const po = await res.json();
      setCreated(po.id);
      setSelected(new Set());
      setTick(v => v + 1);
    }
    setCreating(false);
  };

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <RefreshCw className="h-6 w-6 text-primary" />
            Auto-Reorden Inteligente
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Stock bajo, umbrales y órdenes automáticas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["products", "history"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted"
              )}>
              {v === "products" ? "Productos" : <span className="flex items-center gap-1"><History className="h-3 w-3" />Historial</span>}
            </button>
          ))}
          <button onClick={() => setTick(v => v + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition">
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Críticos",         value: kpis.critical, color: "text-[var(--data-error-500)]",    bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20",    icon: AlertTriangle },
          { label: "Stock bajo",       value: kpis.low,      color: "text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20", icon: TrendingDown },
          { label: "En alerta",        value: kpis.warning,  color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20", icon: Package },
          { label: "Auto-reorden ON",  value: kpis.autoOn,   color: "text-[var(--data-success-500)]",bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: RefreshCw },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", color)} />
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Success banner */}
      {created && (
        <div className="flex flex-wrap items-center gap-2 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl px-4 py-3 text-sm text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Orden de compra creada: <span className="font-mono font-bold">{created.slice(0, 8)}...</span>
          <button onClick={() => setCreated(null)} className="ml-auto text-xs underline">Cerrar</button>
        </div>
      )}

      {/* Products view */}
      {view === "products" && (
        <>
          {products.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-card border border-dashed border-[var(--rule-base)] dark:border-card-border rounded-xl">
              <CheckCircle2 className="h-12 w-12 text-[var(--data-success-500)] mx-auto mb-3" />
              <p className="font-bold text-[var(--text-primary)] dark:text-foreground">Inventario en buen estado</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">No hay productos con stock bajo en este momento</p>
            </div>
          ) : (
            <>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar producto..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-xl bg-white dark:bg-surface" />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {(["all", "critical", "low", "warning"] as const).map(l => (
                    <button key={l} onClick={() => setFilterLevel(l)}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                        filterLevel === l ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted"
                      )}>
                      {l === "all" ? "Todos" : LEVEL_CONFIG[l].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate PO bar */}
              <div className="flex items-center gap-3 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                  <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{selected.size} seleccionados</span>
                </label>
                <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] hidden sm:block" />
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                  className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm flex-1 min-w-40">
                  <option value="">Seleccionar proveedor...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button
                  onClick={generatePO}
                  disabled={selected.size === 0 || !supplierId || creating}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  Generar Orden
                </button>
              </div>

              {/* Products table */}
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead>
                      <tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-surface">
                        <th className="px-4 py-3 w-8"></th>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3">Categoría</th>
                        <th className="px-4 py-3 text-center">Stock</th>
                        <th className="px-4 py-3 text-center">Mín</th>
                        <th className="px-4 py-3 text-center">Máx</th>
                        <th className="px-4 py-3 text-center">Sugerido</th>
                        <th className="px-4 py-3 text-center">Nivel</th>
                        <th className="px-4 py-3 text-center">Auto</th>
                        <th className="px-4 py-3 text-center">Umbrales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                      {filtered.map(p => {
                        const level = stockLevel(p);
                        const lvl   = LEVEL_CONFIG[level];
                        return (
                          <tr key={p.id} className={cn("hover:bg-gray-50 dark:hover:bg-surface/50 transition", selected.has(p.id) && "bg-primary/5")}>
                            <td className="px-4 py-3">
                              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="rounded" />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-[var(--text-primary)] dark:text-foreground">{p.name}</div>
                            </td>
                            <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-muted capitalize text-xs">{p.category}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className={cn("w-2 h-2 rounded-full", lvl.dot)} />
                                <span className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{p.stock}</span>
                                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{p.unit}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-[var(--text-secondary)] dark:text-muted text-xs">{p.stockMin}</td>
                            <td className="px-4 py-3 text-center text-[var(--text-secondary)] dark:text-muted text-xs">{p.stockMax}</td>
                            <td className="px-4 py-3 text-center font-bold text-primary text-xs">{p.suggestedQty} {p.unit}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold uppercase", lvl.bg, lvl.color)}>
                                {lvl.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => toggleAutoReorder(p)}
                                disabled={togglingId === p.id}
                                className="flex items-center justify-center mx-auto transition disabled:opacity-50"
                                title={p.autoReorderEnabled ? "Desactivar auto-reorden" : "Activar auto-reorden"}
                              >
                                {p.autoReorderEnabled
                                  ? <ToggleRight className="h-6 w-6 text-primary" />
                                  : <ToggleLeft className="h-6 w-6 text-[var(--text-tertiary)]" />
                                }
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => { setEditThresholds(p); setThresholdForm({ stockMin: p.stockMin, stockMax: p.stockMax }); }}
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-[var(--text-tertiary)] hover:text-primary transition"
                                title="Editar umbrales"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* History view */}
      {view === "history" && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-surface">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-center">Cantidad</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {history.map(h => (
                  <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-surface/50 transition">
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)] dark:text-foreground">{h.productName}</td>
                    <td className="px-4 py-3 text-center font-bold text-primary">{h.quantity}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-muted text-xs">{h.supplierName}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-muted text-xs">{fmtDate(h.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", HISTORY_STATUS[h.status]?.color ?? "")}>
                        {HISTORY_STATUS[h.status]?.label ?? h.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--text-tertiary)]">Sin historial de reordenes</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit thresholds modal */}
      {editThresholds && (
        <div className="modal-backdrop p-4" onClick={() => setEditThresholds(null)}>
          <div className="bg-white dark:bg-card rounded-xl p-4 sm:p-6 w-full max-w-sm border border-[var(--rule-base)] dark:border-card-border space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Umbrales — {editThresholds.name}</CardTitle>
              <button onClick={() => setEditThresholds(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  Stock mínimo <span className="font-normal text-[var(--text-tertiary)]">(dispara alerta)</span>
                </label>
                <input type="number" min="0" value={thresholdForm.stockMin}
                  onChange={e => setThresholdForm(f => ({ ...f, stockMin: +e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  Stock máximo <span className="font-normal text-[var(--text-tertiary)]">(cantidad objetivo en reorden)</span>
                </label>
                <input type="number" min="0" value={thresholdForm.stockMax}
                  onChange={e => setThresholdForm(f => ({ ...f, stockMax: +e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
              <div className="bg-gray-50 dark:bg-surface rounded-xl px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-muted">
                Cantidad sugerida de reorden: <strong className="text-primary">{Math.max(0, thresholdForm.stockMax - editThresholds.stock)} {editThresholds.unit}</strong>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditThresholds(null)} className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
              <button onClick={saveThresholds} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
