"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import { Boxes, Plus, Trash2, Download, Package, Eye } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

/* ── Types ── */
type KitItem = { product: string; qty: number; unitCost: number };
type Kit = {
  id: number; name: string; description: string; items: KitItem[];
  salePrice: number; active: boolean; timesOrdered: number;
};

/* ── Seed Data ── */
const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
const _nextId = 7;
const INITIAL_KITS: Kit[] = [];

export default function KitManagerTab() {
  const [kits, setKits] = useState<Kit[]>(INITIAL_KITS);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Kit | null>(null);
  const [showActive, setShowActive] = useState<"todos" | "activos" | "inactivos">("todos");

  const filtered = useMemo(() => {
    if (showActive === "activos") return kits.filter(k => k.active);
    if (showActive === "inactivos") return kits.filter(k => !k.active);
    return kits;
  }, [kits, showActive]);

  const getCost = (kit: Kit) => kit.items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const getMargin = (kit: Kit) => { const c = getCost(kit); return ((kit.salePrice - c) / kit.salePrice * 100); };
  const totalRevenue = kits.filter(k => k.active).reduce((s, k) => s + k.salePrice * k.timesOrdered, 0);
  const avgMargin = kits.filter(k => k.active).reduce((s, k) => s + getMargin(k), 0) / Math.max(1, kits.filter(k => k.active).length);

  const toggleActive = (id: number) => setKits(prev => prev.map(k => k.id === id ? { ...k, active: !k.active } : k));
  const deleteKit = (id: number) => setKits(prev => prev.filter(k => k.id !== id));

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <Boxes className="h-6 w-6 text-[var(--accent)]" /> Kits y Combos
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">Crea paquetes de productos con precios especiales</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => exportToCSV(kits.map(k => ({ Nombre: k.name, Productos: k.items.length, Costo: getCost(k).toFixed(2), Precio: k.salePrice, Margen: `${getMargin(k).toFixed(1)}%`, Pedidos: k.timesOrdered, Activo: k.active ? "Sí" : "No" })), "kits")} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold hover:bg-[var(--surface-alt)] dark:hover:bg-accent">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Nuevo Kit
          </button>
          {kits.length > 0 && (
            <button onClick={() => setKits([])} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-sm font-bold hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 transition-colors">
              <Trash2 className="h-4 w-4" /> Borrar todo
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Kits Activos</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--accent)] mt-1">{kits.filter(k => k.active).length}</p>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Ingresos Totales</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-1">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Margen Promedio</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1">{avgMargin.toFixed(1)}%</p>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Total Pedidos Kits</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1">{kits.reduce((s, k) => s + k.timesOrdered, 0)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(["todos", "activos", "inactivos"] as const).map(f => (
          <button key={f} onClick={() => setShowActive(f)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg text-sm font-bold transition-colors", showActive === f ? "bg-[var(--accent-600,var(--accent))] text-white" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-accent")}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Kit cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
        {filtered.map(kit => {
          const cost = getCost(kit);
          const margin = getMargin(kit);
          return (
            <div key={kit.id} className={cn("bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5 hover:shadow-[var(--shadow-sm)] transition-shadow", !kit.active && "opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{kit.name}</CardTitle>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">{kit.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setDetail(kit)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-accent"><Eye className="h-4 w-4" /></button>
                  <button onClick={() => toggleActive(kit.id)} className={cn("p-1.5 rounded-lg text-xs font-bold", kit.active ? "text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-accent")}>
                    {kit.active ? "ON" : "OFF"}
                  </button>
                  <button onClick={() => deleteKit(kit.id)} className="p-1.5 rounded-lg text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {/* Items */}
              <div className="mt-3 space-y-1">
                {kit.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] dark:text-muted flex items-center gap-1"><Package className="h-3 w-3" /> {item.product} × {item.qty}</span>
                    <span className="text-[var(--text-tertiary)]">{fmt(item.qty * item.unitCost)}</span>
                  </div>
                ))}
              </div>
              {/* Pricing */}
              <div className="mt-3 pt-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-center">
                <div><p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Costo</p><p className="text-sm font-bold text-[var(--text-secondary)]">{fmt(cost)}</p></div>
                <div><p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Precio Venta</p><p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(kit.salePrice)}</p></div>
                <div><p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Margen</p><p className={cn("text-sm font-extrabold", margin >= 20 ? "text-[var(--data-success-500)]" : margin >= 10 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>{margin.toFixed(1)}%</p></div>
              </div>
              <div className="mt-2 text-xs text-[var(--text-tertiary)] dark:text-muted text-right">Ahorro cliente: {fmt(cost - kit.salePrice > 0 ? 0 : cost * 1.3 - kit.salePrice)} • {kit.timesOrdered} pedidos</div>
            </div>
          );
        })}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{detail.name}</CardTitle>
              <button onClick={() => setDetail(null)} className="text-base sm:text-xl font-bold text-[var(--text-tertiary)]">×</button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">{detail.description}</p>
              <div className="space-y-2">
                {detail.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3">
                    <span className="text-sm font-bold">{item.product}</span>
                    <span className="text-sm text-[var(--text-secondary)]">{item.qty} × {fmt(item.unitCost)} = {fmt(item.qty * item.unitCost)}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 text-center"><span className="text-xs text-[var(--text-tertiary)]">Costo</span><p className="font-bold">{fmt(getCost(detail))}</p></div>
                <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 text-center"><span className="text-xs text-[var(--text-tertiary)]">Precio</span><p className="font-extrabold">{fmt(detail.salePrice)}</p></div>
                <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 text-center"><span className="text-xs text-[var(--text-tertiary)]">Margen</span><p className="font-extrabold text-[var(--data-success-500)]">{getMargin(detail).toFixed(1)}%</p></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
