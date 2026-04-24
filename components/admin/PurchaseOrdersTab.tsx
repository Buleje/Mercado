"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  Trash2, Plus, ChevronDown, ChevronUp, Package,
  X, FileText, ScanBarcode, History,
  TrendingUp, BarChart3, Download, PackageCheck, Copy, ShoppingBag } from "@buleje/design-system/icons";
import type { DbPurchaseOrder, DbSupplier, DbProduct, PurchaseStatus } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import EmptyState from "@/components/admin/shared/EmptyState";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import OCPDFExport from "./compras/OCPDFExport";
import SupplierPriceComparison, { QuotationComparator } from "./compras/SupplierPriceComparison";

const BarcodeScanner = dynamic(() => import("./BarcodeScanner"), { ssr: false });
const OCRecepcionModal = dynamic(() => import("./compras/OCRecepcionModal"), { ssr: false });

const STATUS_LABELS: Record<PurchaseStatus, string> = {
  pendiente: "Pendiente",
  recibido: "Recibido",
  parcial: "Parcial",
  cancelado: "Cancelado",
  auto_generated: "Auto-generado",
};
const STATUS_COLORS: Record<PurchaseStatus, string> = {
  pendiente: "bg-[var(--data-warning-100)] text-[var(--data-warning)]",
  recibido: "bg-[var(--accent-soft)] text-[var(--data-success)]",
  parcial: "bg-[var(--accent-soft)] text-[var(--data-success)]",
  cancelado: "bg-[var(--data-error-100)] text-[var(--data-error)]",
  auto_generated: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
};

// ── Mejora 13: Progress bar visual de status OC ─────────────────────────────
const STATUS_STEP: Record<string, number> = {
  pendiente: 1,
  parcial: 2,
  cancelado: 1,
  recibido: 4,
};
function OCProgressBar({ status }: { status: string }) {
  const currentStep = STATUS_STEP[status] ?? 1;
  const isCancelled = status === "cancelado";
  const labels = ["Borr.", "Env.", "Conf.", "Rec."];
  return (
    <div className="flex flex-col gap-0.5 w-[160px]" title={STATUS_LABELS[status as PurchaseStatus] ?? status}>
      <div className="flex items-center gap-0">
        {[1, 2, 3, 4].map((step, idx) => {
          const completed = !isCancelled && step <= currentStep;
          return (
            <div key={step} className="flex items-center" style={{ flex: idx < 3 ? 1 : 0 }}>
              <div className={cn(
                "w-3.5 h-3.5 rounded-full shrink-0 transition-colors",
                isCancelled ? "bg-[var(--data-error)]" : completed ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
              )} />
              {idx < 3 && (
                <div className={cn(
                  "h-1 flex-1 transition-colors",
                  isCancelled ? "bg-[var(--data-error)]" : (!isCancelled && step < currentStep) ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
                )} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between px-0">
        {labels.map((label, idx) => (
          <span key={idx} className={cn("text-xs font-medium", !isCancelled && (idx + 1) <= currentStep ? "text-primary dark:text-[var(--data-success)]" : "text-[var(--text-tertiary)]")} style={{ width: idx < 3 ? undefined : "auto" }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

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

  // Reception modal
  const [recepcionOC, setRecepcionOC] = useState<DbPurchaseOrder | null>(null);

  // Mejora 19: Toast for duplicate
  const [duplicateToast, setDuplicateToast] = useState<string | null>(null);

  // Mejora 15: Pedido recurrente a proveedor
  type RecurringOrder = { ocId: string; items: ItemDraft[]; supplierId: string; supplierName: string; intervalDays: number; nextDate: string; notifyDaysBefore: number };
  const [recurringOrders, setRecurringOrders] = useState<RecurringOrder[]>([]);
  const [showRecurringModal, setShowRecurringModal] = useState<DbPurchaseOrder | null>(null);
  const [recurringInterval, setRecurringInterval] = useState(15);
  const [recurringNotifyDays, setRecurringNotifyDays] = useState(2);

  // Load recurring orders from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("recurring-orders");
      if (stored) setRecurringOrders(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const saveRecurring = (updated: RecurringOrder[]) => {
    setRecurringOrders(updated);
    localStorage.setItem("recurring-orders", JSON.stringify(updated));
  };

  const addRecurringOrder = (oc: DbPurchaseOrder) => {
    const sup = suppliers.find(s => s.id === oc.supplierId);
    const nextDate = new Date(Date.now() + recurringInterval * 86400000).toISOString().slice(0, 10);
    const newRecurring: RecurringOrder = {
      ocId: oc.id,
      items: oc.items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost, unit: i.unit })),
      supplierId: oc.supplierId,
      supplierName: sup?.name || oc.supplierName || "",
      intervalDays: recurringInterval,
      nextDate,
      notifyDaysBefore: recurringNotifyDays,
    };
    const updated = [...recurringOrders.filter(r => r.ocId !== oc.id), newRecurring];
    saveRecurring(updated);
    setShowRecurringModal(null);
  };

  const removeRecurring = (ocId: string) => {
    saveRecurring(recurringOrders.filter(r => r.ocId !== ocId));
  };

  // Upcoming recurring orders — Date.now() intencional.
  const upcomingRecurring = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- snapshot del tiempo al renderizar es intencional
    const now = Date.now();
    return recurringOrders
      .map(r => {
        const daysUntil = Math.max(0, Math.ceil((new Date(r.nextDate).getTime() - now) / 86400000));
        return { ...r, daysUntil };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [recurringOrders]);

  // Fecha del próximo pedido recurrente para el modal
  const nextRecurringDateLabel = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- snapshot del tiempo al abrir el modal es intencional
    const baseMs = Date.now();
    return new Date(baseMs + recurringInterval * 86400000).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, [recurringInterval, showRecurringModal]);

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
      if (poRes.ok) { const d = await poRes.json(); setOrders(Array.isArray(d) ? d : d?.purchases ?? []); }
      if (supRes.ok) { const d = await supRes.json(); setSuppliers(Array.isArray(d) ? d : d?.suppliers ?? []); }
      if (prodRes.ok) { const d = await prodRes.json(); setProducts((Array.isArray(d) ? d : []).filter((p: DbProduct) => p.active)); }
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

  const _receiveOrder = async (id: string) => {
    await updateStatus(id, "recibido");
    const po = orders.find(o => o.id === id);
    if (po) {
      const freshProds: DbProduct[] = await fetch("/api/products").then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) ? d : []);
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

  // Mejora 19: Duplicar OC
  const duplicateOrder = async (o: DbPurchaseOrder) => {
    try {
      const sup = suppliers.find(s => s.id === o.supplierId);
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: o.supplierId,
          supplierName: sup?.name || o.supplierName || "",
          items: o.items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost, unit: i.unit })),
          notes: o.notes ? `(Duplicada) ${o.notes}` : "(Duplicada)",
        }),
      });
      if (res.ok) {
        setDuplicateToast("OC duplicada — revisa las cantidades antes de enviar");
        setTimeout(() => setDuplicateToast(null), 4000);
        load();
      }
    } catch { /* ignore */ }
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
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">Órdenes de Compra</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{filteredOrders.length} órdenes · S/{filteredOrders.reduce((s, o) => s + o.total, 0).toFixed(2)} acumulado</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={selectedSupplierId ?? ""}
            onChange={(e) => setSelectedSupplierId(e.target.value || null)}
            className="text-sm font-semibold rounded-lg border border-[var(--rule-base)] dark:border-card-border px-3 py-2 outline-none focus:border-primary text-[var(--text-primary)] dark:text-foreground bg-white dark:bg-card"
          >
            <option value="">Ver todo</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button onClick={() => setShowSupplierHistory(v => !v)} className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)] dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 dark:hover:bg-accent/80 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors">
            <History className="h-4 w-4" /> Historial
          </button>
          <button
            onClick={() => {
              if (orders.length === 0) return;
              const rows = orders.map(o => ({
                ID: o.id,
                Proveedor: suppliers.find(s => s.id === o.supplierId)?.name ?? o.supplierId,
                Estado: STATUS_LABELS[o.status as PurchaseStatus] ?? o.status,
                "Total (S/)": o.total,
                Fecha: new Date(o.createdAt).toLocaleDateString("es-PE"),
                Notas: o.notes ?? "",
              }));
              exportToExcel(rows, `compras-${new Date().toISOString().slice(0, 10)}`, "Compras");
            }}
            className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-success)] dark:text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors"
            title="Exportar compras a Excel"
          >
            <Download className="h-4 w-4" /> Excel
          </button>
          {/* Mejora 16: Comparar cotizaciones completas */}
          <QuotationComparator orders={orders} suppliers={suppliers} />
          <button onClick={() => setShowCreate(v => !v)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dark px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors ">
            <Plus className="h-4 w-4" /> Nueva orden
          </button>
        </div>
      </div>

      {/* Mejora 15 (R3): Resumen compras del mes */}
      {!loading && orders.length > 0 && (() => {
        const mesActual = new Date().toISOString().slice(0, 7);
        const ocsMes = orders.filter(o => o.createdAt.startsWith(mesActual));
        const totalMes = ocsMes.reduce((s, o) => s + o.total, 0);
        const provMes = new Set(ocsMes.map(o => o.supplierId)).size;
        return (
          <div className="flex items-center justify-between bg-[var(--surface-sunken)]/50 rounded-xl px-4 py-2.5 text-xs">
            <span>Este mes: <strong>{ocsMes.length} OCs</strong></span>
            <span>Total: <strong>S/{totalMes.toFixed(2)}</strong></span>
            <span>{provMes} proveedor{provMes !== 1 ? "es" : ""}</span>
          </div>
        );
      })()}

      {/* Mejora 15: Badge y cards de pedidos recurrentes */}
      {upcomingRecurring.length > 0 && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> {upcomingRecurring.length} pedido{upcomingRecurring.length > 1 ? "s" : ""} recurrente{upcomingRecurring.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {upcomingRecurring.map(r => (
              <div key={r.ocId} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground truncate">OC a {r.supplierName}</p>
                  <button onClick={() => removeRecurring(r.ocId)} className="text-[var(--text-tertiary)] hover:text-[var(--data-error)] transition-colors" title="Eliminar recurrencia">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                  {r.daysUntil === 0 ? "Hoy" : r.daysUntil === 1 ? "Manana" : `En ${r.daysUntil} dias`} · Cada {r.intervalDays}d
                </p>
                <button
                  onClick={() => {
                    const oc = orders.find(o => o.id === r.ocId);
                    if (oc) duplicateOrder(oc);
                  }}
                  className="mt-2 w-full text-xs font-bold text-center py-1.5 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  Crear OC ahora
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mejora 15: Modal de configuración recurrente */}
      {showRecurringModal && (
        <div className="modal-backdrop p-4" onClick={() => setShowRecurringModal(null)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">Hacer recurrente</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
              OC para {suppliers.find(s => s.id === showRecurringModal.supplierId)?.name} · {showRecurringModal.items.length} productos
            </p>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1.5 block">Repetir cada</label>
              <div className="flex gap-2">
                {[7, 15, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setRecurringInterval(d)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-sm font-bold transition-colors",
                      recurringInterval === d ? "bg-[var(--accent)] text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)]"
                    )}
                  >
                    {d} dias
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1 block">Próximo pedido</label>
              <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground">
                {nextRecurringDateLabel}
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1 block">Notificarme</label>
              <select
                value={recurringNotifyDays}
                onChange={e => setRecurringNotifyDays(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--rule-base)] dark:border-card-border px-3 py-2 text-sm bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground"
              >
                <option value={1}>1 dia antes</option>
                <option value={2}>2 dias antes</option>
                <option value={3}>3 dias antes</option>
                <option value={5}>5 dias antes</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowRecurringModal(null)} className="flex-1 py-2.5 rounded-lg bg-gray-100 dark:bg-surface text-sm font-bold text-[var(--text-secondary)]">
                Cancelar
              </button>
              <button onClick={() => addRecurringOrder(showRecurringModal)} className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent)] transition-colors">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier History Cards */}
      {showSupplierHistory && (
        <div className="space-y-3">
          {suppliers.filter(s => orders.some(o => o.supplierId === s.id)).map(supplier => {
            const stats = getSupplierStats(supplier.id);
            const isExpanded = expandedHistorySupplier === supplier.id;
            const maxMonthAmount = Math.max(...stats.monthlyData.map(m => m.amount), 1);
            
            return (
              <div key={supplier.id} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
                        <History className="h-5 w-5 text-primary" />
                        {supplier.name}
                      </CardTitle>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">
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
                    <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-3 border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30">
                      <p className="text-xs font-bold text-[var(--data-success)] dark:text-[var(--data-success)] uppercase mb-1">Órdenes</p>
                      <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">{stats.count}</p>
                    </div>
                    <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-3 border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30">
                      <p className="text-xs font-bold text-[var(--data-success)] dark:text-[var(--data-success)] uppercase mb-1">Total gastado</p>
                      <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">S/{stats.totalAmount.toFixed(2)}</p>
                    </div>
                    <div className="bg-[var(--surface-sunken)] rounded-xl p-3 border border-[var(--rule-base)]">
                      <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase mb-1">Promedio</p>
                      <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">S/{stats.avgAmount.toFixed(2)}</p>
                    </div>
                    <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 rounded-xl p-3 border border-[var(--data-warning)] dark:border-[var(--data-warning)]/30">
                      <p className="text-xs font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)] uppercase mb-1">Última compra</p>
                      <p className="text-xs font-extrabold text-[var(--text-primary)] dark:text-foreground">{stats.lastPurchase ? formatDate(stats.lastPurchase) : "—"}</p>
                    </div>
                  </div>

                  {/* Top Products */}
                  {stats.topProducts.length > 0 && (
                    <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 mb-3 border border-[var(--rule-base)] dark:border-card-border">
                      <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase mb-2 flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Top 3 productos más comprados
                      </p>
                      <div className="space-y-1.5">
                        {stats.topProducts.map((prod, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-[var(--text-primary)] dark:text-foreground flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">#{idx + 1}</span>
                              {prod.name}
                              <span className="text-[var(--text-tertiary)] dark:text-muted text-xs">({prod.count} und)</span>
                            </span>
                            <span className="font-semibold text-primary">S/{prod.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Monthly Chart */}
                  <div className="bg-[var(--surface-sunken)] rounded-xl p-3 border border-[var(--rule-base)]">
                    <p className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground uppercase mb-2 flex items-center gap-1">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                      Gastos mensuales (últimos 6 meses)
                    </p>
                    <div className="flex flex-wrap items-end gap-2 h-20">
                      {stats.monthlyData.map((m, idx) => {
                        const height = maxMonthAmount > 0 ? (m.amount / maxMonthAmount) * 100 : 0;
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full flex items-end justify-center" style={{ height: "64px" }}>
                              <div
                                className="w-full bg-[var(--text-primary)] rounded-t transition-all hover:opacity-80"
                                style={{ height: `${height}%` }}
                                title={`${m.month}: S/${m.amount.toFixed(2)}`}
                              ></div>
                            </div>
                            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">{m.month}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Expanded Timeline */}
                {isExpanded && (
                  <div className="border-t border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface p-4">
                    <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase mb-3">Cronología completa de compras</p>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {orders.filter(o => o.supplierId === supplier.id).map(order => (
                        <div key={order.id} className="bg-white dark:bg-card rounded-xl p-3 border border-[var(--rule-base)] dark:border-card-border">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{formatDate(order.createdAt)}</span>
                            <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[order.status])}>
                              {STATUS_LABELS[order.status]}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--text-secondary)] dark:text-muted">
                            {order.items.length} producto{order.items.length !== 1 ? "s" : ""} · <span className="font-bold text-primary">S/{order.total.toFixed(2)}</span>
                          </div>
                          {order.notes && <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1 italic">{order.notes}</p>}
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
          <div className="bg-white dark:bg-card w-full sm:max-w-2xl sm:rounded-xl rounded-t-2xl overflow-y-auto max-h-[90dvh]">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-card z-10">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Nueva orden de compra
              </CardTitle>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
              </button>
            </div>
            <form onSubmit={createOrder} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Proveedor *</label>
                  <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm">
                    <option value="">Seleccionar proveedor</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.ruc ? ` (${s.ruc})` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Notas</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas opcionales…" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">Productos de la orden</label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setShowScanner(true)} className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted hover:text-primary flex items-center gap-1 border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2.5 py-1 transition-colors">
                      <ScanBarcode className="h-3.5 w-3.5" /> Escanear
                    </button>
                    <button type="button" onClick={() => { setAddItemMode("search"); setAddItemSearch(""); setAddItemSel(null); setShowAddItemModal(true); }} className="text-xs font-bold text-primary hover:text-primary-dark flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> Agregar
                    </button>
                  </div>
                </div>
                {items.length === 0 && (
                  <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-4">Agrega productos a la orden</p>
                )}
                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const q = itemQueries[idx] ?? "";
                    const filtered = q.length > 0
                      ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || (p.barcode ?? "").includes(q)).slice(0, 6)
                      : [];
                    return (
                      <div key={idx} className="bg-gray-50 dark:bg-surface rounded-xl p-2 space-y-1">
                        <div className="flex flex-wrap items-start gap-2">
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
                              className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary"
                            />
                            {openSearchIdx === idx && filtered.length > 0 && (
                              <div className="absolute top-full left-0 right-0 z-20 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl mt-0.5 max-h-48 overflow-y-auto">
                                {filtered.map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onMouseDown={() => { changeProduct(idx, p.id); setItemQueries(prev => prev.map((_, i) => i === idx ? p.name : _)); setOpenSearchIdx(null); }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-surface flex flex-wrap items-center gap-2 text-sm border-b border-[var(--rule-soft)] dark:border-card-border last:border-0"
                                  >
                                    <div>
                                      <div className="font-medium text-[var(--text-primary)] dark:text-foreground">{p.name}</div>
                                      {p.barcode && <div className="text-xs text-[var(--text-tertiary)] dark:text-muted">{p.barcode}</div>}
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
                            className="w-16 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-right text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary"
                            placeholder="Cant"
                          />
                          <span className="text-xs text-[var(--text-tertiary)] dark:text-muted w-8 pt-2">{item.unit}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-[var(--text-tertiary)] dark:text-muted pt-2">S/</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={item.unitCost}
                              onChange={(e) => updateItem(idx, { unitCost: Number(e.target.value) })}
                              className="w-20 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-right text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary"
                              placeholder="Costo"
                            />
                          </div>
                          <span className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground w-20 text-right pt-2">S/{(item.quantity * item.unitCost).toFixed(2)}</span>
                          <button type="button" onClick={() => removeItem(idx)} className="p-1 text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error)] pt-1.5"><X className="h-4 w-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {items.length > 0 && (
                  <div className="flex justify-end mt-2">
                    <span className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">Total: <span className="text-primary">S/{itemsTotal.toFixed(2)}</span></span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
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
        <TableSkeleton rows={4} cols={5} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl" />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={selectedSupplierId ? "Sin órdenes para este proveedor" : "Sin órdenes de compra"}
          description={selectedSupplierId ? "Este proveedor no tiene órdenes registradas." : "Crea órdenes de compra a tus proveedores."}
          className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl"
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((o) => (
            <div key={o.id} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl  overflow-hidden">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{o.supplierName}</span>
                    {/* Mejora 13: Progress bar visual */}
                    <OCProgressBar status={o.status} />
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">
                    {formatDate(o.createdAt)} · {o.items.length} producto{o.items.length !== 1 ? "s" : ""} · <span className="font-bold text-primary">S/{o.total.toFixed(2)}</span>
                  </p>
                  {o.notes && <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5 italic">{o.notes}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <select
                    value={o.status}
                    onChange={(e) => updateStatus(o.id, e.target.value as PurchaseStatus)}
                    className="text-xs font-semibold rounded-lg border border-[var(--rule-base)] dark:border-card-border px-2 py-1.5 outline-none focus:border-primary text-[var(--text-primary)] dark:text-foreground bg-white dark:bg-card"
                  >
                    {(Object.keys(STATUS_LABELS) as PurchaseStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  {(o.status === "pendiente" || o.status === "parcial") && (
                    <button
                      onClick={() => setRecepcionOC(o)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] text-xs font-bold transition-colors"
                      title="Registrar recepcion"
                    >
                      <PackageCheck className="h-3.5 w-3.5" /> Recibir
                    </button>
                  )}
                  <OCPDFExport
                    oc={o}
                    supplier={suppliers.find(s => s.id === o.supplierId)}
                  />
                  {/* Mejora 19: Duplicar OC */}
                  <button
                    onClick={() => duplicateOrder(o)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] text-xs font-bold transition-colors"
                    title="Duplicar orden"
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </button>
                  {/* Mejora 15: Hacer recurrente */}
                  {(o.status === "recibido" || o.status === "parcial") && (
                    <button
                      onClick={() => { setShowRecurringModal(o); setRecurringInterval(15); setRecurringNotifyDays(2); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--accent)]/30 text-xs font-bold transition-colors"
                      title="Hacer pedido recurrente"
                    >
                      <History className="h-3.5 w-3.5" /> Recurrente
                    </button>
                  )}
                  <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                    {expanded === o.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <button onClick={() => deleteOrder(o.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] transition-colors" title="Eliminar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {expanded === o.id && (
                <div className="border-t border-[var(--rule-soft)] dark:border-card-border px-2 sm:px-4 py-2 sm:py-3 bg-gray-50 dark:bg-surface">
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Detalle de productos</p>
                  <div className="space-y-1.5">
                    {o.items.map((item, i) => {
                      // Mejora 20: Buscar último precio del mismo producto + mismo proveedor
                      const prevOC = orders.find(po =>
                        po.id !== o.id &&
                        po.supplierId === o.supplierId &&
                        new Date(po.createdAt) < new Date(o.createdAt) &&
                        po.items.some(pi => pi.productId === item.productId)
                      );
                      const prevItem = prevOC?.items.find(pi => pi.productId === item.productId);
                      const prevPrice = prevItem?.unitCost;
                      const diff = prevPrice != null ? item.unitCost - prevPrice : null;
                      const prevDateRelative = prevOC ? (() => {
                        const days = Math.floor((Date.now() - new Date(prevOC.createdAt).getTime()) / 86400000);
                        if (days === 0) return "hoy";
                        if (days < 30) return `hace ${days}d`;
                        return `hace ${Math.floor(days / 30)}m`;
                      })() : null;

                      return (
                        <div key={i}>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-[var(--text-primary)] dark:text-foreground flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-[var(--text-tertiary)] dark:text-muted" />
                              {item.quantity}x {item.name} <span className="text-[var(--text-tertiary)] dark:text-muted">({item.unit})</span>
                            </span>
                            <div className="text-right">
                              <span className="text-[var(--text-tertiary)] dark:text-muted text-xs mr-2">S/{item.unitCost.toFixed(2)} c/u</span>
                              <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">S/{(item.quantity * item.unitCost).toFixed(2)}</span>
                            </div>
                          </div>
                          {/* Mejora 20: Referencia de precio anterior */}
                          {prevPrice != null && (
                            <p className="text-xs text-[var(--text-tertiary)] pl-5 mt-0.5">
                              Última vez: S/{prevPrice.toFixed(2)} ({prevDateRelative})
                              {diff != null && diff > 0 && <span className="text-[var(--data-error)] ml-1">↑ S/{diff.toFixed(2)} mas caro</span>}
                              {diff != null && diff < 0 && <span className="text-[var(--data-success)] ml-1">↓ S/{Math.abs(diff).toFixed(2)} mas barato</span>}
                              {diff != null && diff === 0 && <span className="text-[var(--text-tertiary)] ml-1">= Mismo precio</span>}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center text-sm font-bold border-t border-[var(--rule-base)] dark:border-card-border pt-1.5 mt-1">
                      <span className="text-[var(--text-primary)] dark:text-foreground">Total</span>
                      <span className="text-primary">S/{o.total.toFixed(2)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-2">ID: {o.id}</p>

                  {/* Mejora 14: Ahorro vs compra anterior del proveedor */}
                  {(() => {
                    const prevOCs = orders
                      .filter(po => po.id !== o.id && po.supplierId === o.supplierId && new Date(po.createdAt) < new Date(o.createdAt) && po.status !== "cancelado")
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    const prevOC = prevOCs[0];
                    if (!prevOC) return <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1 italic">Primera compra a este proveedor</p>;
                    const diff = o.total - prevOC.total;
                    return (
                      <div className={cn("mt-2 inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg",
                        diff < 0
                          ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]"
                          : diff > 0
                          ? "bg-[var(--data-warning-50)] dark:bg-orange-950/20 text-[var(--data-warning)] dark:text-[var(--data-warning)]"
                          : "bg-gray-50 dark:bg-surface text-[var(--text-secondary)]"
                      )}>
                        {diff < 0 ? `Ahorraste S/${Math.abs(diff).toFixed(2)} vs última compra` :
                         diff > 0 ? `Pagaste S/${diff.toFixed(2)} mas vs última compra` :
                         "Mismo total que la compra anterior"}
                      </div>
                    );
                  })()}

                  {/* Price comparison for each product */}
                  {o.items.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {o.items.map((item) => (
                        <SupplierPriceComparison
                          key={item.productId}
                          productId={item.productId}
                          productName={item.name}
                        />
                      ))}
                    </div>
                  )}
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
          <div className="bg-white dark:bg-card w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl max-h-[85dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Agregar producto
              </CardTitle>
              <button onClick={() => setShowAddItemModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex border-b px-5 shrink-0">
              <button
                onClick={() => setAddItemMode("search")}
                className={cn("py-2.5 px-3 text-sm font-semibold border-b-2 -mb-px transition-colors", addItemMode === "search" ? "border-primary text-primary" : "border-transparent text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-foreground")}
              >Buscar existente</button>
              <button
                onClick={() => setAddItemMode("new")}
                className={cn("py-2.5 px-3 text-sm font-semibold border-b-2 -mb-px transition-colors", addItemMode === "new" ? "border-primary text-primary" : "border-transparent text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-foreground")}
              >Nuevo producto</button>
            </div>

            <div className="overflow-y-auto flex-1 p-3 sm:p-5">
              {addItemMode === "search" ? (
                <div className="space-y-3">
                  <input
                    autoFocus
                    value={addItemSearch}
                    onChange={(e) => { setAddItemSearch(e.target.value); setAddItemSel(null); }}
                    placeholder="Buscar por nombre o código de barras…"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none"
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
                            : "border-[var(--rule-soft)] dark:border-card-border hover:border-gray-300"
                        )}
                      >
                        <div className="font-medium text-[var(--text-primary)] dark:text-foreground">{p.name}</div>
                        <div className="text-xs text-[var(--text-tertiary)] dark:text-muted">{p.unit}{p.barcode ? ` · ${p.barcode}` : ""} · stock: {p.stock ?? 0}</div>
                      </button>
                    ))}
                    {products.length === 0 && <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-6">No hay productos</p>}
                  </div>
                  {addItemSel && (
                    <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-3 border border-[var(--rule-base)] dark:border-card-border">
                      <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground">{addItemSel.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Cantidad</label>
                          <input
                            type="number" min="1" step="1" value={addItemQty}
                            onChange={(e) => setAddItemQty(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Costo unitario (S/)</label>
                          <input
                            type="number" min="0" step="0.01" value={addItemCost}
                            onChange={(e) => setAddItemCost(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary"
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
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Nombre *</label>
                      <input
                        required value={newProdForm.name}
                        onChange={(e) => setNewProdForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Nombre del producto"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Categoría</label>
                      <select value={newProdForm.category} onChange={(e) => setNewProdForm(p => ({ ...p, category: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none">
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
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Unidad</label>
                      <input value={newProdForm.unit} onChange={(e) => setNewProdForm(p => ({ ...p, unit: e.target.value }))}
                        placeholder="und, kg, L…"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Precio venta (S/)</label>
                      <input type="number" min="0" step="0.01" value={newProdForm.price}
                        onChange={(e) => setNewProdForm(p => ({ ...p, price: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Costo compra (S/)</label>
                      <input type="number" min="0" step="0.01" value={newProdForm.costPrice}
                        onChange={(e) => setNewProdForm(p => ({ ...p, costPrice: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Cantidad inicial</label>
                      <input type="number" min="0" step="1" value={newProdForm.stock}
                        onChange={(e) => setNewProdForm(p => ({ ...p, stock: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Código de barras</label>
                      <input value={newProdForm.barcode} onChange={(e) => setNewProdForm(p => ({ ...p, barcode: e.target.value }))}
                        placeholder="Opcional"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none"
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

      {/* Reception modal */}
      {recepcionOC && (
        <OCRecepcionModal
          ocId={recepcionOC.id}
          items={recepcionOC.items}
          onComplete={() => {
            setRecepcionOC(null);
            load();
          }}
          onClose={() => setRecepcionOC(null)}
        />
      )}

      {/* Mejora 19: Toast de duplicacion */}
      {duplicateToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-card border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl p-4 max-w-xs animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
              <Copy className="h-4 w-4 text-[var(--data-success)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground">{duplicateToast}</p>
          </div>
        </div>
      )}

      {/* Barcode scanner modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowScanner(false)}>
          <div className="bg-white dark:bg-card w-full sm:max-w-md sm:rounded-xl rounded-t-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Escanear código de barras</CardTitle>
              <button onClick={() => setShowScanner(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"><X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" /></button>
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

