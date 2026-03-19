"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Check, AlertTriangle, Download, Search, Package, Info, Loader2 } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type CountStatus = "pendiente" | "contando" | "finalizado";

type ProductRow = {
  id: number;
  name: string;
  barcode?: string;
  category: string;
  stock: number;
};

type CountItem = {
  id: number;
  product: string;
  sku: string;
  category: string;
  systemQty: number;
  countedQty: number | null;
  difference: number | null;
  location: string;
  status: CountStatus;
  saving?: boolean;
};

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-gray-400 hover:text-primary transition-colors focus:outline-none"
        aria-label="Ayuda sobre Inventario Fisico"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="pointer-events-none absolute left-6 top-0 z-50 w-80 rounded-2xl border border-gray-200 bg-white p-4 text-xs leading-relaxed shadow-xl dark:border-card-border dark:bg-card">
          <p className="mb-2 text-sm font-extrabold text-gray-900 dark:text-foreground">Inventario Fisico</p>
          <p className="mb-3 text-gray-600 dark:text-muted">Compara el stock real contado en bodega contra el stock del sistema y registra ajustes reales.</p>
          <p className="text-gray-500 dark:text-muted">Ejemplo: si el sistema dice 20 unidades y cuentas 18, al registrar el conteo se crea un ajuste y el stock queda corregido.</p>
        </div>
      )}
    </div>
  );
}

export default function PhysicalInventoryTab() {
  const [items, setItems] = useState<CountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CountStatus | "todas" | "diferencias">("todas");
  const [countInput, setCountInput] = useState<Record<number, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = sessionStorage.getItem("inv-fisico-countInput");
      return saved ? (JSON.parse(saved) as Record<number, string>) : {};
    } catch { return {}; }
  });
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; fail: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (Object.keys(countInput).length === 0) {
        sessionStorage.removeItem("inv-fisico-countInput");
      } else {
        sessionStorage.setItem("inv-fisico-countInput", JSON.stringify(countInput));
      }
    } catch { /* storage quota or private mode */ }
  }, [countInput]);

  useEffect(() => {
    let cancelled = false;
    async function loadProducts() {
      setLoading(true);
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        if (cancelled) return;
        const nextItems = Array.isArray(data)
          ? data.map((item: ProductRow) => ({
              id: Number(item.id),
              product: item.name,
              sku: item.barcode || `PROD-${String(item.id).padStart(4, "0")}`,
              category: item.category || "General",
              systemQty: Number(item.stock || 0),
              countedQty: null,
              difference: null,
              location: "Stock general",
              status: "pendiente" as CountStatus,
            }))
          : [];
        setItems(nextItems);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProducts().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (search && !item.product.toLowerCase().includes(search.toLowerCase()) && !item.sku.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter === "diferencias") return item.difference !== null && item.difference !== 0;
      if (statusFilter !== "todas" && item.status !== statusFilter) return false;
      return true;
    });
  }, [items, search, statusFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const counted = items.filter((item) => item.status === "finalizado").length;
    const withDiff = items.filter((item) => item.difference !== null && item.difference !== 0).length;
    const totalDiff = items.reduce((sum, item) => sum + Math.abs(item.difference ?? 0), 0);
    return { total, counted, withDiff, totalDiff, pct: total === 0 ? "0" : ((counted / total) * 100).toFixed(0) };
  }, [items]);

  async function bulkSubmit() {
    const pending = items
      .filter((item) => item.status !== "finalizado" && countInput[item.id] !== undefined)
      .map((item) => ({ productId: item.id, newStock: parseInt(countInput[item.id], 10), notes: `Conteo fisico. Sistema: ${item.systemQty}, conteo: ${countInput[item.id]}`, _systemQty: item.systemQty }))
      .filter((entry) => !isNaN(entry.newStock) && entry.newStock >= 0);
    if (pending.length === 0) return;
    setBulkSubmitting(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/inventory-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk-adjust", items: pending.map(({ productId, newStock, notes }) => ({ productId, newStock, notes })) }),
      });
      if (res.ok) {
        const data = (await res.json()) as { succeeded?: number; failed?: number; succeededIds?: number[] };
        const succeeded = data.succeeded ?? pending.length;
        const failed = data.failed ?? 0;
        setBulkResult({ ok: succeeded, fail: failed });
        // Use exact succeededIds from server; fall back to all pending if legacy response
        const successIds = new Set<number>(data.succeededIds ?? pending.map((e) => e.productId));
        setItems((prev) => prev.map((item) => {
          if (!successIds.has(item.id)) return item;
          const entry = pending.find((p) => p.productId === item.id);
          if (!entry) return item;
          return { ...item, countedQty: entry.newStock, difference: entry.newStock - entry._systemQty, systemQty: entry.newStock, status: "finalizado" as CountStatus, saving: false };
        }));
        setCountInput((prev) => {
          const next = { ...prev };
          for (const id of successIds) delete next[id];
          return next;
        });
      }
    } catch { /* silent */ }
    finally { setBulkSubmitting(false); }
  }

  async function submitCount(id: number) {
    const val = parseInt(countInput[id] ?? "", 10);
    if (Number.isNaN(val) || val < 0) return;
    const currentItem = items.find((item) => item.id === id);
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, saving: true, status: "contando" } : item));
    try {
      const res = await fetch("/api/inventory-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "adjust", productId: id, newStock: val, notes: `Conteo fisico manual. Sistema: ${currentItem?.systemQty ?? 0}, conteo: ${val}` }),
      });
      if (!res.ok) throw new Error("No se pudo registrar el ajuste");
      setItems((prev) => prev.map((item) => item.id === id ? { ...item, countedQty: val, difference: val - item.systemQty, systemQty: val, status: "finalizado", saving: false } : item));
      setCountInput((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      setItems((prev) => prev.map((item) => item.id === id ? { ...item, saving: false, status: "pendiente" } : item));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-gray-900 dark:text-foreground">
            <ClipboardList className="h-6 w-6 text-violet-500" /> Inventario Fisico <ModuleTooltip />
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-muted">Conteo fisico y conciliacion de stock</p>
        </div>
        <div className="flex items-center gap-2">
          {bulkResult && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {bulkResult.ok} registrado{bulkResult.ok !== 1 ? "s" : ""}{bulkResult.fail > 0 ? `, ${bulkResult.fail} con error` : ""}
            </span>
          )}
          <button
            onClick={() => bulkSubmit()}
            disabled={bulkSubmitting || Object.keys(countInput).length === 0}
            className="flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50"
          >
            {bulkSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Registrar todos ({Object.keys(countInput).length})
          </button>
          <button onClick={() => exportToCSV(items.map((item) => ({ Producto: item.product, SKU: item.sku, Ubicacion: item.location, Sistema: item.systemQty, Conteo: item.countedQty ?? "", Diferencia: item.difference ?? "", Estado: item.status })), "inventario-fisico")} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary/90">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-card-border dark:bg-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-900 dark:text-foreground">Progreso del Conteo</span>
          <span className="text-sm font-extrabold text-violet-600 dark:text-violet-400">{stats.pct}%</span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${stats.pct}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div><p className="text-xs font-semibold text-gray-500 dark:text-muted">Total Productos</p><p className="text-xl font-extrabold text-gray-900 dark:text-foreground">{stats.total}</p></div>
          <div><p className="text-xs font-semibold text-gray-500 dark:text-muted">Contados</p><p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.counted}</p></div>
          <div><p className="text-xs font-semibold text-gray-500 dark:text-muted">Con Diferencias</p><p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{stats.withDiff}</p></div>
          <div><p className="text-xs font-semibold text-gray-500 dark:text-muted">Unidades con ajuste</p><p className="text-xl font-extrabold text-red-600 dark:text-red-400">{stats.totalDiff}</p></div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto o SKU..." className="w-full rounded-xl border-2 border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary dark:border-card-border dark:bg-card" />
        </div>
        {(["todas", "pendiente", "contando", "finalizado", "diferencias"] as const).map((status) => (
          <button key={status} onClick={() => setStatusFilter(status)} className={cn("rounded-xl px-4 py-2.5 text-sm font-bold transition-colors", statusFilter === status ? "bg-violet-500 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-card-border dark:bg-card dark:text-muted dark:hover:bg-accent")}>
            {status === "todas" ? "Todos" : status === "diferencias" ? "Diferencias" : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-card-border dark:bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left dark:bg-surface">
                <th className="px-5 py-3 font-bold text-gray-500 dark:text-muted">Producto</th>
                <th className="px-5 py-3 font-bold text-gray-500 dark:text-muted">SKU</th>
                <th className="px-5 py-3 font-bold text-gray-500 dark:text-muted">Ubicacion</th>
                <th className="px-5 py-3 text-right font-bold text-gray-500 dark:text-muted">Sistema</th>
                <th className="px-5 py-3 text-right font-bold text-gray-500 dark:text-muted">Conteo</th>
                <th className="px-5 py-3 text-right font-bold text-gray-500 dark:text-muted">Diferencia</th>
                <th className="px-5 py-3 text-center font-bold text-gray-500 dark:text-muted">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400 dark:text-muted"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Cargando productos...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400 dark:text-muted">No hay productos con los filtros actuales.</td>
                </tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id} className={cn("hover:bg-gray-50 dark:hover:bg-surface", item.difference !== null && item.difference !== 0 && "bg-amber-50/50 dark:bg-amber-950/5")}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="font-bold text-gray-900 dark:text-foreground">{item.product}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-muted">{item.sku}</td>
                  <td className="px-5 py-3 font-mono text-gray-500 dark:text-muted">{item.location}</td>
                  <td className="px-5 py-3 text-right font-bold">{item.systemQty}</td>
                  <td className="px-5 py-3 text-right">
                    {item.status === "finalizado" ? (
                      <span className="font-bold">{item.countedQty}</span>
                    ) : (
                      <input type="number" min={0} value={countInput[item.id] ?? ""} onChange={(event) => setCountInput((prev) => ({ ...prev, [item.id]: event.target.value }))} placeholder="-" className="w-20 rounded-lg border-2 border-gray-200 bg-white px-2 py-1 text-right text-sm font-bold outline-none focus:border-violet-500 dark:border-card-border dark:bg-card" />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {item.difference !== null ? (
                      <span className={cn("font-extrabold", item.difference === 0 ? "text-emerald-600" : item.difference > 0 ? "text-blue-600" : "text-red-600")}>
                        {item.difference === 0 ? <Check className="inline h-4 w-4" /> : item.difference > 0 ? `+${item.difference}` : item.difference}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {item.status !== "finalizado" && (
                      <button onClick={() => submitCount(item.id)} disabled={!countInput[item.id] || item.saving} className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-violet-600 disabled:opacity-40">
                        {item.saving ? "Guardando..." : "Registrar"}
                      </button>
                    )}
                    {item.status === "finalizado" && item.difference !== 0 && (
                      <span className="inline-flex items-center justify-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> Revisar
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {stats.withDiff > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <h3 className="text-sm font-extrabold text-amber-800 dark:text-amber-300">Diferencias Detectadas</h3>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">Se encontraron <strong>{stats.withDiff} productos</strong> con diferencias entre el sistema y el conteo fisico. Revisa esas lineas para validar el ajuste.</p>
          </div>
        </div>
      )}
    </div>
  );
}