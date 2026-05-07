"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { TableSkeleton, type MarketplaceProduct } from "../types";

// ── Tipos y constantes locales ──────────────────────────────────────────────

type ProductFilter = "all" | "active" | "inactive" | "no-image" | "no-desc" | "no-stock" | "low-stock";

const FILTER_DEFS: Array<{ id: ProductFilter; label: string; predicate: (p: MarketplaceProduct) => boolean }> = [
  { id: "all",       label: "Todos",            predicate: () => true },
  { id: "active",    label: "Publicados",       predicate: (p) => p.isActive },
  { id: "inactive",  label: "Borradores",       predicate: (p) => !p.isActive },
  { id: "no-image",  label: "Sin foto",         predicate: (p) => !p.image },
  { id: "no-desc",   label: "Sin descripción",  predicate: (p) => !p.description || p.description.trim().length < 10 },
  { id: "low-stock", label: "Stock bajo",       predicate: (p) => p.stock > 0 && p.stock <= 5 },
  { id: "no-stock",  label: "Sin stock",        predicate: (p) => p.stock <= 0 },
];

/** % de campos completados (0-100). Pesa: foto 30, desc 25, stock 25, precio retail 20. */
function completenessScore(p: MarketplaceProduct): number {
  let s = 0;
  if (p.image) s += 30;
  if (p.description && p.description.trim().length >= 10) s += 25;
  if (p.stock > 0) s += 25;
  if (p.retailPrice > 0) s += 20;
  return s;
}

function CompletenessBadge({ product }: { product: MarketplaceProduct }) {
  const score = completenessScore(product);
  const issues: string[] = [];
  if (!product.image) issues.push("Sin foto");
  if (!product.description || product.description.trim().length < 10) issues.push("Sin descripción");
  if (product.stock <= 0) issues.push("Sin stock");
  if (product.retailPrice <= 0) issues.push("Sin precio");

  const tone = score >= 90
    ? { ring: "bg-[var(--accent-soft)] text-[var(--data-success-500)]", icon: CheckCircle }
    : score >= 60
    ? { ring: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", icon: AlertCircle }
    : { ring: "bg-[var(--data-error-100)] text-[var(--data-error-500)]", icon: AlertCircle };
  const Icon = tone.icon;

  return (
    <span
      title={issues.length ? `${score}% — ${issues.join(", ")}` : `${score}% completo`}
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold", tone.ring)}
    >
      <Icon className="h-3 w-3" />
      {score}%
    </span>
  );
}

/** Input numérico para edición inline; Enter guarda, Esc cancela. */
function InlineNumberCell({
  value,
  onCommit,
  prefix,
  ariaLabel,
}: {
  value: number;
  onCommit: (next: number) => Promise<void> | void;
  prefix?: string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(String(value));
  const [busy, setBusy]       = useState(false);

  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);

  const commit = async () => {
    const n = parseFloat(draft);
    if (Number.isNaN(n) || n < 0) { setDraft(String(value)); setEditing(false); return; }
    if (n === value) { setEditing(false); return; }
    setBusy(true);
    try {
      await onCommit(n);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--surface-sunken)] transition-colors font-semibold text-[var(--text-primary)] cursor-text"
        aria-label={`Editar ${ariaLabel}`}>
        {prefix}{value.toFixed(2)}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {prefix && <span className="text-xs text-[var(--text-tertiary)]">{prefix}</span>}
      <input
        autoFocus type="number" min={0} step={0.1} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
        disabled={busy} aria-label={ariaLabel}
        className="w-20 px-2 py-1 rounded-md border border-primary/40 bg-white text-sm text-right outline-none focus:ring-2 focus:ring-primary/30"
      />
      {busy && <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
    </span>
  );
}

// ─────────────────────────────────────────────
// ProductosTab
// ─────────────────────────────────────────────
export default function ProductosTab() {
  const [products, setProducts]   = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [toggling, setToggling]   = useState<string | null>(null);
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [filter, setFilter]       = useState<ProductFilter>("all");
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [bulking, setBulking]     = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/marketplace/stores/my/products")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudieron cargar los productos del marketplace."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stores/my/sync", {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!res.ok) throw new Error("Error al sincronizar");
      const data = await res.json();
      const d = data.data;
      setSyncResult(`${d.created} nuevos · ${d.updated} reactivados · ${d.deactivated} desactivados`);
      load();
      setTimeout(() => setSyncResult(null), 5000);
    } catch {
      setError("Error al sincronizar inventario. Intenta nuevamente.");
    } finally {
      setSyncing(false);
    }
  };

  const patchProduct = useCallback(
    async (productId: string, patch: { isActive?: boolean; retailPrice?: number; wholesalePrice?: number }) => {
      const res = await fetch(`/api/marketplace/stores/my/products/${productId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("patch failed");
      return res.json();
    }, [],
  );

  const toggleActive = async (product: MarketplaceProduct) => {
    setToggling(product.id);
    try {
      await patchProduct(product.id, { isActive: !product.isActive });
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, isActive: !p.isActive } : p)));
    } catch {
      setError("Error al actualizar el producto.");
    } finally {
      setToggling(null);
    }
  };

  const updatePrice = async (productId: string, field: "retailPrice" | "wholesalePrice", value: number) => {
    try {
      await patchProduct(productId, { [field]: value });
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, [field]: value } : p)));
    } catch {
      setError("No se pudo actualizar el precio. Intenta nuevamente.");
    }
  };

  const bulkSetActive = async (active: boolean) => {
    if (selected.size === 0) return;
    setBulking(true);
    setError(null);
    const ids = Array.from(selected);
    try {
      const results = await Promise.allSettled(ids.map((id) => patchProduct(id, { isActive: active })));
      const failed = results.filter((r) => r.status === "rejected").length;
      setProducts((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, isActive: active } : p)));
      setSelected(new Set());
      if (failed > 0) setError(`${failed} productos no se pudieron actualizar.`);
    } finally {
      setBulking(false);
    }
  };

  const filtered = products.filter((p) => {
    const filterDef = FILTER_DEFS.find((f) => f.id === filter);
    if (filterDef && !filterDef.predicate(p)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !(p.category ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = FILTER_DEFS.reduce<Record<ProductFilter, number>>((acc, f) => {
    acc[f.id] = products.filter(f.predicate).length;
    return acc;
  }, { all: 0, active: 0, inactive: 0, "no-image": 0, "no-desc": 0, "no-stock": 0, "low-stock": 0 });

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selected);
      filtered.forEach((p) => next.delete(p.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((p) => next.add(p.id));
      setSelected(next);
    }
  };
  const toggleSelectOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{products.length}</strong> producto{products.length !== 1 ? "s" : ""} en tu marketplace
          {filter !== "all" || search.trim() ? (
            <> · <strong className="text-[var(--text-primary)]">{filtered.length}</strong> visibles</>
          ) : null}
        </p>
        <button onClick={handleSync} disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50">
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          {syncing ? "Sincronizando..." : "Sincronizar inventario"}
        </button>
      </div>

      {syncResult && (
        <div className="flex items-center gap-2 p-3 bg-[var(--accent-soft)] border border-[var(--data-success-500)]/30 rounded-xl text-sm text-[var(--data-success-500)]">
          <CheckCircle className="h-4 w-4 shrink-0" /> {syncResult}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* Filtros + búsqueda */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_DEFS.map((f) => {
            const isActive = filter === f.id;
            const count = counts[f.id];
            const hasIssues = ["no-image", "no-desc", "no-stock", "low-stock"].includes(f.id);
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                  isActive ? "bg-primary text-white"
                    : hasIssues && count > 0 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] hover:brightness-95"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-base)]"
                )}>
                {f.label}
                <span className={cn("inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[length:var(--ts-2xs)] font-bold", isActive ? "bg-white/20" : "bg-white")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="sm:ml-auto relative">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU o categoría…"
            className="w-full sm:w-72 pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          <Eye className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/30">
          <p className="text-sm font-semibold text-primary">
            {selected.size} producto{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => bulkSetActive(true)} disabled={bulking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-success-500)] text-white text-xs font-bold hover:brightness-95 transition disabled:opacity-50">
              <Eye className="h-3.5 w-3.5" /> Publicar
            </button>
            <button onClick={() => bulkSetActive(false)} disabled={bulking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--text-secondary)] text-white text-xs font-bold hover:brightness-95 transition disabled:opacity-50">
              <EyeOff className="h-3.5 w-3.5" /> Despublicar
            </button>
            <button onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[var(--text-secondary)] text-xs hover:bg-white">
              <X className="h-3.5 w-3.5" /> Limpiar
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">
            {products.length === 0 ? "Sin productos publicados" : "Sin resultados con este filtro"}
          </p>
          <p className="text-xs mt-1">
            {products.length === 0
              ? "Activa productos desde tu catálogo para mostrarlos en el marketplace."
              : "Cambia el filtro o limpia la búsqueda."}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                      aria-label="Seleccionar todo" className="h-4 w-4 rounded accent-primary cursor-pointer" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Producto</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Salud</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Precio retail</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Mayorista</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Stock</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Publicado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((p) => {
                  const isSelected = selected.has(p.id);
                  return (
                    <tr key={p.id} className={cn("transition-colors", isSelected ? "bg-primary/5" : "hover:bg-[var(--surface-sunken)]")}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(p.id)}
                          aria-label={`Seleccionar ${p.name}`} className="h-4 w-4 rounded accent-primary cursor-pointer" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-[var(--surface-sunken)] overflow-hidden flex items-center justify-center shrink-0">
                            {p.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.image} alt={p.name} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                            ) : (
                              <Package className="h-4 w-4 text-[var(--text-tertiary)]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--text-primary)] truncate">{p.name}</p>
                            <p className="text-xs text-[var(--text-tertiary)] font-mono truncate">
                              {p.sku || "sin SKU"}{p.category && <span> · {p.category}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center"><CompletenessBadge product={p} /></td>
                      <td className="px-4 py-3 text-right">
                        <InlineNumberCell value={p.retailPrice} onCommit={(n) => updatePrice(p.id, "retailPrice", n)} prefix="S/" ariaLabel={`Precio retail de ${p.name}`} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <InlineNumberCell value={p.wholesalePrice} onCommit={(n) => updatePrice(p.id, "wholesalePrice", n)} prefix="S/" ariaLabel={`Precio mayorista de ${p.name}`} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold",
                          p.stock > 10 ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                            : p.stock > 0 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                            : "bg-[var(--data-error-100)] text-[var(--data-error-500)]")}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleActive(p)} disabled={toggling === p.id}
                          title={p.isActive ? "Despublicar del marketplace" : "Publicar en marketplace"}
                          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-w-25 justify-center",
                            p.isActive ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] hover:bg-[var(--accent-soft)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-base)]")}>
                          {toggling === p.id
                            ? <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            : p.isActive ? <><Eye className="h-3.5 w-3.5" /> Publicado</> : <><EyeOff className="h-3.5 w-3.5" /> Inactivo</>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
