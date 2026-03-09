﻿"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  Package, AlertTriangle, ArrowUp, ArrowDown, RefreshCw,
  Search, Loader2, ClipboardList, Plus, Pencil, Trash2,
  ScanBarcode, X,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { categories } from "@/data/products";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import type { DbProduct, DbInventoryMovement } from "@/lib/jsondb";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

type View = "productos" | "stock" | "movimientos";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const MOVEMENT_LABELS: Record<string, { label: string; color: string }> = {
  compra: { label: "Compra", color: "text-blue-600 bg-blue-50" },
  venta: { label: "Venta", color: "text-orange-600 bg-orange-50" },
  venta_online: { label: "Venta online", color: "text-purple-600 bg-purple-50" },
  devolucion: { label: "Devolución", color: "text-cyan-600 bg-cyan-50" },
  ajuste_positivo: { label: "Ajuste +", color: "text-emerald-600 bg-emerald-50" },
  ajuste_negativo: { label: "Ajuste −", color: "text-red-600 bg-red-50" },
  merma: { label: "Merma", color: "text-gray-600 dark:text-muted bg-gray-100 dark:bg-accent" },
};

const realCategories = categories.filter(c => c.id !== "todos");

// ── Component ────────────────────────────────────────────────────────────────

export default function InventoryTab() {
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [movements, setMovements] = useState<DbInventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("productos");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todos");
  const [lowOnly, setLowOnly] = useState(false);

  // Product CRUD state
  const [editModalProduct, setEditModalProduct] = useState<DbProduct | null>(null);
  const [editForm, setEditForm] = useState<Partial<DbProduct>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const EMPTY_ADD = { name: "", category: "abarrotes", price: "", unit: "und", badge: "", image: "", barcode: "", costPrice: "", stock: "", stockMin: "", stockMax: "" };
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [showScanner, setShowScanner] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);

  // National DB search
  const [dbQuery, setDbQuery] = useState("");
  const [dbResults, setDbResults] = useState<Array<{ name: string; brand: string; barcode: string; image: string; quantity: string; unit: string }>>([]);
  const [dbSearching, setDbSearching] = useState(false);

  useScrollLock(!!(showAdd || editModalProduct || showScanner));

  const handleDbSearch = async () => {
    if (!dbQuery.trim()) return;
    setDbSearching(true);
    try {
      const res = await fetch(`/api/product-search?q=${encodeURIComponent(dbQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setDbResults(data.products ?? []);
      }
    } catch { /* ignore */ }
    setDbSearching(false);
  };

  const applyDbResult = (r: { name: string; brand: string; barcode: string; image: string; quantity: string; unit: string }) => {
    setAddForm(f => ({
      ...f,
      name: r.name || f.name,
      barcode: r.barcode || f.barcode,
      image: r.image || f.image,
      unit: r.unit || f.unit,
    }));
    setDbResults([]);
    setDbQuery("");
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/inventory-movements"),
      ]);
      if (pRes.ok) setProducts(await pRes.json());
      if (mRes.ok) setMovements(await mRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // ── Product CRUD ───────────────────────────────────────────────────────────

  const openEditModal = (p: DbProduct) => {
    setEditModalProduct(p);
    setEditForm({
      name: p.name, price: p.price, category: p.category, unit: p.unit,
      badge: p.badge ?? "", active: p.active, image: p.image ?? "",
      barcode: p.barcode ?? "", costPrice: p.costPrice,
      stock: p.stock, stockMin: p.stockMin, stockMax: p.stockMax,
    });
  };
  const closeEditModal = () => { setEditModalProduct(null); setEditForm({}); };

  const saveEdit = async () => {
    if (!editModalProduct) return;
    setSaving(true);
    await fetch(`/api/products/${editModalProduct.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    closeEditModal();
    load();
  };

  const toggleActive = async (p: DbProduct) => {
    await fetch(`/api/products/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  };

  const deleteProduct = async (id: number) => {
    if (!confirm("¿Eliminar este producto permanentemente?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  };

  const addProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.price) return;
    setSaving(true);
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...addForm,
        price: Number(addForm.price),
        costPrice: addForm.costPrice ? Number(addForm.costPrice) : undefined,
        badge: addForm.badge || undefined,
        barcode: addForm.barcode || undefined,
        stock: addForm.stock !== "" ? Number(addForm.stock) : undefined,
        stockMin: addForm.stockMin !== "" ? Number(addForm.stockMin) : undefined,
        stockMax: addForm.stockMax !== "" ? Number(addForm.stockMax) : undefined,
      }),
    });
    setSaving(false);
    setShowAdd(false);
    setAddForm(EMPTY_ADD);
    load();
  };

  const handleBarcodeScan = async (code: string) => {
    setShowScanner(false);
    setScanLoading(true);
    try {
      const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.found) {
        setAddForm(f => ({
          ...f,
          name: data.name || f.name,
          image: data.image || f.image,
          unit: data.unit || f.unit,
          barcode: data.barcode || code,
        }));
      } else {
        setAddForm(f => ({ ...f, barcode: code }));
      }
      setShowAdd(true);
    } catch {
      setAddForm(f => ({ ...f, barcode: code }));
      setShowAdd(true);
    }
    setScanLoading(false);
  };

  // ── Stats ──────────────────────────────────────────────────────────────────

  const isLowStock = (p: DbProduct) =>
    p.stockMin !== undefined && p.stock !== undefined && p.stock <= p.stockMin;

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.active).length;
  const lowStockCount = products.filter(isLowStock).length;
  const totalStockValue = products.reduce(
    (s, p) => s + (p.stock ?? 0) * p.price, 0
  );

  // ── Filtered ───────────────────────────────────────────────────────────────

  const filteredProducts = products.filter(p => {
    if (catFilter !== "todos" && p.category !== catFilter) return false;
    if (lowOnly && !isLowStock(p)) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q));
    }
    return true;
  });

  const filteredMovements = movements.filter(m => {
    if (search) {
      const product = products.find(p => p.id === m.productId);
      return product?.name.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Inventario</h2>
          <p className="text-sm text-gray-500 dark:text-muted flex items-center flex-wrap gap-2">
            {totalProducts} productos · {activeProducts} activos
            {lowStockCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                <AlertTriangle className="h-3 w-3" /> {lowStockCount} bajo stock
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex bg-gray-100 dark:bg-accent rounded-lg p-0.5">
            {(["productos", "stock", "movimientos"] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-bold transition-colors capitalize",
                  view === v ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
                )}
              >
                {v === "productos" ? "Productos" : v === "stock" ? "Stock" : "Movimientos"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowScanner(true)}
            disabled={scanLoading}
            className="flex items-center gap-1.5 text-sm font-bold text-primary border border-primary/30 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors"
          >
            {scanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
            {scanLoading ? "Buscando…" : "Escanear"}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dark px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" /> Nuevo
          </button>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors text-gray-500 dark:text-muted">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wider">Productos</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-foreground mt-0.5">{totalProducts}</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wider">Activos</p>
          <p className="text-xl font-extrabold text-emerald-600 mt-0.5">{activeProducts}</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wider">Bajo stock</p>
          <p className={cn("text-xl font-extrabold mt-0.5", lowStockCount > 0 ? "text-amber-600" : "text-gray-900 dark:text-foreground")}>{lowStockCount}</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wider">Valor total</p>
          <p className="text-xl font-extrabold text-primary mt-0.5">{fmt(totalStockValue)}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-45">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={view === "movimientos" ? "Buscar movimiento..." : "Buscar producto o código..."}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary transition-colors"
          />
        </div>
        {view !== "movimientos" && (
          <>
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-700 dark:text-foreground outline-none focus:border-primary"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
              ))}
            </select>
            <button
              onClick={() => setLowOnly(!lowOnly)}
              className={cn(
                "flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors",
                lowOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Bajo stock
            </button>
          </>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : view === "productos" ? (
        /* ── Products View ──────────────────────────────────────── */
        <>
          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filteredProducts.map(p => {
              const lowStock = isLowStock(p);
              const cat = categories.find(c => c.id === p.category);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "bg-white dark:bg-card border rounded-2xl p-4 shadow-sm transition-all",
                    !p.active && "opacity-60",
                    lowStock ? "border-amber-300" : "border-gray-200 dark:border-card-border"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {p.image ? (
                      <Image src={p.image} alt={p.name} width={56} height={56} className="rounded-xl object-cover border border-gray-100 dark:border-card-border shrink-0 bg-gray-50 dark:bg-surface" />
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Package className="h-6 w-6 text-primary/40" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-foreground text-sm leading-tight">{p.name}</p>
                      <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{cat?.emoji} {cat?.label ?? p.category} · {p.unit}</p>
                      <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                        <span className="font-extrabold text-primary text-base">S/{p.price.toFixed(2)}</span>
                        {p.costPrice && <span className="text-xs text-gray-400 dark:text-muted">costo S/{p.costPrice.toFixed(2)}</span>}
                        {p.badge && <span className="inline-flex px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">{p.badge}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button onClick={() => openEditModal(p)} className="p-2 rounded-xl bg-gray-50 dark:bg-surface text-gray-500 dark:text-muted hover:bg-primary/10 hover:text-primary transition-colors border border-gray-100 dark:border-card-border" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteProduct(p.id)} className="p-2 rounded-xl bg-gray-50 dark:bg-surface text-gray-500 dark:text-muted hover:bg-red-50 hover:text-red-500 transition-colors border border-gray-100 dark:border-card-border" title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-gray-100 dark:border-card-border">
                    <button
                      onClick={() => toggleActive(p)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors",
                        p.active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-gray-100 dark:bg-accent text-gray-500 dark:text-muted hover:bg-gray-200"
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", p.active ? "bg-emerald-500" : "bg-gray-400")} />
                      {p.active ? "Activo" : "Inactivo"}
                    </button>
                    {p.stock !== undefined ? (
                      <div className={cn(
                        "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold",
                        lowStock ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-600"
                      )}>
                        {lowStock && <AlertTriangle className="h-3 w-3" />}
                        Stock: {p.stock}
                        {p.stockMin !== undefined && <span className="opacity-70"> / mín {p.stockMin}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-muted italic">Sin stock</span>
                    )}
                    {p.barcode && <span className="text-xs text-gray-400 dark:text-muted font-mono ml-auto">#{p.barcode}</span>}
                  </div>
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">No hay productos</div>
            )}
          </div>

          {/* Desktop table */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-card-border text-left">
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Producto</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Categoría</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Precio</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider hidden md:table-cell">Badge</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Stock</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredProducts.map(p => {
                    const lowStock = isLowStock(p);
                    return (
                      <tr key={p.id} className={cn("hover:bg-gray-50 dark:hover:bg-surface transition-colors", !p.active && "opacity-50", lowStock && "bg-amber-50/40")}>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-foreground">{p.name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-muted">
                          {categories.find(c => c.id === p.category)?.emoji} {categories.find(c => c.id === p.category)?.label ?? p.category}
                        </td>
                        <td className="px-4 py-3 font-bold text-primary">S/{p.price.toFixed(2)}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {p.badge ? <span className="inline-flex px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">{p.badge}</span> : <span className="text-gray-300 dark:text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {p.stock !== undefined ? (
                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold", lowStock ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-600")}>
                              {lowStock && <AlertTriangle className="h-3 w-3" />}{p.stock}
                            </span>
                          ) : <span className="text-gray-300 dark:text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleActive(p)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors",
                              p.active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-gray-100 dark:bg-accent text-gray-500 dark:text-muted hover:bg-gray-200"
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", p.active ? "bg-emerald-500" : "bg-gray-400")} />
                            {p.active ? "Activo" : "Inactivo"}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditModal(p)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-primary hover:bg-primary/8 transition-colors" title="Editar">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteProduct(p.id)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredProducts.length === 0 && (
              <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">No hay productos</div>
            )}
          </div>
        </>
      ) : view === "stock" ? (
        /* ── Stock View ─────────────────────────────────────────── */
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-card-border text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Producto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Categoría</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider text-right">Stock</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider text-right hidden sm:table-cell">Mín</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider text-right hidden sm:table-cell">Máx</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredProducts.map(p => {
                  const low = isLowStock(p);
                  return (
                    <tr key={p.id} className={cn("hover:bg-gray-50 dark:hover:bg-surface transition-colors", low && "bg-amber-50/40", !p.active && "opacity-50")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.image ? (
                            <Image src={p.image} alt="" width={32} height={32} className="rounded-lg object-cover border border-gray-100 dark:border-card-border shrink-0" />
                          ) : (
                            <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-accent flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-gray-400 dark:text-muted" />
                            </div>
                          )}
                          <span className="font-semibold text-gray-900 dark:text-foreground truncate">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-muted text-xs">
                        {categories.find(c => c.id === p.category)?.emoji} {categories.find(c => c.id === p.category)?.label ?? p.category}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.stock !== undefined ? (
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                            low ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-600"
                          )}>
                            {low && <AlertTriangle className="h-3 w-3" />}
                            {p.stock}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-muted text-xs hidden sm:table-cell">{p.stockMin ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-muted text-xs hidden sm:table-cell">{p.stockMax ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-foreground text-xs">{p.stock !== undefined ? fmt(p.stock * p.price) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredProducts.length === 0 && (
            <div className="h-32 flex items-center justify-center text-gray-400 dark:text-muted text-sm">
              No se encontraron productos
            </div>
          )}
        </div>
      ) : (
        /* ── Movements View ────────────────────────────────────── */
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          {filteredMovements.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center text-gray-400 dark:text-muted">
              <ClipboardList className="h-6 w-6 mb-1" />
              <p className="text-sm">Sin movimientos de inventario</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredMovements.map(m => {
                const product = products.find(p => p.id === m.productId);
                const meta = MOVEMENT_LABELS[m.type] ?? { label: m.type, color: "text-gray-600 dark:text-muted bg-gray-50 dark:bg-surface" };
                const isPositive = ["compra", "devolucion", "ajuste_positivo"].includes(m.type);
                return (
                  <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", isPositive ? "bg-emerald-50" : "bg-red-50")}>
                      {isPositive ? <ArrowUp className="h-4 w-4 text-emerald-500" /> : <ArrowDown className="h-4 w-4 text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">{product?.name ?? `Producto #${m.productId}`}</p>
                      <p className="text-xs text-gray-400 dark:text-muted">{fmtDate(m.createdAt)}{m.notes ? ` · ${m.notes}` : ""}</p>
                    </div>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0", meta.color)}>{meta.label}</span>
                    <div className="text-right shrink-0 w-20">
                      <p className={cn("text-sm font-bold", isPositive ? "text-emerald-600" : "text-red-600")}>
                        {isPositive ? "+" : ""}{m.quantity}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-muted">{m.previousStock} → {m.newStock}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Barcode Scanner */}
      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeScan} onClose={() => setShowScanner(false)} />
      )}

      {/* ── Add product modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="bg-white dark:bg-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-y-auto max-h-[90dvh]">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-card z-10">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Agregar producto</h3>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-gray-500 dark:text-muted" />
              </button>
            </div>
            <form onSubmit={addProduct} className="p-5 space-y-5">
              {/* National product DB search */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5" /> Buscar en base nacional de productos
                </p>
                <div className="flex gap-2">
                  <input
                    value={dbQuery}
                    onChange={(e) => setDbQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleDbSearch())}
                    placeholder="Ej: arroz costeño, aceite vegetal…"
                    className="flex-1 px-3 py-2 rounded-lg border border-blue-200 bg-white dark:bg-card text-gray-900 dark:text-foreground focus:border-blue-400 outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleDbSearch}
                    disabled={dbSearching || !dbQuery.trim()}
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1 text-sm font-bold"
                  >
                    {dbSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                </div>
                {dbResults.length > 0 && (
                  <div className="space-y-1 max-h-52 overflow-y-auto rounded-xl border border-blue-100 bg-white dark:bg-card">
                    {dbResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applyDbResult(r)}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0"
                      >
                        {r.image && (
                          <Image src={r.image} alt={r.name} width={40} height={40} className="rounded-lg object-cover border border-gray-100 dark:border-card-border shrink-0 bg-gray-50 dark:bg-surface" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">{r.name}</p>
                          <p className="text-xs text-gray-400 dark:text-muted">{r.brand}{r.quantity ? ` · ${r.quantity}` : ""}{r.barcode ? ` · ${r.barcode}` : ""}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Nombre *</label>
                  <input required value={addForm.name} onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Arroz costeño 1kg" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Categoría *</label>
                  <select value={addForm.category} onChange={(e) => setAddForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm">
                    {realCategories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Precio de venta (S/) *</label>
                  <input required type="number" step="0.01" min="0" value={addForm.price} onChange={(e) => setAddForm(f => ({ ...f, price: e.target.value }))} placeholder="5.50" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Precio de costo (S/)</label>
                  <input type="number" step="0.01" min="0" value={addForm.costPrice} onChange={(e) => setAddForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="3.50" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Unidad</label>
                  <input value={addForm.unit} onChange={(e) => setAddForm(f => ({ ...f, unit: e.target.value }))} placeholder="kg, und, bolsa…" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Badge</label>
                  <select value={addForm.badge} onChange={(e) => setAddForm(f => ({ ...f, badge: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm">
                    <option value="">Sin badge</option>
                    {["Oferta", "Popular", "Fresco", "Premium"].map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Stock actual</label>
                  <input type="number" min="0" value={addForm.stock} onChange={(e) => setAddForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Stock mínimo</label>
                  <input type="number" min="0" value={addForm.stockMin} onChange={(e) => setAddForm(f => ({ ...f, stockMin: e.target.value }))} placeholder="5" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Stock máximo</label>
                  <input type="number" min="0" value={addForm.stockMax} onChange={(e) => setAddForm(f => ({ ...f, stockMax: e.target.value }))} placeholder="100" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Código de barras</label>
                  <div className="flex gap-2">
                    <input value={addForm.barcode} onChange={(e) => setAddForm(f => ({ ...f, barcode: e.target.value }))} placeholder="7750000000000" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm font-mono" />
                    <button type="button" onClick={() => setShowScanner(true)} className="px-3 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors">
                      <ScanBarcode className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">URL de imagen</label>
                  <input value={addForm.image} onChange={(e) => setAddForm(f => ({ ...f, image: e.target.value }))} placeholder="/images/producto.jpg" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60">
                  {saving ? "Guardando…" : "Agregar producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit product modal ── */}
      {editModalProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && closeEditModal()}>
          <div className="bg-white dark:bg-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-y-auto max-h-[90dvh]">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-card z-10">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground truncate pr-2">Editar: {editModalProduct.name}</h3>
              <button onClick={closeEditModal} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors shrink-0">
                <X className="h-5 w-5 text-gray-500 dark:text-muted" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Nombre *</label>
                  <input required value={editForm.name ?? ""} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Categoría</label>
                  <select value={editForm.category ?? ""} onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm">
                    {realCategories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Precio de venta (S/)</label>
                  <input type="number" step="0.01" min="0" value={editForm.price ?? ""} onChange={(e) => setEditForm(f => ({ ...f, price: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Precio de costo (S/)</label>
                  <input type="number" step="0.01" min="0" value={editForm.costPrice ?? ""} onChange={(e) => setEditForm(f => ({ ...f, costPrice: Number(e.target.value) || undefined }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Unidad</label>
                  <input value={editForm.unit ?? ""} onChange={(e) => setEditForm(f => ({ ...f, unit: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Badge</label>
                  <select value={editForm.badge ?? ""} onChange={(e) => setEditForm(f => ({ ...f, badge: e.target.value || undefined }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm">
                    <option value="">Sin badge</option>
                    {["Oferta", "Popular", "Fresco", "Premium"].map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Stock actual</label>
                  <input type="number" min="0" value={editForm.stock ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stock: e.target.value !== "" ? Number(e.target.value) : undefined }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Stock mínimo</label>
                  <input type="number" min="0" value={editForm.stockMin ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stockMin: e.target.value !== "" ? Number(e.target.value) : undefined }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Stock máximo</label>
                  <input type="number" min="0" value={editForm.stockMax ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stockMax: e.target.value !== "" ? Number(e.target.value) : undefined }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">Código de barras</label>
                  <input value={editForm.barcode ?? ""} onChange={(e) => setEditForm(f => ({ ...f, barcode: e.target.value || undefined }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm font-mono" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">URL de imagen</label>
                  <input value={editForm.image ?? ""} onChange={(e) => setEditForm(f => ({ ...f, image: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-surface rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-foreground">Estado del producto</p>
                  <p className="text-xs text-gray-400 dark:text-muted">{editForm.active ? "Visible en la tienda" : "Oculto en la tienda"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, active: !f.active }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer",
                    editForm.active ? "bg-emerald-500" : "bg-gray-200"
                  )}
                >
                  <span className={cn("inline-block h-5 w-5 rounded-full bg-white dark:bg-card shadow transition-transform", editForm.active ? "translate-x-5" : "translate-x-0")} />
                </button>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={closeEditModal} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
                <button type="button" onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60">
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
