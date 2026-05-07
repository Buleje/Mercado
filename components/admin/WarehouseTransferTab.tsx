"use client";

import { SectionTitle } from "@buleje/design-system";
import { useEffect, useMemo, useState } from "react";
import { Truck, Plus, Download, Search, Trash2, Info, Loader2 } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import type { Product } from "@/types/erp";
import { csrfHeaders } from "@/lib/csrf-client";

type TransferStatus = "pendiente" | "en-transito" | "recibido" | "cancelado";

type Warehouse = { id: string; name: string };
type Transfer = {
  id: string;
  code: string;
  fromWarehouseId: string;
  from: string;
  toWarehouseId: string;
  to: string;
  status: TransferStatus;
  items: { product: string; qty: number; unit: string }[];
  productId: number;
  requestedBy: string;
  requestDate: string;
  deliveredDate: string | null;
  notes: string;
};

const STATUS_CONFIG: Record<TransferStatus, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]" },
  "en-transito": { label: "En Transito", color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  recibido: { label: "Recibido", color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  cancelado: { label: "Cancelado", color: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]" },
};

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda sobre Transferencias">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="pointer-events-none absolute left-6 top-0 z-50 w-80 rounded-xl border border-[var(--rule-base)] bg-white p-4 text-xs leading-relaxed dark:border-card-border dark:bg-card">
          <p className="mb-2 text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">Transferencias entre almacenes</p>
          <p className="mb-3 text-[var(--text-secondary)] dark:text-muted">Registra pedidos de traslado entre un almacen origen y otro destino, con seguimiento por estado.</p>
          <p className="text-[var(--text-secondary)] dark:text-muted">Ejemplo: pasas 12 gaseosas del Almacen Principal al Punto de Venta y queda trazado quien lo pidio y cuando se recibio.</p>
        </div>
      )}
    </div>
  );
}

export default function WarehouseTransferTab() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TransferStatus | "todas">("todas");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fromWarehouseId: "", toWarehouseId: "", productId: "", qty: "", notes: "", requestedBy: "Almacenero" });

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const [transfersRes, warehousesRes, productsRes] = await Promise.all([fetch("/api/transfers"), fetch("/api/admin/warehouses"), fetch("/api/products")]);
        const [transfersData, warehousesData, productsData] = await Promise.all([transfersRes.json(), warehousesRes.json(), productsRes.json()]);
        if (cancelled) return;
        setTransfers(Array.isArray(transfersData) ? transfersData : []);
        const nextWarehouses = Array.isArray(warehousesData) ? warehousesData : [];
        setWarehouses(nextWarehouses);
        setProducts(Array.isArray(productsData) ? productsData : []);
        setForm((prev) => ({ ...prev, fromWarehouseId: prev.fromWarehouseId || nextWarehouses[0]?.id || "", toWarehouseId: prev.toWarehouseId || nextWarehouses[1]?.id || nextWarehouses[0]?.id || "" }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return transfers.filter((transfer) => {
      if (statusFilter !== "todas" && transfer.status !== statusFilter) return false;
      if (search && !transfer.code.toLowerCase().includes(search.toLowerCase()) && !transfer.items.some((item) => item.product.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [transfers, statusFilter, search]);

  async function addTransfer() {
    if (!form.productId || !form.qty || !form.requestedBy || form.fromWarehouseId === form.toWarehouseId) return;
    setSaving(true);
    try {
      const product = products.find((item) => item.id === Number(form.productId));
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          fromWarehouseId: form.fromWarehouseId,
          toWarehouseId: form.toWarehouseId,
          productId: Number(form.productId),
          quantity: Number(form.qty),
          unit: product?.unit || "und",
          requestedBy: form.requestedBy,
          notes: form.notes,
        }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created?.error || "No se pudo registrar la transferencia");
      setTransfers((prev) => [created, ...prev]);
      setForm((prev) => ({ ...prev, productId: "", qty: "", notes: "", requestedBy: "Almacenero" }));
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: TransferStatus) {
    const res = await fetch("/api/transfers", {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, status }),
    });
    const updated = await res.json();
    if (!res.ok) return;
    setTransfers((prev) => prev.map((transfer) => transfer.id === id ? updated : transfer));
  }

  async function deleteTransfer(id: string) {
    const res = await fetch(`/api/transfers?id=${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setTransfers((prev) => prev.filter((transfer) => transfer.id !== id));
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionTitle className="flex flex-wrap items-center gap-2 text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">
            <Truck className="h-6 w-6 text-[var(--data-success-500)]" /> Transferencias entre Almacenes <ModuleTooltip />
          </SectionTitle>
          <p className="mt-1 text-sm text-[var(--text-secondary)] dark:text-muted">Gestiona movimientos de stock entre ubicaciones con persistencia real</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => exportToCSV(transfers.map((transfer) => ({ Codigo: transfer.code, Desde: transfer.from, Hacia: transfer.to, Estado: transfer.status, Items: transfer.items.map((item) => `${item.product}x${item.qty}`).join("; "), Fecha: transfer.requestDate })), "transferencias")} className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-[var(--rule-base)] bg-white px-2 sm:px-4 py-1.5 sm:py-2.5 text-sm font-bold transition-colors hover:bg-gray-50 dark:border-card-border dark:bg-card dark:hover:bg-accent">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowForm((prev) => !prev)} className="flex flex-wrap items-center gap-2 rounded-lg bg-primary px-2 sm:px-4 py-1.5 sm:py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Nueva Transferencia
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-5 dark:border-card-border dark:bg-card">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <select value={form.fromWarehouseId} onChange={(event) => setForm((prev) => ({ ...prev, fromWarehouseId: event.target.value }))} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface">
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
            <select value={form.toWarehouseId} onChange={(event) => setForm((prev) => ({ ...prev, toWarehouseId: event.target.value }))} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface">
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
            <select value={form.productId} onChange={(event) => setForm((prev) => ({ ...prev, productId: event.target.value }))} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface">
              <option value="">Selecciona producto</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <input value={form.qty} onChange={(event) => setForm((prev) => ({ ...prev, qty: event.target.value }))} type="number" min={1} placeholder="Cantidad" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
            <input value={form.requestedBy} onChange={(event) => setForm((prev) => ({ ...prev, requestedBy: event.target.value }))} placeholder="Solicitado por" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
            <input value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notas" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
          </div>
          <button onClick={addTransfer} disabled={saving} className="mt-4 rounded-lg bg-primary px-2 sm:px-4 py-1.5 sm:py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50">{saving ? "Guardando..." : "Registrar transferencia"}</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar codigo o producto..." className="w-full rounded-lg border border-[var(--rule-base)] bg-white py-2.5 pl-10 pr-4 text-sm dark:border-card-border dark:bg-card" />
        </div>
        {(["todas", "pendiente", "en-transito", "recibido", "cancelado"] as const).map((status) => (
          <button key={status} onClick={() => setStatusFilter(status)} className={cn("rounded-lg px-2 sm:px-4 py-1.5 sm:py-2.5 text-sm font-bold transition-colors", statusFilter === status ? "bg-primary text-white" : "border border-[var(--rule-base)] bg-white text-[var(--text-secondary)] dark:border-card-border dark:bg-card dark:text-muted")}>
            {status === "todas" ? "Todas" : STATUS_CONFIG[status].label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-white dark:border-card-border dark:bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface">
              <tr>
                <th className="px-5 py-3 text-left font-bold text-[var(--text-secondary)] dark:text-muted">Codigo</th>
                <th className="px-5 py-3 text-left font-bold text-[var(--text-secondary)] dark:text-muted">Ruta</th>
                <th className="px-5 py-3 text-left font-bold text-[var(--text-secondary)] dark:text-muted">Items</th>
                <th className="px-5 py-3 text-left font-bold text-[var(--text-secondary)] dark:text-muted">Estado</th>
                <th className="px-5 py-3 text-left font-bold text-[var(--text-secondary)] dark:text-muted">Solicitado por</th>
                <th className="px-5 py-3 text-left font-bold text-[var(--text-secondary)] dark:text-muted">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {loading && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--text-tertiary)] dark:text-muted"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Cargando transferencias...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--text-tertiary)] dark:text-muted">No hay transferencias registradas.</td></tr>}
              {filtered.map((transfer) => (
                <tr key={transfer.id} className="hover:bg-gray-50 dark:hover:bg-surface">
                  <td className="px-5 py-3 font-mono text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{transfer.code}</td>
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{transfer.from}</p>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">hacia {transfer.to}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)] dark:text-muted">{transfer.items.map((item) => `${item.product} x${item.qty} ${item.unit}`).join(", ")}</td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", STATUS_CONFIG[transfer.status].color)}>{STATUS_CONFIG[transfer.status].label}</span>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)] dark:text-muted">{transfer.requestedBy}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {(["pendiente", "en-transito", "recibido", "cancelado"] as TransferStatus[]).map((status) => (
                        <button key={status} onClick={() => updateStatus(transfer.id, status)} className="rounded-lg border border-[var(--rule-base)] px-2 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] hover:bg-gray-50 dark:border-card-border dark:text-muted dark:hover:bg-accent">
                          {STATUS_CONFIG[status].label}
                        </button>
                      ))}
                      <button onClick={() => deleteTransfer(transfer.id)} className="rounded-lg border border-[var(--data-error-500)] p-2 text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:border-[var(--data-error-500)]/40 dark:hover:bg-red-950/20">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}