"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";

import { useState, useMemo, useEffect } from "react";
import {
  Package, AlertTriangle, CheckCircle, Plus, X,
  Download, Search, Clock, Trash2, ChevronDown, ChevronUp, Info, Pencil,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type BatchStatus = "vigente" | "próximo" | "por-vencer" | "critico" | "vencido";

type Batch = {
  id: string;
  lote: string;
  productName: string;
  productId?: number;
  productCategory: string;
  quantity: number;
  unit: string;
  supplierId?: string;
  supplierName: string;
  warehouseId?: string;
  entryDate: string;   // ISO date
  expiryDate: string;  // ISO date
  costUnit: number;
  notes: string;
};

type ProductOption = { id: number; name: string; category: string };
type WarehouseOption = { id: string; name: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function batchStatus(expiryDate: string): BatchStatus {
  const d = daysUntil(expiryDate);
  if (d < 0) return "vencido";
  if (d <= 7) return "critico";
  if (d <= 30) return "por-vencer";
  if (d <= 60) return "próximo";
  return "vigente";
}

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

const STATUS_META: Record<BatchStatus, { label: string; color: string; bg: string; icon: typeof AlertTriangle }> = {
  vigente:     { label: "Vigente",    color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: CheckCircle },
  próximo:     { label: "Próximo",    color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",      bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",      icon: Clock },
  "por-vencer":{ label: "Por vencer", color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",    bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",    icon: Clock },
  critico:     { label: "Crítico",    color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-50)] dark:bg-orange-950/30",  icon: AlertTriangle },
  vencido:     { label: "Vencido",    color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",        bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",        icon: AlertTriangle },
};

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM = { lote: "", productName: "", productId: "", productCategory: "Abarrotes", quantity: "", unit: "unidad", supplierName: "", warehouseId: "", entryDate: today, expiryDate: "", costUnit: "", notes: "" };

const CATEGORIES = ["Abarrotes", "Bebidas", "Lácteos", "Limpieza", "Higiene Personal", "Panadería", "Carnes y Embutidos", "Congelados", "Snacks", "Mascotas", "Otros"];

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: "asc" | "desc" }) {
  if (sortField !== field) return <ChevronDown className="h-3 w-3 ml-0.5 inline opacity-30" />;
  return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-0.5 inline" /> : <ChevronDown className="h-3 w-3 ml-0.5 inline" />;
}

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda sobre Lotes y Vencimientos">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="pointer-events-none absolute left-6 top-0 z-50 w-80 rounded-xl border border-[var(--rule-base)] bg-white p-4 text-xs leading-relaxed dark:border-card-border dark:bg-card">
          <p className="mb-2 text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">Lotes y Vencimientos</p>
          <p className="mb-3 text-[var(--text-secondary)] dark:text-muted">Controla lote, fecha de ingreso, fecha de vencimiento y prioridad FIFO para vender primero lo que vence antes.</p>
          <p className="text-[var(--text-secondary)] dark:text-muted">Ejemplo: si un lote vence en 5 dias, el modulo lo marca como critico para que salte a revision o salida inmediata.</p>
        </div>
      )}
    </div>
  );
}

// ── Mejora 8: Expiry Countdown Badge ──────────────────────────────────────────

function ExpiryCountdownBadge({ daysLeft }: { daysLeft: number }) {
  if (daysLeft <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-extrabold px-2 py-0.5 rounded-full bg-[var(--data-error-100)] dark:bg-red-950/40 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]">
        VENCIDO hace {Math.abs(daysLeft)}d
      </span>
    );
  }
  if (daysLeft <= 3) {
    return (
      <span className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-extrabold px-2 py-0.5 rounded-full bg-[var(--data-error-100)] dark:bg-red-950/40 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] animate-pulse">
        Vence en {daysLeft}d
      </span>
    );
  }
  if (daysLeft <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] dark:bg-orange-950/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]">
        Vence en {daysLeft}d
      </span>
    );
  }
  if (daysLeft <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] dark:bg-amber-950/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]">
        Vence en {daysLeft}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
      Vence en {daysLeft}d
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BatchesTab() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<BatchStatus | "todos">("todos");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [sortField, setSortField] = useState<"expiryDate" | "productName" | "quantity">("expiryDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

  useEffect(() => {
    fetch("/api/batches")
      .then(r => r.json())
      .then((d: unknown) => setBatches(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
    fetch("/api/products")
      .then(r => r.json())
      .then((d: unknown) => setProducts(Array.isArray(d) ? d.map((p: { id: number; name: string; category?: string }) => ({ id: p.id, name: p.name, category: p.category || "Otros" })) : []))
      .catch(() => {});
    fetch("/api/admin/warehouses")
      .then(r => r.json())
      .then((d: unknown) => {
        const items = Array.isArray(d) ? d : (d as { items?: unknown[] })?.items;
        setWarehouses(Array.isArray(items) ? items.map((w: { id: string; name: string }) => ({ id: w.id, name: w.name })) : []);
      })
      .catch(() => {});
  }, []);

  const processed = useMemo(() => {
    let list = batches.map(b => ({ ...b, status: batchStatus(b.expiryDate), daysLeft: daysUntil(b.expiryDate) }));
    if (filterStatus !== "todos") list = list.filter(b => b.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => b.productName.toLowerCase().includes(q) || b.lote.toLowerCase().includes(q) || b.supplierName.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "expiryDate") cmp = a.expiryDate.localeCompare(b.expiryDate);
      else if (sortField === "productName") cmp = a.productName.localeCompare(b.productName);
      else cmp = a.quantity - b.quantity;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [batches, search, filterStatus, sortField, sortDir]);

  const stats = useMemo(() => ({
    total: batches.length,
    vigente: batches.filter(b => batchStatus(b.expiryDate) === "vigente").length,
    por_vencer: batches.filter(b => batchStatus(b.expiryDate) === "por-vencer").length,
    critico: batches.filter(b => batchStatus(b.expiryDate) === "critico").length,
    vencido: batches.filter(b => batchStatus(b.expiryDate) === "vencido").length,
  }), [batches]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function handleEdit(b: Batch) {
    setEditingId(b.id);
    setForm({
      lote: b.lote,
      productName: b.productName,
      productId: b.productId != null ? String(b.productId) : "",
      productCategory: b.productCategory,
      quantity: String(b.quantity),
      unit: b.unit,
      supplierName: b.supplierName || "",
      warehouseId: b.warehouseId || "",
      entryDate: b.entryDate ? b.entryDate.slice(0, 10) : today,
      expiryDate: b.expiryDate ? b.expiryDate.slice(0, 10) : "",
      costUnit: b.costUnit != null ? String(b.costUnit) : "",
      notes: b.notes || "",
    });
    setShowForm(true);
    setTimeout(() => document.getElementById("batch-form-top")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function handleAdd() {
    if (!form.lote.trim() || !form.productName.trim() || !form.expiryDate) return;
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          lote: form.lote.trim(),
          productName: form.productName.trim(),
          ...(form.productId ? { productId: Number(form.productId) } : {}),
          productCategory: form.productCategory,
          quantity: parseFloat(form.quantity) || 0,
          unit: form.unit,
          supplierName: form.supplierName.trim(),
          ...(form.warehouseId ? { warehouseId: form.warehouseId } : {}),
          entryDate: new Date(form.entryDate || today).toISOString(),
          expiryDate: new Date(form.expiryDate).toISOString(),
          costUnit: parseFloat(form.costUnit) || 0,
          notes: form.notes.trim(),
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setBatches(prev => [created, ...prev]);
        toast.success("Lote registrado");
      } else { toast.error("Error al registrar el lote"); }
    } catch { toast.error("Error al registrar el lote"); }
    setEditingId(null);
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
  }

  async function handleSave() {
    if (!editingId) { handleAdd(); return; }
    if (!form.lote.trim() || !form.productName.trim() || !form.expiryDate) return;
    try {
      const res = await fetch(`/api/batches?id=${editingId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          lote: form.lote.trim(),
          productName: form.productName.trim(),
          ...(form.productId ? { productId: Number(form.productId) } : {}),
          productCategory: form.productCategory,
          quantity: parseFloat(form.quantity) || 0,
          unit: form.unit,
          supplierName: form.supplierName.trim(),
          ...(form.warehouseId ? { warehouseId: form.warehouseId } : {}),
          entryDate: new Date(form.entryDate || today).toISOString(),
          expiryDate: new Date(form.expiryDate).toISOString(),
          costUnit: parseFloat(form.costUnit) || 0,
          notes: form.notes.trim(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setBatches(prev => prev.map(b => b.id === editingId ? updated : b));
        toast.success("Lote actualizado");
      } else { toast.error("Error al actualizar el lote"); }
    } catch { toast.error("Error al actualizar el lote"); }
    setEditingId(null);
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
  }

  async function handleDelete(id: string) {
    setBatches(prev => prev.filter(b => b.id !== id));
    try {
      await fetch(`/api/batches?id=${id}`, { method: "DELETE" });
      toast.success("Lote eliminado");
    } catch { toast.error("Error al eliminar el lote"); }
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Package className="h-6 w-6 text-primary" /> Lotes & Vencimientos <ModuleTooltip />
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Control FIFO de lotes, fechas de caducidad y alertas de vencimiento</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => exportToCSV(processed.map(b => ({ lote: b.lote, producto: b.productName, categoria: b.productCategory, cantidad: b.quantity, unidad: b.unit, proveedor: b.supplierName, ingreso: b.entryDate, vencimiento: b.expiryDate, dias_restantes: b.daysLeft, estado: b.status, costo_unit: b.costUnit })), "lotes-vencimientos")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM }); setShowForm(v => !v); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Registrar lote
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total lotes", count: stats.total, color: "text-[var(--text-primary)] dark:text-foreground", bg: "bg-gray-50 dark:bg-surface/50" },
          { label: "Vigentes", count: stats.vigente, color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Por vencer", count: stats.por_vencer, color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Críticos (≤7d)", count: stats.critico, color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-orange-950/30" },
          { label: "Vencidos", count: stats.vencido, color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30" },
        ].map(({ label, count, color, bg }) => (
          <button key={label} onClick={() => setFilterStatus(filterStatus === label.toLowerCase().replace("críticos (≤7d)", "critico").replace("por vencer", "por-vencer") as BatchStatus | "todos" ? "todos" : "todos")} className={cn("rounded-xl p-4 text-left", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", color)}>{count}</p>
          </button>
        ))}
      </div>

      {/* Alerts banner */}
      {(stats.critico > 0 || stats.vencido > 0) && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-sm">Acción requerida</p>
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-0.5">
              {stats.vencido > 0 && <span>{stats.vencido} lote(s) <strong>vencido(s)</strong> — retirar del inventario inmediatamente. </span>}
              {stats.critico > 0 && <span>{stats.critico} lote(s) vence(n) en ≤7 días — priorizar rotación FIFO.</span>}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div id="batch-form-top" className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm flex flex-wrap items-center gap-2">{editingId ? <><Pencil className="h-4 w-4 text-primary" /> Editar lote</> : <><Plus className="h-4 w-4 text-primary" /> Registrar nuevo lote</>}</CardTitle>
            <button onClick={() => { setEditingId(null); setShowForm(false); setForm({ ...EMPTY_FORM }); }}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Nº Lote *" value={form.lote} onChange={v => setForm(p => ({ ...p, lote: v }))} placeholder="L2026-XXX" />
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Producto *</label>
              {products.length > 0 ? (
                <select
                  value={form.productId}
                  onChange={e => {
                    const sel = products.find(p => String(p.id) === e.target.value);
                    setForm(p => ({ ...p, productId: e.target.value, productName: sel?.name ?? p.productName, productCategory: sel?.category ?? p.productCategory }));
                  }}
                  className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground"
                >
                  <option value="">Seleccionar producto...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <input type="text" value={form.productName} onChange={e => setForm(p => ({ ...p, productName: e.target.value }))} placeholder="Nombre del producto" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Categoría</label>
              <select value={form.productCategory} onChange={e => setForm(p => ({ ...p, productCategory: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Field label="Proveedor" value={form.supplierName} onChange={v => setForm(p => ({ ...p, supplierName: v }))} placeholder="Nombre proveedor" />
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Almacén</label>
              <select value={form.warehouseId} onChange={e => setForm(p => ({ ...p, warehouseId: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                <option value="">Sin almacén asignado</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <Field label="Cantidad" value={form.quantity} onChange={v => setForm(p => ({ ...p, quantity: v }))} type="number" placeholder="0" />
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Unidad</label>
              <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                {["unidad", "kg", "litro", "caja", "bolsa", "saco", "lata", "botella", "pack"].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <Field label="Fecha ingreso" value={form.entryDate} onChange={v => setForm(p => ({ ...p, entryDate: v }))} type="date" />
            <Field label="Fecha vencimiento *" value={form.expiryDate} onChange={v => setForm(p => ({ ...p, expiryDate: v }))} type="date" />
            <Field label="Costo unitario (S/)" value={form.costUnit} onChange={v => setForm(p => ({ ...p, costUnit: v }))} type="number" placeholder="0.00" />
            <div className="col-span-2 sm:col-span-3">
              <Field label="Observaciones" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} placeholder="Instrucciones de almacenamiento, condiciones..." />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => { setEditingId(null); setShowForm(false); setForm({ ...EMPTY_FORM }); }} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted">Cancelar</button>
            <button onClick={handleSave} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90">{editingId ? "Guardar cambios" : "Registrar lote"}</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto, lote, proveedor..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["todos", "vigente", "por-vencer", "critico", "vencido"] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize", filterStatus === s ? "bg-primary text-white" : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
              {s === "todos" ? "Todos" : s === "por-vencer" ? "Por vencer" : s === "critico" ? "Crítico" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden animate-pulse">
          <div className="h-10 bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 px-2 sm:px-4 py-2 sm:py-3.5 border-b border-[var(--rule-soft)] dark:border-card-border last:border-0">
              <div className="h-5 w-16 bg-gray-200 dark:bg-surface rounded-full" />
              <div className="h-3.5 w-20 bg-gray-200 dark:bg-surface rounded-full" />
              <div className="h-3.5 flex-1 bg-gray-100 dark:bg-surface/60 rounded-full" />
              <div className="h-3.5 w-16 bg-gray-100 dark:bg-surface/60 rounded-full" />
              <div className="h-3.5 w-12 bg-gray-100 dark:bg-surface/60 rounded-full" />
              <div className="h-3.5 w-24 bg-gray-100 dark:bg-surface/60 rounded-full" />
              <div className="h-3.5 w-16 bg-gray-100 dark:bg-surface/60 rounded-full" />
              <div className="h-5 w-8 bg-gray-100 dark:bg-surface/60 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      ) : (
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Lote</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted cursor-pointer" onClick={() => toggleSort("productName")}>Producto <SortIcon field="productName" sortField={sortField} sortDir={sortDir} /></th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Categoría</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted cursor-pointer" onClick={() => toggleSort("quantity")}>Cantidad <SortIcon field="quantity" sortField={sortField} sortDir={sortDir} /></th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Proveedor</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Ingreso</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted cursor-pointer" onClick={() => toggleSort("expiryDate")}>Vencimiento <SortIcon field="expiryDate" sortField={sortField} sortDir={sortDir} /></th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Días</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Costo u.</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {processed.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-[var(--text-tertiary)] dark:text-muted text-sm">No se encontraron lotes con los filtros seleccionados.</td></tr>
              )}
              {processed.map(b => {
                const meta = STATUS_META[b.status];
                const Icon = meta.icon;
                return (
                  <tr key={b.id} className={cn("hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors", b.status === "vencido" ? "bg-[var(--data-error-50)]/30 dark:bg-red-950/10" : b.status === "critico" ? "bg-[var(--data-warning-50)]/30 dark:bg-orange-950/10" : "")}>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full", meta.bg, meta.color)}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{b.lote}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-[var(--text-primary)] dark:text-foreground max-w-40 truncate">{b.productName}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{b.productCategory}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">{b.quantity} <span className="text-xs font-normal text-[var(--text-tertiary)]">{b.unit}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted truncate max-w-30">{b.supplierName || "—"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{fmtDate(b.entryDate)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{fmtDate(b.expiryDate)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <ExpiryCountdownBadge daysLeft={b.daysLeft} />
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{b.costUnit > 0 ? fmt(b.costUnit) : "—"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEdit(b)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors" title="Editar lote">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors" title="Eliminar lote">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-2 sm:px-4 py-2 sm:py-3 border-t border-[var(--rule-soft)] dark:border-card-border text-xs text-[var(--text-tertiary)] dark:text-muted">
          {processed.length} de {batches.length} lotes · FIFO recomendado: consumir primero los lotes con fecha de vencimiento más próxima
        </div>
      </div>
      )}
    </div>
  );
}

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </div>
  );
}
