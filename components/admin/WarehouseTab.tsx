"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";

import { useState, useMemo, useEffect, startTransition } from "react";
import {
  Warehouse, X, ArrowRightLeft, Package, Plus,
  Download, Search, AlertTriangle, CheckCircle, RefreshCw, SlidersHorizontal, Info, Trash2, ChevronLeft, ChevronRight,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type WarehouseRecord = {
  id: string;
  name: string;
  code: string;
  type: "principal" | "secundario" | "punto-venta" | "deposito" | "frigorifico";
  location: string;
  manager: string;
  capacity: number;     // unidades
  active: boolean;
};

type StockLine = {
  warehouseId: string;
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  unit: string;
  minStock: number;
  costAvg: number;
};

type Transfer = {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  productName: string;
  quantity: number;
  unit: string;
  date: string;
  status: "completado" | "pendiente" | "cancelado";
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

const TYPE_LABELS: Record<WarehouseRecord["type"], string> = {
  principal: "Principal", secundario: "Secundario",
  "punto-venta": "Punto de Venta", deposito: "Depósito", frigorifico: "Frigorífico",
};

const EMPTY_TRANSFER = { fromId: "", toId: "", productId: "", quantity: "", unit: "unidad", notes: "" };

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda sobre Multi-Almacen">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="pointer-events-none absolute left-6 top-0 z-50 w-80 rounded-xl border border-[var(--rule-base)] bg-white p-4 text-xs leading-relaxed dark:border-card-border dark:bg-card">
          <p className="mb-2 text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">Multi-Almacén</p>
          <p className="mb-3 text-[var(--text-secondary)] dark:text-muted">Centraliza almacenes, stock por sede y transferencias internas para saber donde esta cada producto y cuanto vale.</p>
          <p className="text-[var(--text-secondary)] dark:text-muted">Ejemplo: comparas el stock del Almacen Principal contra el Punto de Venta y detectas rápido donde falta reponer.</p>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WarehouseTab() {
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [stock, setStock] = useState<StockLine[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const loadWarehouseData = () => {
    Promise.all([
      fetch("/api/admin/warehouses").then(r => r.ok ? r.json() : []),
      fetch("/api/admin/dashboard").then(r => r.ok ? r.json() : null),
      fetch("/api/admin/warehouse-transfers?limit=50").then(r => r.ok ? r.json() : { items: [] }),
    ]).then(([warehouseList, dashData, transferData]: [
      Array<{ id: string; name: string; code: string; type: string; location: string; manager: string; capacity: number; active: boolean }>,
      { products?: Array<{ id: number | string; name: string; category?: string | null; unit?: string | null; stock?: number | null; stockMin?: number | null; costPrice?: number | null; price: number }> } | null,
      { items?: Array<{ id: string; fromId: string; fromName: string; toId: string; toName: string; productId: number; productName?: string; quantity: number; unit: string; status: string; notes: string; date: string }> }
    ]) => {
      const whs: WarehouseRecord[] = warehouseList.map(w => ({
        id: w.id,
        name: w.name,
        code: w.code,
        type: w.type as WarehouseRecord["type"],
        location: w.location,
        manager: w.manager,
        capacity: w.capacity,
        active: w.active,
      }));
      // Assign all products to the first (principal) warehouse by default
      const primaryId = whs.find(w => w.type === "principal")?.id ?? whs[0]?.id ?? "w-principal";
      const stockLines: StockLine[] = (dashData?.products ?? [])
        .filter(p => typeof p.stock === "number")
        .map(p => ({
          warehouseId: primaryId,
          productId: String(p.id),
          productName: p.name,
          category: p.category ?? "General",
          quantity: p.stock ?? 0,
          unit: p.unit ?? "unidad",
          minStock: p.stockMin ?? 0,
          costAvg: p.costPrice ?? p.price,
        }));
      startTransition(() => {
        setWarehouses(whs.length > 0 ? whs : [{
          id: "w-principal", name: "Almacén Principal", code: "ALM-001",
          type: "principal", location: "Tienda San Martín", manager: "Administrador",
          capacity: 10000, active: true,
        }]);
        setStock(stockLines);
        // Load persisted transfers from DB
        const dbTransfers: Transfer[] = (transferData.items ?? []).map(t => ({
          id: t.id,
          fromId: t.fromId,
          fromName: t.fromName,
          toId: t.toId,
          toName: t.toName,
          productName: t.productName ?? `Producto #${t.productId}`,
          quantity: t.quantity,
          unit: t.unit,
          date: t.date,
          status: t.status as Transfer["status"],
          notes: t.notes,
        }));
        setTransfers(dbTransfers);
        setLoadingData(false);
      });
    }).catch(() => startTransition(() => setLoadingData(false)));
  };

  useEffect(() => { loadWarehouseData(); }, []);
  const [view, setView] = useState<"almacenes" | "stock" | "transferencias">("almacenes");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState({ ...EMPTY_TRANSFER });
  // Adjust stock inline: stockId -> editing value
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [showNewWhForm, setShowNewWhForm] = useState(false);
  const [newWhForm, setNewWhForm] = useState({ name: "", code: "", type: "secundario", location: "", manager: "", capacity: "" });
  const [creatingWh, setCreatingWh] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Pagination for warehouses view
  const [whPage, setWhPage] = useState(0);
  const WH_PAGE_SIZE = 4;
  // Filters for warehouses view
  const [filterType, setFilterType] = useState<string>("todos");
  const [filterActive, setFilterActive] = useState<"todos" | "activo" | "inactivo">("todos");
  const [searchWh, setSearchWh] = useState("");
  const [updatingTransferId, setUpdatingTransferId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");

  // Products available in the selected origin warehouse
  const originProducts = useMemo(() => {
    const fromId = transferForm.fromId;
    if (!fromId) return stock.filter((s, i, arr) => arr.findIndex(x => x.productId === s.productId) === i);
    return stock.filter(s => s.warehouseId === fromId);
  }, [stock, transferForm.fromId]);

  const filteredOriginProducts = useMemo(() => {
    if (!productSearch.trim()) return originProducts;
    const q = productSearch.toLowerCase();
    return originProducts.filter(s => s.productName.toLowerCase().includes(q));
  }, [originProducts, productSearch]);

  const handleAdjustStock = (s: StockLine) => {
    const newQty = parseInt(adjustValue, 10);
    if (isNaN(newQty) || newQty < 0) return;
    // Optimistic update
    startTransition(() => {
      setStock(prev => prev.map(x => x.productId === s.productId ? { ...x, quantity: newQty } : x));
      setAdjustingId(null);
    });
    fetch("/api/inventory-movements", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "adjust", productId: Number(s.productId), newStock: newQty }),
    }).catch(() => {});
  };

  const handleCreateWarehouse = () => {
    if (!newWhForm.name.trim() || !newWhForm.code.trim()) return;
    setCreatingWh(true);
    fetch("/api/admin/warehouses", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: newWhForm.name.trim(),
        code: newWhForm.code.trim().toUpperCase(),
        type: newWhForm.type,
        location: newWhForm.location.trim(),
        ...(newWhForm.manager.trim() && { manager: newWhForm.manager.trim() }),
        ...(newWhForm.capacity && !isNaN(Number(newWhForm.capacity)) && { capacity: Number(newWhForm.capacity) }),
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((wh: { id: string; name: string; code: string; type: string; location: string; manager: string; capacity: number; active: boolean } | null) => {
        if (!wh) return;
        startTransition(() => {
          setWarehouses(prev => [...prev, { id: wh.id, name: wh.name, code: wh.code, type: wh.type as WarehouseRecord["type"], location: wh.location, manager: wh.manager, capacity: wh.capacity, active: wh.active }]);
          setShowNewWhForm(false);
          setNewWhForm({ name: "", code: "", type: "secundario", location: "", manager: "", capacity: "" });
          setCreatingWh(false);
        });
      })
      .catch(() => setCreatingWh(false));
  };

  const handleDeleteWarehouse = (id: string) => {
    setDeletingId(id);
    fetch(`/api/admin/warehouses?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      .then(r => {
        if (r.ok) {
          startTransition(() => {
            setWarehouses(prev => prev.filter(w => w.id !== id));
            setConfirmDeleteId(null);
          });
        }
      })
      .catch(() => {})
      .finally(() => setDeletingId(null));
  };

  const warehouseStock = useMemo(() => {
    return warehouses.map(w => {
      const lines = stock.filter(s => s.warehouseId === w.id);
      const totalItems = lines.reduce((s, l) => s + l.quantity, 0);
      const totalValue = lines.reduce((s, l) => s + l.quantity * l.costAvg, 0);
      const lowStock = lines.filter(l => l.quantity <= l.minStock).length;
      return { ...w, lines, totalItems, totalValue, lowStock };
    });
  }, [warehouses, stock]);

  const filteredWarehouses = useMemo(() => {
    return warehouseStock.filter(w => {
      if (filterType !== "todos" && w.type !== filterType) return false;
      if (filterActive === "activo" && !w.active) return false;
      if (filterActive === "inactivo" && w.active) return false;
      if (searchWh.trim()) {
        const q = searchWh.toLowerCase();
        if (!w.name.toLowerCase().includes(q) && !w.code.toLowerCase().includes(q) && !w.location.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [warehouseStock, filterType, filterActive, searchWh]);

  const pagedWarehouses = useMemo(() => {
    const start = whPage * WH_PAGE_SIZE;
    return filteredWarehouses.slice(start, start + WH_PAGE_SIZE);
  }, [filteredWarehouses, whPage]);

  const filteredStock = useMemo(() => {
    let list = selectedWarehouse === "todos" ? stock : stock.filter(s => s.warehouseId === selectedWarehouse);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.productName.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
    }
    return list;
  }, [stock, selectedWarehouse, search]);

  async function handleUpdateTransferStatus(id: string, status: "completado" | "cancelado") {
    setUpdatingTransferId(id);
    try {
      const res = await fetch("/api/admin/warehouse-transfers", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setTransfers(prev =>
          prev.map(t => t.id === id ? { ...t, status } : t)
        );
      }
    } finally {
      setUpdatingTransferId(null);
    }
  }

  function handleTransfer() {
    if (!transferForm.productId || !transferForm.quantity || transferForm.fromId === transferForm.toId) return;
    const from = warehouses.find(w => w.id === transferForm.fromId)!;
    const to = warehouses.find(w => w.id === transferForm.toId)!;
    const srcLine = stock.find(s => s.productId === transferForm.productId && s.warehouseId === from.id)
      ?? stock.find(s => s.productId === transferForm.productId);
    if (!srcLine) return;
    const qty = parseFloat(transferForm.quantity) || 0;
    const t: Transfer = {
      id: `t-${Date.now()}`,
      fromId: from.id, fromName: from.name,
      toId: to.id, toName: to.name,
      productName: srcLine.productName,
      quantity: qty,
      unit: transferForm.unit,
      date: new Date().toISOString(),
      status: "pendiente",
      notes: transferForm.notes.trim(),
    };
    setTransfers(prev => [t, ...prev]);
    setShowTransferForm(false);
    // Move stock between warehouses in client state
    startTransition(() => {
      setStock(prev => {
        const reduced = prev.map(s =>
          s.productId === srcLine.productId && s.warehouseId === from.id
            ? { ...s, quantity: Math.max(0, s.quantity - qty) }
            : s
        );
        const destExists = reduced.some(s => s.productId === srcLine.productId && s.warehouseId === to.id);
        if (destExists) {
          return reduced.map(s =>
            s.productId === srcLine.productId && s.warehouseId === to.id
              ? { ...s, quantity: s.quantity + qty }
              : s
          );
        }
        return [...reduced, { ...srcLine, warehouseId: to.id, quantity: qty }];
      });
    });
    setTransferForm({ ...EMPTY_TRANSFER });
    setProductSearch("");
    const noteText = `Transferencia: ${from.name} → ${to.name}${transferForm.notes.trim() ? `. ${transferForm.notes.trim()}` : ""}`;
    // Persist transfer to DB
    fetch("/api/admin/warehouse-transfers", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        fromWarehouseId: from.id,
        toWarehouseId: to.id,
        productId: Number(srcLine.productId),
        quantity: Math.round(qty),
        unit: transferForm.unit,
        notes: transferForm.notes.trim(),
      }),
    }).catch(() => {});
    // Also record as inventory movement
    fetch("/api/inventory-movements", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ productId: Number(srcLine.productId), type: "transferencia", quantity: qty, notes: noteText }),
    }).catch(() => {});
  }

  const totalValue = warehouseStock.reduce((s, w) => s + w.totalValue, 0);
  const totalLow = warehouseStock.reduce((s, w) => s + w.lowStock, 0);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Warehouse className="h-6 w-6 text-primary" /> Multi-Almacén <ModuleTooltip />
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Gestión de ubicaciones, stock por almacén y transferencias internas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setLoadingData(true); loadWarehouseData(); }} disabled={loadingData} title="Actualizar datos de inventario" className="p-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-[var(--text-secondary)] hover:text-primary disabled:opacity-40 transition-colors">
            <RefreshCw className={cn("h-4 w-4", loadingData && "animate-spin")} />
          </button>
          <button onClick={() => exportToCSV(filteredStock.map(s => ({ almacen: warehouses.find(w => w.id === s.warehouseId)?.name ?? s.warehouseId, producto: s.productName, categoria: s.category, cantidad: s.quantity, unidad: s.unit, stock_min: s.minStock, costo_avg: s.costAvg, valor_total: s.quantity * s.costAvg })), "stock-almacenes")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowNewWhForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Plus className="h-4 w-4" /> Nuevo
          </button>
          <button onClick={() => {
            const active = warehouses.filter(w => w.active);
            setTransferForm({ ...EMPTY_TRANSFER, fromId: active[0]?.id ?? "", toId: active[1]?.id ?? active[0]?.id ?? "" });
            setShowTransferForm(v => !v);
          }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <ArrowRightLeft className="h-4 w-4" /> Transferir
          </button>
        </div>
      </div>

      {/* KPIs row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] p-4">
          <Warehouse className="h-5 w-5 mb-2 text-[var(--data-success-500)]" />
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Almacenes activos</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)]">{warehouses.filter(w => w.active).length}</p>
        </div>
        <div className="rounded-xl bg-[var(--surface-sunken)] p-4">
          <Package className="h-5 w-5 mb-2 text-[var(--text-secondary)]" />
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Valor total inventario</p>
          <p className="text-lg font-extrabold text-[var(--text-secondary)]">{fmt(totalValue)}</p>
        </div>
        <div className="rounded-xl bg-[var(--data-warning-50)] dark:bg-amber-950/30 p-4">
          <AlertTriangle className="h-5 w-5 mb-2 text-[var(--data-warning-500)]" />
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Productos bajo mínimo</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-warning-500)]">{totalLow}</p>
        </div>
        <div className="rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] p-4">
          <ArrowRightLeft className="h-5 w-5 mb-2 text-[var(--data-success-500)]" />
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Transferencias mes</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)]">{transfers.length}</p>
        </div>
      </div>

      {/* Transfer form */}
      {showTransferForm && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm flex flex-wrap items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-primary" /> Nueva transferencia</CardTitle>
            <button onClick={() => setShowTransferForm(false)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Origen</label>
              <select value={transferForm.fromId} onChange={e => setTransferForm(p => ({ ...p, fromId: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Destino</label>
              <select value={transferForm.toId} onChange={e => setTransferForm(p => ({ ...p, toId: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                {warehouses.filter(w => w.active && w.id !== transferForm.fromId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Producto</label>
              <input
                type="text"
                value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setTransferForm(p => ({ ...p, productId: "" })); }}
                placeholder="Buscar producto…"
                className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground mb-1"
              />
              <select
                value={transferForm.productId}
                onChange={e => { setTransferForm(p => ({ ...p, productId: e.target.value })); setProductSearch(""); }}
                className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground"
                size={Math.min(filteredOriginProducts.length + 1, 5)}
              >
                <option value="">-- Seleccionar --</option>
                {filteredOriginProducts.map(s => (
                  <option key={s.productId} value={s.productId}>
                    {s.productName} ({s.quantity} {s.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                Cantidad
                {transferForm.productId && (() => {
                  const sel = originProducts.find(s => String(s.productId) === String(transferForm.productId));
                  return sel ? <span className="ml-2 text-[var(--text-tertiary)] dark:text-muted font-normal">disponible: {sel.quantity} {sel.unit}</span> : null;
                })()}
              </label>
              {(() => {
                const sel = originProducts.find(s => String(s.productId) === String(transferForm.productId));
                const maxQty = sel?.quantity ?? undefined;
                const qty = Number(transferForm.quantity);
                const overLimit = maxQty !== undefined && qty > maxQty;
                return (
                  <>
                    <input
                      type="number"
                      value={transferForm.quantity}
                      onChange={e => setTransferForm(p => ({ ...p, quantity: e.target.value }))}
                      min="1"
                      max={maxQty}
                      className={`w-full text-sm border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground ${overLimit ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : "border-[var(--rule-base)] dark:border-card-border"}`}
                    />
                    {overLimit && (
                      <p className="text-xs text-[var(--data-error-500)] mt-1">La cantidad supera el stock disponible ({maxQty} {sel!.unit})</p>
                    )}
                  </>
                );
              })()}
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Unidad</label>
              <select value={transferForm.unit} onChange={e => setTransferForm(p => ({ ...p, unit: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                {["unidad", "kg", "litro", "caja", "bolsa", "saco", "lata", "botella"].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Notas</label>
              <input type="text" value={transferForm.notes} onChange={e => setTransferForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observaciones..." className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowTransferForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted">Cancelar</button>
            <button onClick={handleTransfer} disabled={(() => {
              const sel = originProducts.find(s => String(s.productId) === String(transferForm.productId));
              return sel !== undefined && Number(transferForm.quantity) > sel.quantity;
            })()} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">Registrar transferencia</button>
          </div>
        </div>
      )}

      {/* New warehouse form */}
      {showNewWhForm && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm flex flex-wrap items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Nuevo almacén</CardTitle>
            <button onClick={() => setShowNewWhForm(false)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Nombre</label>
              <input type="text" value={newWhForm.name} onChange={e => setNewWhForm(p => ({ ...p, name: e.target.value }))} placeholder="Depósito Norte" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Código</label>
              <input type="text" value={newWhForm.code} onChange={e => setNewWhForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="ALM-002" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Tipo</label>
              <select value={newWhForm.type} onChange={e => setNewWhForm(p => ({ ...p, type: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Dirección / Ubicación</label>
              <input type="text" value={newWhForm.location} onChange={e => setNewWhForm(p => ({ ...p, location: e.target.value }))} placeholder="Av. Principal 123" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Responsable</label>
              <input type="text" value={newWhForm.manager} onChange={e => setNewWhForm(p => ({ ...p, manager: e.target.value }))} placeholder="Nombre del encargado" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Capacidad (u.)</label>
              <input type="number" value={newWhForm.capacity} onChange={e => setNewWhForm(p => ({ ...p, capacity: e.target.value }))} placeholder="10000" min="1" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowNewWhForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted">Cancelar</button>
            <button onClick={handleCreateWarehouse} disabled={creatingWh || !newWhForm.name.trim() || !newWhForm.code.trim()} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50">
              {creatingWh ? "Creando..." : "Crear almacén"}
            </button>
          </div>
        </div>
      )}

      {/* Skeleton while loading */}
      {loadingData && (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-surface rounded w-40 mb-3" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1,2,3].map(j => <div key={j} className="h-12 rounded-xl bg-gray-100 dark:bg-surface/50" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View tabs */}
      {!loadingData && (
      <div className="flex flex-wrap items-center gap-2">
        {(["almacenes", "stock", "transferencias"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold rounded-lg transition-colors capitalize", view === v ? "bg-primary text-white" : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      )}

      {/* Warehouses view */}
      {view === "almacenes" && (
        <div className="space-y-6">
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input value={searchWh} onChange={e => { setSearchWh(e.target.value); setWhPage(0); }} placeholder="Buscar almacén..." className="pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground w-44" />
            </div>
            <select value={filterType} onChange={e => { setFilterType(e.target.value); setWhPage(0); }} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
              <option value="todos">Todos los tipos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterActive} onChange={e => { setFilterActive(e.target.value as typeof filterActive); setWhPage(0); }} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
              <option value="todos">Activo e inactivo</option>
              <option value="activo">Solo activos</option>
              <option value="inactivo">Solo inactivos</option>
            </select>
            {(filterType !== "todos" || filterActive !== "todos" || searchWh.trim()) && (
              <button onClick={() => { setFilterType("todos"); setFilterActive("todos"); setSearchWh(""); setWhPage(0); }} className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-surface text-[var(--text-secondary)] hover:bg-gray-200 transition-colors">
                Limpiar filtros
              </button>
            )}
            <span className="text-xs text-[var(--text-tertiary)] dark:text-muted ml-auto">{filteredWarehouses.length} almacén(es)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            {pagedWarehouses.map(w => (
              <div key={w.id} className={cn("bg-white dark:bg-card border rounded-xl p-3 sm:p-5 space-y-4", w.lowStock > 0 ? "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]" : "border-[var(--rule-base)] dark:border-card-border")}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-[var(--text-tertiary)] font-mono">{w.code}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]">{TYPE_LABELS[w.type]}</span>
                    </div>
                    <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{w.name}</CardTitle>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">{w.location}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", w.active ? "bg-[var(--accent-soft)]" : "bg-gray-300")} />
                    {confirmDeleteId === w.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDeleteWarehouse(w.id)} disabled={deletingId === w.id} className="text-xs px-2 py-1 rounded-lg bg-[var(--data-error-500)] text-white font-bold hover:bg-[var(--data-error-500)] disabled:opacity-50">
                          {deletingId === w.id ? "..." : "Confirmar"}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-surface text-[var(--text-secondary)]">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(w.id)} title="Eliminar almacén" className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  <div className="bg-gray-50 dark:bg-surface/50 rounded-xl p-3">
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mb-0.5">Productos</p>
                    <p className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{w.lines.length}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-surface/50 rounded-xl p-3">
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mb-0.5">Valor</p>
                    <p className="font-extrabold text-[var(--text-secondary)]">{fmt(w.totalValue)}</p>
                  </div>
                  <div className={cn("rounded-xl p-3", w.lowStock > 0 ? "bg-[var(--data-warning-50)] dark:bg-amber-950/20" : "bg-gray-50 dark:bg-surface/50")}>
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mb-0.5">Bajo mínimo</p>
                    <p className={cn("font-extrabold", w.lowStock > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]")}>{w.lowStock}</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Responsable: {w.manager} · Capacidad: {w.capacity.toLocaleString()} u.</p>
              </div>
            ))}
          </div>
          {/* Pagination */}
          {filteredWarehouses.length > WH_PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-[var(--rule-soft)] dark:border-card-border pt-3">
              <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">
                {whPage * WH_PAGE_SIZE + 1}–{Math.min((whPage + 1) * WH_PAGE_SIZE, filteredWarehouses.length)} de {filteredWarehouses.length} almacenes
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setWhPage(p => Math.max(0, p - 1))} disabled={whPage === 0} className="p-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                  <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
                <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted px-2">{whPage + 1} / {Math.ceil(filteredWarehouses.length / WH_PAGE_SIZE)}</span>
                <button onClick={() => setWhPage(p => Math.min(Math.ceil(filteredWarehouses.length / WH_PAGE_SIZE) - 1, p + 1))} disabled={(whPage + 1) * WH_PAGE_SIZE >= filteredWarehouses.length} className="p-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                  <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stock view */}
      {view === "stock" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <select value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
              <option value="todos">Todos los almacenes</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Almacén</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Producto</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Categoría</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Cantidad</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Mínimo</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Estado</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Valor</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Ajustar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                  {filteredStock.map((s) => {
                    const wh = warehouses.find(w => w.id === s.warehouseId);
                    const isLow = s.quantity <= s.minStock;
                    return (
                      <tr key={`${s.warehouseId}-${s.productId}`} className="hover:bg-gray-50/50 dark:hover:bg-surface/30">
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{wh?.name ?? s.warehouseId}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-[var(--text-primary)] dark:text-foreground">{s.productName}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{s.category}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">{s.quantity} <span className="text-xs font-normal text-[var(--text-tertiary)]">{s.unit}</span></td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-[var(--text-tertiary)]">{s.minStock}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                          {isLow
                            ? <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]"><AlertTriangle className="h-3 w-3" /> Bajo mínimo</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"><CheckCircle className="h-3 w-3" /> OK</span>
                          }
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{fmt(s.quantity * s.costAvg)}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                          {adjustingId === s.productId ? (
                            <div className="flex items-center justify-end gap-1">
                              <input type="number" value={adjustValue} onChange={e => setAdjustValue(e.target.value)} min="0" className="w-16 text-xs border border-[var(--rule-base)] dark:border-card-border rounded px-2 py-1 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" autoFocus />
                              <button onClick={() => handleAdjustStock(s)} className="text-xs px-2 py-1 rounded bg-primary text-white font-bold">OK</button>
                              <button onClick={() => setAdjustingId(null)} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-surface text-[var(--text-secondary)]"><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <button onClick={() => { setAdjustingId(s.productId); setAdjustValue(String(s.quantity)); }} title="Ajustar stock" className="text-xs p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface text-[var(--text-tertiary)] hover:text-primary transition-colors"><SlidersHorizontal className="h-3.5 w-3.5" /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Transfers view */}
      {view === "transferencias" && (
        <div className="space-y-3">
          {transfers.map(t => {
            const statusMeta = t.status === "completado"
              ? { color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", label: "Completado" }
              : t.status === "pendiente"
              ? { color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", label: "Pendiente" }
              : { color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]", bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30", label: "Cancelado" };
            return (
              <div key={t.id} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <ArrowRightLeft className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm">{t.productName} — {t.quantity} {t.unit}</p>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{t.fromName} → {t.toName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", statusMeta.bg, statusMeta.color)}>{statusMeta.label}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{fmtDate(t.date)}</span>
                  {t.notes && <span className="text-xs text-[var(--text-tertiary)] italic">&ldquo;{t.notes}&rdquo;</span>}
                  {t.status === "pendiente" && (
                    <>
                      <button
                        onClick={() => handleUpdateTransferStatus(t.id, "completado")}
                        disabled={updatingTransferId === t.id}
                        className="text-xs px-2 py-0.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold hover:bg-[var(--accent-soft)] disabled:opacity-50"
                      >
                        {updatingTransferId === t.id ? "…" : "Completar"}
                      </button>
                      <button
                        onClick={() => handleUpdateTransferStatus(t.id, "cancelado")}
                        disabled={updatingTransferId === t.id}
                        className="text-xs px-2 py-0.5 rounded-lg bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold hover:bg-[var(--data-error-500)] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
