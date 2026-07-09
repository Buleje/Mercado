"use client";

import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback, useMemo, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  Trash2, Plus, ChevronDown, ChevronUp, Package,
  X, FileText, ScanBarcode, History,
  TrendingUp, BarChart3, Download, PackageCheck, Copy, ShoppingBag,
  Search, Calendar, Building2, Loader2, Repeat, Hash, StickyNote, Check, Truck } from "@buleje/design-system/icons";
import type { DbPurchaseOrder, DbSupplier, DbProduct, PurchaseStatus } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { Field } from "@/components/admin/shared/Field";
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
  pendiente: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)] border-[var(--data-warning-500)]/30",
  recibido: "bg-[var(--accent-soft)] dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-500)] border-[var(--data-success-500)]/30",
  parcial: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)] border-[var(--data-warning-500)]/30",
  cancelado: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-500)] border-[var(--data-error-500)]/30",
  auto_generated: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-base)]",
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
                isCancelled ? "bg-[var(--data-error-500)]" : completed ? "bg-primary" : "bg-[var(--rule-base)] dark:bg-gray-600"
              )} />
              {idx < 3 && (
                <div className={cn(
                  "h-1 flex-1 transition-colors",
                  isCancelled ? "bg-[var(--data-error-500)]" : (!isCancelled && step < currentStep) ? "bg-primary" : "bg-[var(--rule-base)] dark:bg-gray-600"
                )} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between px-0">
        {labels.map((label, idx) => (
          <span key={idx} className={cn("text-xs font-medium", !isCancelled && (idx + 1) <= currentStep ? "text-primary dark:text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]")} style={{ width: idx < 3 ? undefined : "auto" }}>
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

// ── KPI Card (audit 2026-05-17): card compacta con ícono tinted box ──
type KPIAccent = "danger" | "warning" | "success" | "neutral";
function KPICardOC({
  label,
  value,
  sub,
  icon: Icon,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof FileText;
  accent?: KPIAccent;
}) {
  const cfg = {
    danger:  { text: "text-[var(--data-error-500)]",   iconBg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/15",     border: "border-[var(--data-error-500)]/30" },
    warning: { text: "text-[var(--data-warning-500)]", iconBg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15", border: "border-[var(--data-warning-500)]/30" },
    success: { text: "text-[var(--data-success-500)]", iconBg: "bg-emerald-100 dark:bg-[var(--data-success-500)]/15",               border: "border-[var(--data-success-500)]/30" },
    neutral: { text: "text-[var(--text-primary)]",     iconBg: "bg-[var(--surface-sunken)]",                                        border: "border-[var(--rule-base)]" },
  }[accent];
  return (
    <div className={cn(
      "bg-white dark:bg-[var(--color-card)] border-2 rounded-2xl p-4 flex items-center gap-3 min-w-0 transition-shadow hover:shadow-sm",
      cfg.border,
    )}>
      <span className={cn("inline-flex items-center justify-center h-11 w-11 rounded-xl shrink-0", cfg.iconBg)}>
        <Icon className={cn("h-5 w-5", cfg.text)} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] truncate">{label}</p>
        <p className={cn("text-2xl font-extrabold tabular-nums leading-none mt-1 truncate", cfg.text)}>{value}</p>
        {sub && <p className="text-xs text-[var(--text-secondary)] mt-1 truncate font-medium">{sub}</p>}
      </div>
    </div>
  );
}

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

  // Status filter pills
  const [statusFilter, setStatusFilter] = useState<"todas" | "pendiente" | "parcial" | "recibido" | "cancelado">("todas");

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

   
  useEffect(() => { void load(); }, [load]);

  // "Crear OC" desde el Comparador de proveedores deja el proveedor en un stash;
  // al montar (con proveedores ya cargados) abrimos el form de Nueva Orden
  // preseleccionado y limpiamos el stash. Reemplaza el POST roto del comparador.
  useEffect(() => {
    if (suppliers.length === 0) return;
    let stash: { id: string; name: string } | null = null;
    try {
      const raw = localStorage.getItem("bsm-new-oc-supplier");
      if (raw) stash = JSON.parse(raw) as { id: string; name: string };
    } catch { /* ignore */ }
    if (!stash) return;
    try { localStorage.removeItem("bsm-new-oc-supplier"); } catch { /* ignore */ }
    if (suppliers.some(s => s.id === stash!.id)) {
      setSupplierId(stash.id);
      setShowCreate(true);
    }
  }, [suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

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
      headers: csrfHeaders({ "Content-Type": "application/json" }),
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
      headers: csrfHeaders({ "Content-Type": "application/json" }),
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
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ stock: (prod.stock ?? 0) + item.quantity, costPrice: item.unitCost }),
          });
        } else {
          await fetch("/api/products", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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

  // Filter orders by supplier + status
  const filteredOrders = orders.filter((o) => {
    if (selectedSupplierId && o.supplierId !== selectedSupplierId) return false;
    if (statusFilter !== "todas") {
      if (statusFilter === "pendiente"  && o.status !== "pendiente") return false;
      if (statusFilter === "parcial"    && o.status !== "parcial") return false;
      if (statusFilter === "recibido"   && o.status !== "recibido") return false;
      if (statusFilter === "cancelado"  && o.status !== "cancelado") return false;
    }
    return true;
  });

  // KPIs por estado (sobre todas las órdenes, no filtradas — para que el chip mantenga el counter)
  const kpis = useMemo(() => {
    const counts = { pendiente: 0, parcial: 0, recibido: 0, cancelado: 0, auto_generated: 0 };
    let totalAcumulado = 0;
    let totalMes = 0;
    const mesActual = new Date().toISOString().slice(0, 7);
    for (const o of orders) {
      if (counts[o.status as keyof typeof counts] != null) counts[o.status as keyof typeof counts] += 1;
      totalAcumulado += o.total;
      if (o.createdAt.startsWith(mesActual)) totalMes += o.total;
    }
    return { counts, totalAcumulado, totalMes, total: orders.length };
  }, [orders]);

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
    <div className="space-y-4 sm:space-y-5">
      {/* ─── Hero header ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-white to-[var(--accent-soft)]/40 dark:from-[var(--color-card)] dark:to-[var(--accent-muted)]/20 px-5 py-4 flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 border border-primary/30 shrink-0">
          <FileText className="h-6 w-6 text-primary" strokeWidth={2.2} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">Órdenes de Compra</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {orders.length === 0
              ? "Creá la primera orden a un proveedor. Después podés duplicarla o hacerla recurrente."
              : `${orders.length} ${orders.length === 1 ? "orden registrada" : "órdenes registradas"} · Total acumulado S/${kpis.totalAcumulado.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(v => !v)}
          className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-sm font-extrabold hover:bg-primary-dark transition-colors shadow-sm hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          Nueva orden
        </button>
      </section>

      {/* ─── Toolbar: filtro proveedor + acciones ────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
          <select
            value={selectedSupplierId ?? ""}
            onChange={(e) => setSelectedSupplierId(e.target.value || null)}
            className="w-full h-11 pl-10 pr-3 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-primary appearance-none cursor-pointer"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.ruc ? ` (${s.ruc})` : ""}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowSupplierHistory(v => !v)}
          className={cn(
            "inline-flex items-center gap-2 h-11 px-4 rounded-2xl border-2 text-sm font-bold transition-colors",
            showSupplierHistory
              ? "border-primary bg-primary/10 text-primary"
              : "border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]",
          )}
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">Historial</span>
        </button>
        <button
          type="button"
          disabled={orders.length === 0}
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
          className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-bold text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--data-success-500)]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Exportar compras a Excel"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Excel</span>
        </button>
        {/* Mejora 16: Comparar cotizaciones completas */}
        <QuotationComparator orders={orders} suppliers={suppliers} />
      </div>

      {/* ─── KPI summary 4 cards ─────────────────────────────────────── */}
      {!loading && orders.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICardOC
            label="Total"
            value={kpis.total}
            sub="órdenes registradas"
            icon={FileText}
            accent="neutral"
          />
          <KPICardOC
            label="Pendientes"
            value={kpis.counts.pendiente}
            sub={`${kpis.counts.parcial} parcial${kpis.counts.parcial === 1 ? "" : "es"}`}
            icon={Package}
            accent="warning"
          />
          <KPICardOC
            label="Recibidas"
            value={kpis.counts.recibido}
            sub="cerradas con éxito"
            icon={PackageCheck}
            accent="success"
          />
          <KPICardOC
            label="Total este mes"
            value={`S/${kpis.totalMes.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`}
            sub={`acum. S/${kpis.totalAcumulado.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`}
            icon={TrendingUp}
            accent="neutral"
          />
        </div>
      )}

      {/* ─── Filter pills por estado ─────────────────────────────────── */}
      {!loading && orders.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { id: "todas",      label: "Todas",      count: kpis.total,             tone: "neutral" as const },
            { id: "pendiente",  label: "Pendientes", count: kpis.counts.pendiente,  tone: "warning" as const },
            { id: "parcial",    label: "Parciales",  count: kpis.counts.parcial,    tone: "warning" as const },
            { id: "recibido",   label: "Recibidas",  count: kpis.counts.recibido,   tone: "success" as const },
            { id: "cancelado",  label: "Canceladas", count: kpis.counts.cancelado,  tone: "danger"  as const },
          ]).map((p) => {
            const active = statusFilter === p.id;
            const toneCls = {
              neutral: "bg-[var(--text-primary)] text-white border-[var(--text-primary)]",
              danger:  "bg-[var(--data-error-500)] text-white border-[var(--data-error-500)]",
              warning: "bg-[var(--data-warning-500)] text-white border-[var(--data-warning-500)]",
              success: "bg-[var(--data-success-500)] text-white border-[var(--data-success-500)]",
            }[p.tone];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setStatusFilter(p.id as typeof statusFilter)}
                className={cn(
                  "inline-flex items-center gap-2 h-11 px-4 rounded-2xl text-sm font-bold transition-colors border-2",
                  active
                    ? toneCls
                    : "bg-white dark:bg-[var(--color-card)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]",
                )}
              >
                {p.label}
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums min-w-[24px] text-center",
                  active ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                )}>
                  {p.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ─── Mejora 15: cards de pedidos recurrentes ─────────────────── */}
      {upcomingRecurring.length > 0 && (
        <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10 shrink-0">
              <Repeat className="h-4 w-4 text-primary" strokeWidth={2.2} />
            </span>
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              {upcomingRecurring.length} pedido{upcomingRecurring.length > 1 ? "s" : ""} recurrente{upcomingRecurring.length > 1 ? "s" : ""} programado{upcomingRecurring.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingRecurring.map(r => {
              const dueToday = r.daysUntil === 0;
              const dueSoon = r.daysUntil <= 3;
              return (
                <div
                  key={r.ocId}
                  className={cn(
                    "rounded-2xl border-2 p-4 bg-white dark:bg-[var(--color-card)] transition-all",
                    dueToday ? "border-[var(--data-error-500)]/50 ring-2 ring-[var(--data-error-500)]/20" : dueSoon ? "border-[var(--data-warning-500)]/40" : "border-[var(--rule-base)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">OC a</p>
                      <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">{r.supplierName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRecurring(r.ocId)}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)] transition-colors"
                      title="Eliminar recurrencia"
                      aria-label="Eliminar pedido recurrente"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-bold border",
                      dueToday
                        ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-500)] border-[var(--data-error-500)]/30"
                        : dueSoon
                        ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)] border-[var(--data-warning-500)]/30"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-base)]",
                    )}>
                      <Calendar className="h-3.5 w-3.5" />
                      {dueToday ? "Hoy" : r.daysUntil === 1 ? "Mañana" : `En ${r.daysUntil} días`}
                    </span>
                    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                      <Repeat className="h-3 w-3" />
                      Cada {r.intervalDays}d
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const oc = orders.find(o => o.id === r.ocId);
                      if (oc) duplicateOrder(oc);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Crear OC ahora
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Mejora 15: Modal de configuración recurrente */}
      {showRecurringModal && (
        <div className="modal-backdrop p-4" onClick={() => setShowRecurringModal(null)}>
          <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Hacer recurrente</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
              OC para {suppliers.find(s => s.id === showRecurringModal.supplierId)?.name} · {showRecurringModal.items.length} productos
            </p>
            <div>
              <span className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1.5 block">Repetir cada</span>
              <div className="flex gap-2">
                {[7, 15, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setRecurringInterval(d)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-sm font-bold transition-colors",
                      recurringInterval === d ? "bg-[var(--accent-600,var(--accent))] text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)]"
                    )}
                  >
                    {d} dias
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1 block">Próximo pedido</span>
              <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {nextRecurringDateLabel}
              </p>
            </div>
            <Field label="Notificarme" labelClassName="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1 block">
              <select
                value={recurringNotifyDays}
                onChange={e => setRecurringNotifyDays(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-3 py-2 text-sm bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]"
              >
                <option value={1}>1 dia antes</option>
                <option value={2}>2 dias antes</option>
                <option value={3}>3 dias antes</option>
                <option value={5}>5 dias antes</option>
              </select>
            </Field>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowRecurringModal(null)} className="flex-1 py-2.5 rounded-lg bg-[var(--surface-sunken)] dark:bg-surface text-sm font-bold text-[var(--text-secondary)]">
                Cancelar
              </button>
              <button onClick={() => addRecurringOrder(showRecurringModal)} className="flex-1 py-2.5 rounded-lg bg-[var(--accent-600,var(--accent))] text-white text-sm font-bold hover:bg-[var(--accent)] transition-colors">
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
              <div key={supplier.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
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
                    <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-3 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                      <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] uppercase mb-1">Órdenes</p>
                      <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{stats.count}</p>
                    </div>
                    <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-3 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                      <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] uppercase mb-1">Total gastado</p>
                      <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{Number(stats.totalAmount).toFixed(2)}</p>
                    </div>
                    <div className="bg-[var(--surface-sunken)] rounded-xl p-3 border border-[var(--rule-base)]">
                      <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase mb-1">Promedio</p>
                      <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{Number(stats.avgAmount).toFixed(2)}</p>
                    </div>
                    <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 rounded-xl p-3 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30">
                      <p className="text-xs font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] uppercase mb-1">Última compra</p>
                      <p className="text-xs font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{stats.lastPurchase ? formatDate(stats.lastPurchase) : "—"}</p>
                    </div>
                  </div>

                  {/* Top Products */}
                  {stats.topProducts.length > 0 && (
                    <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 mb-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                      <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase mb-2 flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Top 3 productos más comprados
                      </p>
                      <div className="space-y-1.5">
                        {stats.topProducts.map((prod, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">#{idx + 1}</span>
                              {prod.name}
                              <span className="text-[var(--text-tertiary)] dark:text-muted text-xs">({prod.count} und)</span>
                            </span>
                            <span className="font-semibold text-primary">S/{Number(prod.total).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Monthly Chart */}
                  <div className="bg-[var(--surface-sunken)] rounded-xl p-3 border border-[var(--rule-base)]">
                    <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] uppercase mb-2 flex items-center gap-1">
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
                                title={`${m.month}: S/${Number(m.amount).toFixed(2)}`}
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
                  <div className="border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-surface p-4">
                    <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase mb-3">Cronología completa de compras</p>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {orders.filter(o => o.supplierId === supplier.id).map(order => (
                        <div key={order.id} className="bg-[var(--surface-raised)] rounded-xl p-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{formatDate(order.createdAt)}</span>
                            <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[order.status])}>
                              {STATUS_LABELS[order.status]}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--text-secondary)] dark:text-muted">
                            {order.items.length} producto{order.items.length !== 1 ? "s" : ""} · <span className="font-bold text-primary">S/{Number(order.total).toFixed(2)}</span>
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

      {/* ─── Create order modal (rediseñado 2026-05-17) ──────────────── */}
      {showCreate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-oc-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
          onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="bg-white dark:bg-[var(--color-card)] w-full sm:max-w-3xl sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92dvh] border-0 sm:border-2 sm:border-[var(--rule-base)] overflow-hidden">
            {/* Header */}
            <header className="px-5 sm:px-6 py-4 border-b-2 border-[var(--rule-base)] flex items-center gap-3 bg-linear-to-r from-primary/5 to-transparent">
              <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/15 border border-primary/30 shrink-0">
                <FileText className="h-6 w-6 text-primary" strokeWidth={2.2} />
              </span>
              <div className="flex-1 min-w-0">
                <h2 id="create-oc-title" className="text-lg font-extrabold text-[var(--text-primary)]">Nueva orden de compra</h2>
                <p className="text-sm text-[var(--text-secondary)]">Elegí proveedor, sumá productos y guardá. Después podés marcarla como recibida cuando llegue la mercadería.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label="Cerrar"
                className="shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Body */}
            <form onSubmit={createOrder} className="flex-1 overflow-y-auto">
              <div className="px-5 sm:px-6 py-5 space-y-6">
                {/* ── Sección: Proveedor + Notas ── */}
                <section className="space-y-3">
                  <h3 className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <Building2 className="h-4 w-4 text-[var(--text-tertiary)]" />
                    Proveedor
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Proveedor *" labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1" className="sm:col-span-2">
                      <select
                        required
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                        className="w-full h-12 px-3.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="">— Seleccionar proveedor —</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.ruc ? ` (RUC ${s.ruc})` : ""}</option>)}
                      </select>
                    </Field>
                    <Field label={<><StickyNote className="inline h-3 w-3 mr-1" />Notas (opcional)</>} labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1" className="sm:col-span-2">
                      <input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ej. Entrega antes del 25, pagar a 30 días, traer factura..."
                        className="w-full h-12 px-3.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-primary"
                      />
                    </Field>
                  </div>
                </section>

                {/* ── Sección: Productos ── */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      <Package className="h-4 w-4 text-[var(--text-tertiary)]" />
                      Productos de la orden
                      {items.length > 0 && (
                        <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-primary/10 text-primary text-xs font-extrabold tabular-nums">
                          {items.length}
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowScanner(true)}
                        className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-xs font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors"
                      >
                        <ScanBarcode className="h-4 w-4" />
                        Escanear
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddItemMode("search"); setAddItemSearch(""); setAddItemSel(null); setShowAddItemModal(true); }}
                        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-white text-xs font-extrabold hover:bg-primary-dark transition-colors shadow-sm"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                        Agregar producto
                      </button>
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 px-4 py-10 text-center">
                      <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-[var(--surface-canvas)] mb-3">
                        <Package className="h-6 w-6 text-[var(--text-tertiary)]" />
                      </span>
                      <p className="text-sm font-bold text-[var(--text-primary)]">Sin productos en la orden</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">Click en <strong>Agregar producto</strong> arriba para buscar o crear uno nuevo.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item, idx) => {
                        const q = itemQueries[idx] ?? "";
                        const filtered = q.length > 0
                          ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || (p.barcode ?? "").includes(q)).slice(0, 6)
                          : [];
                        const lineTotal = item.quantity * item.unitCost;
                        return (
                          <div key={idx} className="rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] p-3 transition-all hover:border-[var(--text-tertiary)]">
                            <div className="flex items-start gap-2 mb-2">
                              <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 text-primary text-xs font-extrabold shrink-0">
                                {idx + 1}
                              </span>
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
                                  className="w-full h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-primary"
                                />
                                {openSearchIdx === idx && filtered.length > 0 && (
                                  <div className="absolute top-full left-0 right-0 z-20 bg-white dark:bg-[var(--color-card)] border-2 border-[var(--rule-base)] rounded-2xl mt-1 max-h-56 overflow-y-auto shadow-lg">
                                    {filtered.map(p => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onMouseDown={() => { changeProduct(idx, p.id); setItemQueries(prev => prev.map((_, i) => i === idx ? p.name : _)); setOpenSearchIdx(null); }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-[var(--surface-sunken)] flex items-center gap-2 text-sm border-b border-[var(--rule-soft)] last:border-0"
                                      >
                                        <Package className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="font-bold text-[var(--text-primary)] truncate">{p.name}</p>
                                          {p.barcode && <p className="text-xs text-[var(--text-tertiary)]">{p.barcode}</p>}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                aria-label={`Quitar producto ${idx + 1}`}
                                className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)] transition-colors shrink-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex items-center gap-2 ml-9 flex-wrap">
                              <div className="flex items-center gap-1">
                                <Field label="Cant" labelClassName="text-xs font-bold text-[var(--text-tertiary)] uppercase">
                                  {(id) => (
                                    <>
                                      <input
                                        id={id}
                                        type="number" min="1" step="1"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                                        className="w-20 h-10 px-2 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-bold text-right tabular-nums outline-none focus:border-primary"
                                      />
                                      <span className="text-xs font-bold text-[var(--text-tertiary)] ml-1">{item.unit}</span>
                                    </>
                                  )}
                                </Field>
                              </div>
                              <div className="flex items-center gap-1">
                                <Field label="Costo" labelClassName="text-xs font-bold text-[var(--text-tertiary)] uppercase">
                                  {(id) => (
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-tertiary)]">S/</span>
                                      <input
                                        id={id}
                                        type="number" min="0" step="0.01"
                                        value={item.unitCost}
                                        onChange={(e) => updateItem(idx, { unitCost: Number(e.target.value) })}
                                        className="w-24 h-10 pl-7 pr-2 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-bold text-right tabular-nums outline-none focus:border-primary"
                                      />
                                    </div>
                                  )}
                                </Field>
                              </div>
                              <div className="ml-auto inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-primary/10 text-primary">
                                <span className="text-xs font-bold uppercase">Total</span>
                                <span className="text-base font-extrabold tabular-nums">S/{lineTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              {/* Footer sticky con total + acciones */}
              <footer className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-5 sm:px-6 py-4">
                {items.length > 0 && (
                  <div className="flex items-center justify-between mb-3 pb-3 border-b-2 border-[var(--rule-base)]">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Total de la orden</p>
                      <p className="text-xs text-[var(--text-secondary)]">{items.length} producto{items.length === 1 ? "" : "s"} · {items.reduce((s, i) => s + i.quantity, 0)} unidades</p>
                    </div>
                    <p className="text-3xl font-extrabold text-primary tabular-nums">
                      S/{itemsTotal.toFixed(2)}
                    </p>
                  </div>
                )}
                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !supplierId || items.length === 0}
                    className="flex-1 sm:flex-[2] inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-white text-sm font-extrabold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={2.5} />}
                    {saving ? "Guardando…" : "Crear orden de compra"}
                  </button>
                </div>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* ─── Orders list ─────────────────────────────────────────────── */}
      {loading ? (
        <TableSkeleton rows={4} cols={5} className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl" />
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 px-6 py-14 text-center">
          <span className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
            <ShoppingBag className="h-8 w-8 text-primary" strokeWidth={2.2} />
          </span>
          <h3 className="text-xl font-extrabold text-[var(--text-primary)]">
            {selectedSupplierId ? "Sin órdenes para este proveedor" : "Sin órdenes de compra"}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-md mx-auto">
            {selectedSupplierId
              ? "Este proveedor todavía no tiene órdenes registradas. Creá la primera o cambiá de proveedor."
              : "Llevá registro de lo que pedís a tus proveedores: fechas, cantidades, costos. Después podés duplicar pedidos frecuentes o hacerlos recurrentes."}
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-5 inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-sm font-extrabold hover:bg-primary-dark transition-colors shadow-sm"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
            Crear primera orden
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((o) => {
            const supplier = suppliers.find(s => s.id === o.supplierId);
            const isExpanded = expanded === o.id;
            return (
            <div
              key={o.id}
              className={cn(
                "bg-white dark:bg-[var(--color-card)] border-2 rounded-2xl overflow-hidden transition-all",
                isExpanded ? "border-primary/40 ring-2 ring-primary/15 shadow-sm" : "border-[var(--rule-base)] hover:border-[var(--text-tertiary)]",
              )}
            >
              <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Avatar + datos principales */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-primary/10 shrink-0">
                    <Truck className="h-5 w-5 text-primary" strokeWidth={2.2} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                        {o.supplierName}
                      </p>
                      <span className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-lg text-xs font-bold border", STATUS_COLORS[o.status])}>
                        {STATUS_LABELS[o.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-[var(--text-secondary)] font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        {formatDate(o.createdAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Package className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        {o.items.length} producto{o.items.length !== 1 ? "s" : ""}
                      </span>
                      {supplier?.ruc && (
                        <span className="inline-flex items-center gap-1">
                          <Hash className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                          {supplier.ruc}
                        </span>
                      )}
                    </div>
                    {/* Progress bar visual */}
                    <div className="mt-3">
                      <OCProgressBar status={o.status} />
                    </div>
                    {o.notes && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-2 italic line-clamp-1">{o.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Total</p>
                    <p className="text-2xl font-extrabold text-primary tabular-nums leading-none mt-0.5">
                      S/{Number(o.total).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 lg:border-l-2 lg:border-[var(--rule-soft)] lg:pl-4">
                  <select
                    value={o.status}
                    onChange={(e) => updateStatus(o.id, e.target.value as PurchaseStatus)}
                    aria-label="Cambiar estado"
                    className="h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] text-sm font-bold bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] outline-none focus:border-primary cursor-pointer"
                  >
                    {(Object.keys(STATUS_LABELS) as PurchaseStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  {(o.status === "pendiente" || o.status === "parcial") && (
                    <button
                      type="button"
                      onClick={() => setRecepcionOC(o)}
                      className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-[var(--data-success-500)] text-white text-sm font-bold hover:bg-emerald-600 transition-colors shadow-sm"
                      title="Registrar recepción"
                    >
                      <PackageCheck className="h-4 w-4" />
                      <span className="hidden sm:inline">Recibir</span>
                    </button>
                  )}
                  <OCPDFExport oc={o} supplier={supplier} />
                  <button
                    type="button"
                    onClick={() => duplicateOrder(o)}
                    className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--rule-base)] text-sm font-bold transition-colors"
                    title="Duplicar orden"
                  >
                    <Copy className="h-4 w-4" />
                    <span className="hidden md:inline">Duplicar</span>
                  </button>
                  {(o.status === "recibido" || o.status === "parcial") && (
                    <button
                      type="button"
                      onClick={() => { setShowRecurringModal(o); setRecurringInterval(15); setRecurringNotifyDays(2); }}
                      className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-primary hover:bg-primary/10 text-sm font-bold transition-colors"
                      title="Hacer pedido recurrente"
                    >
                      <Repeat className="h-4 w-4" />
                      <span className="hidden md:inline">Recurrente</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : o.id)}
                    aria-label={isExpanded ? "Colapsar detalle" : "Ver detalle"}
                    aria-expanded={isExpanded}
                    className="inline-flex items-center justify-center h-10 w-10 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteOrder(o.id)}
                    aria-label="Eliminar orden"
                    className="inline-flex items-center justify-center h-10 w-10 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/10 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {expanded === o.id && (
                <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-2 sm:px-4 py-2 sm:py-3 bg-[var(--surface-alt)] dark:bg-surface">
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
                            <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-[var(--text-tertiary)] dark:text-muted" />
                              {item.quantity}x {item.name} <span className="text-[var(--text-tertiary)] dark:text-muted">({item.unit})</span>
                            </span>
                            <div className="text-right">
                              <span className="text-[var(--text-tertiary)] dark:text-muted text-xs mr-2">S/{Number(item.unitCost).toFixed(2)} c/u</span>
                              <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{(item.quantity * item.unitCost).toFixed(2)}</span>
                            </div>
                          </div>
                          {/* Mejora 20: Referencia de precio anterior */}
                          {prevPrice != null && (
                            <p className="text-xs text-[var(--text-tertiary)] pl-5 mt-0.5">
                              Última vez: S/{prevPrice.toFixed(2)} ({prevDateRelative})
                              {diff != null && diff > 0 && <span className="text-[var(--data-error-500)] ml-1">↑ S/{diff.toFixed(2)} mas caro</span>}
                              {diff != null && diff < 0 && <span className="text-[var(--data-success-500)] ml-1">↓ S/{Math.abs(diff).toFixed(2)} mas barato</span>}
                              {diff != null && diff === 0 && <span className="text-[var(--text-tertiary)] ml-1">= Mismo precio</span>}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center text-sm font-bold border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] pt-1.5 mt-1">
                      <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">Total</span>
                      <span className="text-primary">S/{Number(o.total).toFixed(2)}</span>
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
                          ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                          : diff > 0
                          ? "bg-[var(--data-warning-50)] dark:bg-orange-950/20 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                          : "bg-[var(--surface-alt)] dark:bg-surface text-[var(--text-secondary)]"
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
            );
          })}
        </div>
      )}

      {/* Add item modal */}
      {showAddItemModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={(e) => e.target === e.currentTarget && setShowAddItemModal(false)}
        >
          <div className="bg-[var(--surface-raised)] w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl max-h-[85dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Agregar producto
              </CardTitle>
              <button onClick={() => setShowAddItemModal(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex border-b px-5 shrink-0">
              <button
                onClick={() => setAddItemMode("search")}
                className={cn("py-2.5 px-3 text-sm font-semibold border-b-2 -mb-px transition-colors", addItemMode === "search" ? "border-primary text-primary" : "border-transparent text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)]")}
              >Buscar existente</button>
              <button
                onClick={() => setAddItemMode("new")}
                className={cn("py-2.5 px-3 text-sm font-semibold border-b-2 -mb-px transition-colors", addItemMode === "new" ? "border-primary text-primary" : "border-transparent text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)]")}
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
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
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
                            : "border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:border-gray-300"
                        )}
                      >
                        <div className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">{p.name}</div>
                        <div className="text-xs text-[var(--text-tertiary)] dark:text-muted">{p.unit}{p.barcode ? ` · ${p.barcode}` : ""} · stock: {p.stock ?? 0}</div>
                      </button>
                    ))}
                    {products.length === 0 && <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-6">No hay productos</p>}
                  </div>
                  {addItemSel && (
                    <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-4 space-y-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                      <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{addItemSel.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Cantidad" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                          <input
                            type="number" min="1" step="1" value={addItemQty}
                            onChange={(e) => setAddItemQty(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                          />
                        </Field>
                        <Field label="Costo unitario (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                          <input
                            type="number" min="0" step="0.01" value={addItemCost}
                            onChange={(e) => setAddItemCost(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                          />
                        </Field>
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
                    headers: csrfHeaders({ "Content-Type": "application/json" }),
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
                    <Field label="Nombre *" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1" className="sm:col-span-2">
                      <input
                        required value={newProdForm.name}
                        onChange={(e) => setNewProdForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Nombre del producto"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Categoría" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <select value={newProdForm.category} onChange={(e) => setNewProdForm(p => ({ ...p, category: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none">
                        <option value="abarrotes">Abarrotes</option>
                        <option value="bebidas">Bebidas</option>
                        <option value="lacteos">Lácteos</option>
                        <option value="carnes">Carnes</option>
                        <option value="verduras">Verduras</option>
                        <option value="limpieza">Limpieza</option>
                        <option value="higiene">Higiene</option>
                        <option value="otros">Otros</option>
                      </select>
                    </Field>
                    <Field label="Unidad" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input value={newProdForm.unit} onChange={(e) => setNewProdForm(p => ({ ...p, unit: e.target.value }))}
                        placeholder="und, kg, L…"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Precio venta (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input type="number" min="0" step="0.01" value={newProdForm.price}
                        onChange={(e) => setNewProdForm(p => ({ ...p, price: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Costo compra (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input type="number" min="0" step="0.01" value={newProdForm.costPrice}
                        onChange={(e) => setNewProdForm(p => ({ ...p, costPrice: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Cantidad inicial" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input type="number" min="0" step="1" value={newProdForm.stock}
                        onChange={(e) => setNewProdForm(p => ({ ...p, stock: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Código de barras" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input value={newProdForm.barcode} onChange={(e) => setNewProdForm(p => ({ ...p, barcode: e.target.value }))}
                        placeholder="Opcional"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
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
        <div className="fixed bottom-4 right-4 z-50 bg-[var(--surface-raised)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-4 max-w-xs animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
              <Copy className="h-4 w-4 text-[var(--data-success-500)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{duplicateToast}</p>
          </div>
        </div>
      )}

      {/* Barcode scanner modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowScanner(false)}>
          <div className="bg-[var(--surface-raised)] w-full sm:max-w-md sm:rounded-xl rounded-t-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Escanear código de barras</CardTitle>
              <button onClick={() => setShowScanner(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors"><X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" /></button>
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

