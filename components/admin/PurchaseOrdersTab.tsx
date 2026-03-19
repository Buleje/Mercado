"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  Trash2, Plus, ChevronDown, ChevronUp, Package,
  X, Truck, FileText, ScanBarcode, History,
  TrendingUp, BarChart3,
} from "lucide-react";
import type { DbPurchaseOrder, DbSupplier, DbProduct, PurchaseStatus } from "@/lib/jsondb";
import { cn } from "@/lib/utils";

const BarcodeScanner = dynamic(() => import("./BarcodeScanner"), { ssr: false });

const STATUS_LABELS: Record<PurchaseStatus, string> = {
  pendiente: "Pendiente",
  recibido: "Recibido",
  parcial: "Parcial",
  cancelado: "Cancelado",
};
const STATUS_COLORS: Record<PurchaseStatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  recibido: "bg-emerald-100 text-emerald-700",
  parcial: "bg-blue-100 text-blue-700",
  cancelado: "bg-red-100 text-red-500",
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

type ItemDraft = { productId: number; name: string; quantity: number; unitCost: number; unit: string };

export default function PurchaseOrdersTab() {
  const [orders, setOrders] = useState<DbPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  
  // Supplier filtering and history
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [expandedHistorySupplier, setExpandedHistorySupplier] = useState<string | null>(null);

  // Create form
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Per-item search
  const [itemQueries, setItemQueries] = useState<string[]>([]);
  const [openSearchIdx, setOpenSearchIdx] = useState<number | null>(null);

  // Barcode scanner
  const [showScanner, setShowScanner] = useState(false);

  // Add item modal
  const [showAddItemModal, setShowAddItemModal] = useState(false);

  useScrollLock(showCreate || showScanner || showAddItemModal);
  const [addItemMode, setAddItemMode] = useState<"search" | "new">("search");
  const [addItemSearch, setAddItemSearch] = useState("");
  const [addItemSel, setAddItemSel] = useState<DbProduct | null>(null);
  const [addItemQty, setAddItemQty] = useState(1);
  const [addItemCost, setAddItemCost] = useState(0);
  const [newProdForm, setNewProdForm] = useState({ name: "", category: "abarrotes", price: 0, costPrice: 0, unit: "und", barcode: "", stock: 1 });
  const [savingNewProd, setSavingNewProd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        fetch("/api/purchases"),
        fetch("/api/suppliers"),
        fetch("/api/products"),
      ]);
      if (poRes.ok) setOrders(await poRes.json());
      if (supRes.ok) setSuppliers(await supRes.json());
      if (prodRes.ok) setProducts((await prodRes.json()).filter((p: DbProduct) => p.active));
    } catch {}
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const addItemFromProduct = (p: DbProduct) => {
    setItems(prev => [...prev, { productId: p.id, name: p.name, quantity: 1, unitCost: p.costPrice ?? p.price, unit: p.unit }]);
    setItemQueries(prev => [...prev, p.name]);
    setOpenSearchIdx(null);
  };

  const handleScan = (code: string) => {
    setShowScanner(false);
    const p = products.find(x => x.barcode === code);
    if (p) addItemFromProduct(p);
  };

  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setItemQueries(prev => prev.filter((_, i) => i !== idx));
  };

  const changeProduct = (idx: number, productId: number) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    updateItem(idx, { productId: p.id, name: p.name, unitCost: p.costPrice ?? p.price, unit: p.unit });
  };

  const createOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId || items.length === 0) return;
    const sup = suppliers.find(s => s.id === supplierId);
    setSaving(true);
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        supplierName: sup?.name || "",
        items,
        notes: notes || undefined,
      }),
    });
    if (res.ok) {
      // Auto-create payable for this PO
      const po = await res.json();
      await fetch("/api/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          supplierName: sup?.name || "",
          purchaseOrderId: po.id,
          description: `Orden de compra ${po.id}`,
          amount: po.total,
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        }),
      });
    }
    setSaving(false);
    setShowCreate(false);
    setSupplierId("");
    setItems([]);
    setItemQueries([]);
    setNotes("");
    load();
  };

  const updateStatus = async (id: string, status: PurchaseStatus) => {
    await fetch(`/api/purchases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  const receiveOrder = async (id: string) => {
    await updateStatus(id, "recibido");
    const po = orders.find(o => o.id === id);
    if (po) {
      const freshProds: DbProduct[] = await fetch("/api/products").then(r => r.json());
      for (const item of po.items) {
        const prod = freshProds.find(p => p.id === item.productId);
        if (prod) {
          await fetch(`/api/products/${item.productId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stock: (prod.stock ?? 0) + item.quantity, costPrice: item.unitCost }),
          });
        } else {
          await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.name, category: "abarrotes", price: item.unitCost,
              costPrice: item.unitCost, unit: item.unit, stock: item.quantity, active: true,
            }),
          });
        }
      }
    }
    load();
  };

  const deleteOrder = async (id: string) => {
    if (!confirm("¿Eliminar esta orden de compra?")) return;
    await fetch(`/api/purchases/${id}`, { method: "DELETE" });
    load();
  };

  const itemsTotal = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  // Filter orders by supplier
  const filteredOrders = selectedSupplierId
    ? orders.filter(o => o.supplierId === selectedSupplierId)
    : orders;

  // Supplier analytics
  const getSupplierStats = (supplierId: string) => {
    const supplierOrders = orders.filter(o => o.supplierId === supplierId);
    const totalAmount = supplierOrders.reduce((s, o) => s + o.total, 0);
    const avgAmount = supplierOrders.length > 0 ? totalAmount / supplierOrders.length : 0;
    const lastPurchase = supplierOrders.length > 0 ? supplierOrders[0].createdAt : null;
    
    // Top 3 products
    const productCounts: Record<string, { name: string; count: number; total: number }> = {};
    for (const order of supplierOrders) {
      for (const item of order.items) {
        const key = String(item.productId);
        if (!productCounts[key]) {
          productCounts[key] = { name: item.name, count: 0, total: 0 };
        }
        productCounts[key].count += item.quantity;
        productCounts[key].total += item.quantity * item.unitCost;
      }
    }
    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    // Monthly spending (last 6 months)
    const monthlyData: Array<{ month: string; amount: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const monthKey = d.toISOString().slice(0, 7);
      const monthLabel = d.toLocaleDateString("es-PE", { month: "short" });
      const monthOrders = supplierOrders.filter(o => o.createdAt.startsWith(monthKey));
      const monthTotal = monthOrders.reduce((s, o) => s + o.total, 0);
      monthlyData.push({ month: monthLabel, amount: monthTotal });
    }

    return {
      count: supplierOrders.length,
      totalAmount,
      avgAmount,
      lastPurchase,
      topProducts,
      monthlyData,
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Órdenes de Compra</h2>
          <p className="text-sm text-gray-500 dark:text-muted">{filteredOrders.length} órdenes · S/{filteredOrders.reduce((s, o) => s + o.total, 0).toFixed(2)} acumulado</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={selectedSupplierId ?? ""}
            onChange={(e) => setSelectedSupplierId(e.target.value || null)}
            className="text-sm font-semibold rounded-lg border border-gray-200 dark:border-card-border px-3 py-2 outline-none focus:border-primary text-gray-700 dark:text-foreground bg-white dark:bg-card"
          >
            <option value="">Ver todo</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button onClick={() => setShowSupplierHistory(v => !v)} className="flex items-center gap-1.5 text-sm font-bold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 dark:hover:bg-accent/80 px-4 py-2 rounded-lg transition-colors">
            <History className="h-4 w-4" /> Historial
          </button>
          <button onClick={() => setShowCreate(v => !v)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dark px-4 py-2 rounded-lg transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Nueva orden
          </button>
        </div>
      </div>

      {/* Supplier History Cards */}
      {showSupplierHistory && (
        <div className="space-y-3">
          {suppliers.filter(s => orders.some(o => o.supplierId === s.id)).map(supplier => {
            const stats = getSupplierStats(supplier.id);
            const isExpanded = expandedHistorySupplier === supplier.id;
            const maxMonthAmount = Math.max(...stats.monthlyData.map(m => m.amount), 1);
            
            return (
              <div key={supplier.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
                        <History className="h-5 w-5 text-primary" />
                        {supplier.name}
                      </h3>
                      <p className="text-xs text-gray-400 dark:text-muted mt-0.5">
                        {supplier.ruc && `RUC: ${supplier.ruc}`}
                      </p>
                    </div>
                    <button
                      onClick={() => setExpandedHistorySupplier(isExpanded ? null : supplier.id)}
                      className="text-xs font-bold text-primary hover:text-primary-dark flex items-center gap-1"
                    >
                      {isExpanded ? "Ocultar" : "Ver historial completo"}
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3 border border-blue-100 dark:border-blue-900/30">
                      <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Órdenes</p>
                      <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{stats.count}</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-3 border border-emerald-100 dark:border-emerald-900/30">
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-1">Total gastado</p>
                      <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">S/{stats.totalAmount.toFixed(2)}</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl p-3 border border-purple-100 dark:border-purple-900/30">
                      <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase mb-1">Promedio</p>
                      <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">S/{stats.avgAmount.toFixed(2)}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-3 border border-amber-100 dark:border-amber-900/30">
                      <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase mb-1">Última compra</p>
                      <p className="text-xs font-extrabold text-gray-900 dark:text-foreground">{stats.lastPurchase ? formatDate(stats.lastPurchase) : "—"}</p>
                    </div>
                  </div>

                  {/* Top Products */}
                  {stats.topProducts.length > 0 && (
                    <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 mb-3 border border-gray-200 dark:border-card-border">
                      <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase mb-2 flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Top 3 productos más comprados
                      </p>
                      <div className="space-y-1.5">
                        {stats.topProducts.map((prod, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 dark:text-foreground flex items-center gap-1.5">
                              <span className="text-xs font-bold text-gray-400 dark:text-muted">#{idx + 1}</span>
                              {prod.name}
                              <span className="text-gray-400 dark:text-muted text-xs">({prod.count} und)</span>
                            </span>
                            <span className="font-semibold text-primary">S/{prod.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Monthly Chart */}
                  <div className="bg-linear-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-xl p-3 border border-indigo-100 dark:border-indigo-900/30">
                    <p className="text-xs font-bold text-gray-700 dark:text-foreground uppercase mb-2 flex items-center gap-1">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                      Gastos mensuales (últimos 6 meses)
                    </p>
                    <div className="flex items-end gap-2 h-20">
                      {stats.monthlyData.map((m, idx) => {
                        const height = maxMonthAmount > 0 ? (m.amount / maxMonthAmount) * 100 : 0;
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full flex items-end justify-center" style={{ height: "64px" }}>
                              <div
                                className="w-full bg-gradient-to-t from-primary to-primary/60 rounded-t transition-all hover:from-primary-dark hover:to-primary"
                                style={{ height: `${height}%` }}
                                title={`${m.month}: S/${m.amount.toFixed(2)}`}
                              ></div>
                            </div>
                            <p className="text-[9px] font-bold text-gray-500 dark:text-muted uppercase">{m.month}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Expanded Timeline */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface p-4">
                    <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase mb-3">Cronología completa de compras</p>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {orders.filter(o => o.supplierId === supplier.id).map(order => (
                        <div key={order.id} className="bg-white dark:bg-card rounded-xl p-3 border border-gray-200 dark:border-card-border">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-gray-900 dark:text-foreground">{formatDate(order.createdAt)}</span>
                            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", STATUS_COLORS[order.status])}>
                              {STATUS_LABELS[order.status]}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-muted">
                            {order.items.length} producto{order.items.length !== 1 ? "s" : ""} · <span className="font-bold text-primary">S/{order.total.toFixed(2)}</span>
                          </div>
                          {order.notes && <p className="text-xs text-gray-400 dark:text-muted mt-1 italic">{order.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create order modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="bg-white dark:bg-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-y-auto max-h-[90dvh]">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-card z-10">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Nueva orden de compra
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-gray-500 dark:text-muted" />
              </button>
            </div>
            <form onSubmit={createOrder} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Proveedor *</label>
                  <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm">
                    <option value="">Seleccionar proveedor</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.ruc ? ` (${s.ruc})` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Notas</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas opcionales…" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-muted">Productos de la orden</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowScanner(true)} className="text-xs font-bold text-gray-600 dark:text-muted hover:text-primary flex items-center gap-1 border border-gray-200 dark:border-card-border rounded-lg px-2.5 py-1 transition-colors">
                      <ScanBarcode className="h-3.5 w-3.5" /> Escanear
                    </button>
                    <button type="button" onClick={() => { setAddItemMode("search"); setAddItemSearch(""); setAddItemSel(null); setShowAddItemModal(true); }} className="text-xs font-bold text-primary hover:text-primary-dark flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> Agregar
                    </button>
                  </div>
                </div>
                {items.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-muted text-center py-4">Agrega productos a la orden</p>
                )}
                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const q = itemQueries[idx] ?? "";
                    const filtered = q.length > 0
                      ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || (p.barcode ?? "").includes(q)).slice(0, 6)
                      : [];
                    return (
                      <div key={idx} className="bg-gray-50 dark:bg-surface rounded-xl p-2 space-y-1">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 relative">
                            <input
                              value={itemQueries[idx] ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItemQueries(prev => prev.map((q, i) => i === idx ? val : q));
                                setOpenSearchIdx(idx);
                              }}
                              onFocus={() => setOpenSearchIdx(idx)}
                              onBlur={() => setTimeout(() => setOpenSearchIdx(null), 120)}
                              placeholder="Buscar producto…"
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary"
                            />
                            {openSearchIdx === idx && filtered.length > 0 && (
                              <div className="absolute top-full left-0 right-0 z-20 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-lg mt-0.5 max-h-48 overflow-y-auto">
                                {filtered.map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onMouseDown={() => { changeProduct(idx, p.id); setItemQueries(prev => prev.map((_, i) => i === idx ? p.name : _)); setOpenSearchIdx(null); }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-surface flex items-center gap-2 text-sm border-b border-gray-100 dark:border-card-border last:border-0"
                                  >
                                    <div>
                                      <div className="font-medium text-gray-900 dark:text-foreground">{p.name}</div>
                                      {p.barcode && <div className="text-xs text-gray-400 dark:text-muted">{p.barcode}</div>}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <input
                            type="number" min="1" step="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                            className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-right text-gray-900 dark:text-foreground outline-none focus:border-primary"
                            placeholder="Cant"
                          />
                          <span className="text-xs text-gray-400 dark:text-muted w-8 pt-2">{item.unit}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400 dark:text-muted pt-2">S/</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={item.unitCost}
                              onChange={(e) => updateItem(idx, { unitCost: Number(e.target.value) })}
                              className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-right text-gray-900 dark:text-foreground outline-none focus:border-primary"
                              placeholder="Costo"
                            />
                          </div>
                          <span className="text-xs font-bold text-gray-700 dark:text-foreground w-20 text-right pt-2">S/{(item.quantity * item.unitCost).toFixed(2)}</span>
                          <button type="button" onClick={() => removeItem(idx)} className="p-1 text-gray-400 dark:text-muted hover:text-red-500 pt-1.5"><X className="h-4 w-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {items.length > 0 && (
                  <div className="flex justify-end mt-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-foreground">Total: <span className="text-primary">S/{itemsTotal.toFixed(2)}</span></span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
                <button type="submit" disabled={saving || !supplierId || items.length === 0} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60">
                  {saving ? "Guardando…" : "Crear orden de compra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Orders list */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">Cargando…</div>
      ) : filteredOrders.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          {selectedSupplierId ? "No hay órdenes para este proveedor" : "No hay órdenes de compra"}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((o) => (
            <div key={o.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 dark:text-foreground">{o.supplierName}</span>
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-muted mt-0.5">
                    {formatDate(o.createdAt)} · {o.items.length} producto{o.items.length !== 1 ? "s" : ""} · <span className="font-bold text-primary">S/{o.total.toFixed(2)}</span>
                  </p>
                  {o.notes && <p className="text-xs text-gray-500 dark:text-muted mt-0.5 italic">{o.notes}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={o.status}
                    onChange={(e) => updateStatus(o.id, e.target.value as PurchaseStatus)}
                    className="text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border px-2 py-1.5 outline-none focus:border-primary text-gray-700 dark:text-foreground bg-white dark:bg-card"
                  >
                    {(Object.keys(STATUS_LABELS) as PurchaseStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  {o.status === "pendiente" && (
                    <button
                      onClick={() => { if (confirm("¿Confirmar recepción de mercadería? El inventario se actualizará automáticamente.")) receiveOrder(o.id); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs font-bold transition-colors"
                      title="Registrar recepción"
                    >
                      <Truck className="h-3.5 w-3.5" /> Recibir
                    </button>
                  )}
                  <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                    {expanded === o.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <button onClick={() => deleteOrder(o.id)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {expanded === o.id && (
                <div className="border-t border-gray-100 dark:border-card-border px-4 py-3 bg-gray-50 dark:bg-surface">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide mb-2">Detalle de productos</p>
                  <div className="space-y-1.5">
                    {o.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-gray-700 dark:text-foreground flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-gray-400 dark:text-muted" />
                          {item.quantity}× {item.name} <span className="text-gray-400 dark:text-muted">({item.unit})</span>
                        </span>
                        <div className="text-right">
                          <span className="text-gray-400 dark:text-muted text-xs mr-2">S/{item.unitCost.toFixed(2)} c/u</span>
                          <span className="font-semibold text-gray-900 dark:text-foreground">S/{(item.quantity * item.unitCost).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-sm font-bold border-t border-gray-200 dark:border-card-border pt-1.5 mt-1">
                      <span className="text-gray-800 dark:text-foreground">Total</span>
                      <span className="text-primary">S/{o.total.toFixed(2)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-muted mt-2">ID: {o.id}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add item modal */}
      {showAddItemModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={(e) => e.target === e.currentTarget && setShowAddItemModal(false)}
        >
          <div className="bg-white dark:bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Agregar producto
              </h3>
              <button onClick={() => setShowAddItemModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-gray-500 dark:text-muted" />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex border-b px-5 shrink-0">
              <button
                onClick={() => setAddItemMode("search")}
                className={cn("py-2.5 px-3 text-sm font-semibold border-b-2 -mb-px transition-colors", addItemMode === "search" ? "border-primary text-primary" : "border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground")}
              >Buscar existente</button>
              <button
                onClick={() => setAddItemMode("new")}
                className={cn("py-2.5 px-3 text-sm font-semibold border-b-2 -mb-px transition-colors", addItemMode === "new" ? "border-primary text-primary" : "border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground")}
              >Nuevo producto</button>
            </div>

            <div className="overflow-y-auto flex-1 p-5">
              {addItemMode === "search" ? (
                <div className="space-y-3">
                  <input
                    autoFocus
                    value={addItemSearch}
                    onChange={(e) => { setAddItemSearch(e.target.value); setAddItemSel(null); }}
                    placeholder="Buscar por nombre o código de barras…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground focus:border-primary outline-none"
                  />
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {(addItemSearch.length > 0
                      ? products.filter(p => p.name.toLowerCase().includes(addItemSearch.toLowerCase()) || (p.barcode ?? "").includes(addItemSearch))
                      : products
                    ).slice(0, 12).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setAddItemSel(p); setAddItemCost(p.costPrice ?? p.price); setAddItemQty(1); }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                          addItemSel?.id === p.id
                            ? "border-primary bg-primary/5"
                            : "border-gray-100 dark:border-card-border hover:border-gray-300"
                        )}
                      >
                        <div className="font-medium text-gray-900 dark:text-foreground">{p.name}</div>
                        <div className="text-xs text-gray-400 dark:text-muted">{p.unit}{p.barcode ? ` · ${p.barcode}` : ""} · stock: {p.stock ?? 0}</div>
                      </button>
                    ))}
                    {products.length === 0 && <p className="text-sm text-gray-400 dark:text-muted text-center py-6">No hay productos</p>}
                  </div>
                  {addItemSel && (
                    <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-3 border border-gray-200 dark:border-card-border">
                      <p className="text-sm font-semibold text-gray-800 dark:text-foreground">{addItemSel.name}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Cantidad</label>
                          <input
                            type="number" min="1" step="1" value={addItemQty}
                            onChange={(e) => setAddItemQty(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Costo unitario (S/)</label>
                          <input
                            type="number" min="0" step="0.01" value={addItemCost}
                            onChange={(e) => setAddItemCost(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setItems(prev => [...prev, { productId: addItemSel!.id, name: addItemSel!.name, quantity: addItemQty, unitCost: addItemCost, unit: addItemSel!.unit }]);
                          setItemQueries(prev => [...prev, addItemSel!.name]);
                          setShowAddItemModal(false);
                        }}
                        className="w-full py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
                      >
                        Agregar a la orden
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newProdForm.name) return;
                  setSavingNewProd(true);
                  const res = await fetch("/api/products", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...newProdForm, active: true }),
                  });
                  if (res.ok) {
                    const created: DbProduct = await res.json();
                    setProducts(prev => [...prev, created]);
                    setItems(prev => [...prev, { productId: created.id, name: created.name, quantity: newProdForm.stock, unitCost: created.costPrice ?? created.price, unit: created.unit }]);
                    setItemQueries(prev => [...prev, created.name]);
                    setShowAddItemModal(false);
                    setNewProdForm({ name: "", category: "abarrotes", price: 0, costPrice: 0, unit: "und", barcode: "", stock: 1 });
                  }
                  setSavingNewProd(false);
                }} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Nombre *</label>
                      <input
                        required value={newProdForm.name}
                        onChange={(e) => setNewProdForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Nombre del producto"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Categoría</label>
                      <select value={newProdForm.category} onChange={(e) => setNewProdForm(p => ({ ...p, category: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground focus:border-primary outline-none">
                        <option value="abarrotes">Abarrotes</option>
                        <option value="bebidas">Bebidas</option>
                        <option value="lacteos">Lácteos</option>
                        <option value="carnes">Carnes</option>
                        <option value="verduras">Verduras</option>
                        <option value="limpieza">Limpieza</option>
                        <option value="higiene">Higiene</option>
                        <option value="otros">Otros</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Unidad</label>
                      <input value={newProdForm.unit} onChange={(e) => setNewProdForm(p => ({ ...p, unit: e.target.value }))}
                        placeholder="und, kg, L…"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Precio venta (S/)</label>
                      <input type="number" min="0" step="0.01" value={newProdForm.price}
                        onChange={(e) => setNewProdForm(p => ({ ...p, price: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Costo compra (S/)</label>
                      <input type="number" min="0" step="0.01" value={newProdForm.costPrice}
                        onChange={(e) => setNewProdForm(p => ({ ...p, costPrice: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Cantidad inicial</label>
                      <input type="number" min="0" step="1" value={newProdForm.stock}
                        onChange={(e) => setNewProdForm(p => ({ ...p, stock: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Código de barras</label>
                      <input value={newProdForm.barcode} onChange={(e) => setNewProdForm(p => ({ ...p, barcode: e.target.value }))}
                        placeholder="Opcional"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="submit" disabled={savingNewProd || !newProdForm.name}
                    className="w-full py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60"
                  >
                    {savingNewProd ? "Creando…" : "Crear producto y agregar a orden"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Barcode scanner modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowScanner(false)}>
          <div className="bg-white dark:bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Escanear código de barras</h3>
              <button onClick={() => setShowScanner(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"><X className="h-5 w-5 text-gray-500 dark:text-muted" /></button>
            </div>
            <div className="p-4">
              <BarcodeScanner onDetected={handleScan} onClose={() => setShowScanner(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

