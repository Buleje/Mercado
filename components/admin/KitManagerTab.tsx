"use client";
import { useState, useMemo } from "react";
import { Boxes, Plus, Pencil, Trash2, Download, DollarSign, Package, Eye } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

/* ── Types ── */
type KitItem = { product: string; qty: number; unitCost: number };
type Kit = {
  id: number; name: string; description: string; items: KitItem[];
  salePrice: number; active: boolean; timesOrdered: number;
};

/* ── Seed Data ── */
const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
let nextId = 7;
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <Boxes className="h-6 w-6 text-teal-500" /> Kits y Combos
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">Crea paquetes de productos con precios especiales</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => exportToCSV(kits.map(k => ({ Nombre: k.name, Productos: k.items.length, Costo: getCost(k).toFixed(2), Precio: k.salePrice, Margen: `${getMargin(k).toFixed(1)}%`, Pedidos: k.timesOrdered, Activo: k.active ? "Sí" : "No" })), "kits")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-bold hover:bg-gray-50 dark:hover:bg-accent">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Nuevo Kit
          </button>
          {kits.length > 0 && (
            <button onClick={() => setKits([])} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <Trash2 className="h-4 w-4" /> Borrar todo
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Kits Activos</p>
          <p className="text-2xl font-extrabold text-teal-600 dark:text-teal-400 mt-1">{kits.filter(k => k.active).length}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Ingresos Totales</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground mt-1">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Margen Promedio</p>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{avgMargin.toFixed(1)}%</p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Total Pedidos Kits</p>
          <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">{kits.reduce((s, k) => s + k.timesOrdered, 0)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {(["todos", "activos", "inactivos"] as const).map(f => (
          <button key={f} onClick={() => setShowActive(f)} className={cn("px-4 py-2.5 rounded-xl text-sm font-bold transition-colors", showActive === f ? "bg-teal-500 text-white" : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Kit cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(kit => {
          const cost = getCost(kit);
          const margin = getMargin(kit);
          return (
            <div key={kit.id} className={cn("bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5 hover:shadow-md transition-shadow", !kit.active && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-gray-900 dark:text-foreground">{kit.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-muted mt-0.5">{kit.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setDetail(kit)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-accent"><Eye className="h-4 w-4" /></button>
                  <button onClick={() => toggleActive(kit.id)} className={cn("p-1.5 rounded-lg text-xs font-bold", kit.active ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-accent")}>
                    {kit.active ? "ON" : "OFF"}
                  </button>
                  <button onClick={() => deleteKit(kit.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {/* Items */}
              <div className="mt-3 space-y-1">
                {kit.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-muted flex items-center gap-1"><Package className="h-3 w-3" /> {item.product} × {item.qty}</span>
                    <span className="text-gray-400">{fmt(item.qty * item.unitCost)}</span>
                  </div>
                ))}
              </div>
              {/* Pricing */}
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-card-border grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] text-gray-400">Costo</p><p className="text-sm font-bold text-gray-600">{fmt(cost)}</p></div>
                <div><p className="text-[10px] text-gray-400">Precio Venta</p><p className="text-sm font-extrabold text-gray-900 dark:text-foreground">{fmt(kit.salePrice)}</p></div>
                <div><p className="text-[10px] text-gray-400">Margen</p><p className={cn("text-sm font-extrabold", margin >= 20 ? "text-emerald-600" : margin >= 10 ? "text-amber-600" : "text-red-600")}>{margin.toFixed(1)}%</p></div>
              </div>
              <div className="mt-2 text-xs text-gray-400 dark:text-muted text-right">Ahorro cliente: {fmt(cost - kit.salePrice > 0 ? 0 : cost * 1.3 - kit.salePrice)} • {kit.timesOrdered} pedidos</div>
            </div>
          );
        })}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.name}</h3>
              <button onClick={() => setDetail(null)} className="text-xl font-bold text-gray-400">×</button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-500">{detail.description}</p>
              <div className="space-y-2">
                {detail.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-surface rounded-xl p-3">
                    <span className="text-sm font-bold">{item.product}</span>
                    <span className="text-sm text-gray-500">{item.qty} × {fmt(item.unitCost)} = {fmt(item.qty * item.unitCost)}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-100 dark:border-card-border">
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 text-center"><span className="text-xs text-gray-400">Costo</span><p className="font-bold">{fmt(getCost(detail))}</p></div>
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 text-center"><span className="text-xs text-gray-400">Precio</span><p className="font-extrabold">{fmt(detail.salePrice)}</p></div>
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 text-center"><span className="text-xs text-gray-400">Margen</span><p className="font-extrabold text-emerald-600">{getMargin(detail).toFixed(1)}%</p></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
