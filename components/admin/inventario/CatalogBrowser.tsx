"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useMemo, useCallback } from "react";
import {
  Search, Grid3x3, List, Plus, Trash2, ShoppingCart,
  Loader2, Check, Package, ChevronDown, ChevronUp,
  Filter, Boxes, CheckCheck } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { PERU_CATALOG, CATALOG_STATS } from "@/lib/catalog/peru-abarrotes-catalog";
import { CATALOG_CATEGORIES } from "@/lib/catalog/catalog-categories";
import type { CatalogProduct, CatalogCartItem, CatalogCategory } from "@/lib/catalog/catalog-types";

const PAGE_SIZE = 60;
const QUICK_STOCK = [5, 10, 25, 50, 100];

// ── Product Card (Grid view) ─────────────────────────────────────────────────

function ProductCard({
  product,
  inCart,
  onAdd,
}: {
  product: CatalogProduct;
  inCart: boolean;
  onAdd: (p: CatalogProduct) => void;
}) {
  const margin = product.suggestedCostPrice
    ? Math.round(((product.suggestedPrice - product.suggestedCostPrice) / product.suggestedPrice) * 100)
    : null;

  return (
    <div className={cn(
      "rounded-xl border p-3 transition-all hover:shadow-sm group",
      inCart
        ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/30"
        : "border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card hover:border-primary/40"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-3xl">{product.emoji}</span>
        <div className="flex items-center gap-1">
          {product.tags?.includes("popular") && (
            <span className="text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/30 text-[var(--data-warning)] dark:text-[var(--data-warning)]">
              Popular
            </span>
          )}
          {margin !== null && (
            <span className="text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]">
              {margin}% margen
            </span>
          )}
        </div>
      </div>
      <p className="text-xs font-bold text-foreground truncate">{product.name}</p>
      <p className="text-[length:var(--ts-2xs)] text-muted truncate">{product.brand} · {product.presentation ?? product.unit}</p>
      <div className="flex items-center justify-between mt-2">
        <div>
          <p className="text-sm font-extrabold text-primary">S/ {product.suggestedPrice.toFixed(2)}</p>
          {product.suggestedCostPrice && (
            <p className="text-[length:var(--ts-2xs)] text-muted">Costo: S/ {product.suggestedCostPrice.toFixed(2)}</p>
          )}
        </div>
        <button
          onClick={() => onAdd(product)}
          disabled={inCart}
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
            inCart
              ? "bg-primary text-white"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-primary hover:text-white active:scale-90"
          )}
        >
          {inCart ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Product Row (List view) ──────────────────────────────────────────────────

function ProductRow({
  product,
  inCart,
  onAdd,
}: {
  product: CatalogProduct;
  inCart: boolean;
  onAdd: (p: CatalogProduct) => void;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
      inCart
        ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
        : "border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface"
    )}>
      <span className="text-xl shrink-0">{product.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{product.name}</p>
        <p className="text-[length:var(--ts-2xs)] text-muted">{product.brand} · {product.category}</p>
      </div>
      <p className="text-xs font-bold text-primary shrink-0 w-16 text-right">S/ {product.suggestedPrice.toFixed(2)}</p>
      {product.barcode && (
        <p className="text-[length:var(--ts-2xs)] text-muted font-mono shrink-0 w-24 text-right hidden lg:block">{product.barcode}</p>
      )}
      <button
        onClick={() => onAdd(product)}
        disabled={inCart}
        className={cn(
          "h-7 px-2.5 rounded-md text-[length:var(--ts-2xs)] font-bold transition-all shrink-0",
          inCart
            ? "bg-primary text-white"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-primary hover:text-white"
        )}
      >
        {inCart ? "Agregado" : "Agregar"}
      </button>
    </div>
  );
}

// ── Improved Cart Item ──────────────────────────────────────────────────────

function CartItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: CatalogCartItem;
  onUpdate: (catalogId: string, field: keyof CatalogCartItem, value: number) => void;
  onRemove: (catalogId: string) => void;
}) {
  const subtotal = item.price * item.stock;
  const costTotal = item.costPrice * item.stock;
  const profit = subtotal - costTotal;

  return (
    <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{item.product.emoji}</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{item.product.name}</p>
            <p className="text-[length:var(--ts-2xs)] text-muted">{item.product.brand}</p>
          </div>
        </div>
        <button
          onClick={() => onRemove(item.product.catalogId)}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--data-error)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inputs con labels claros */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[length:var(--ts-2xs)] font-semibold text-muted block mb-1">Stock inicial</label>
          <input
            type="number"
            min={0}
            value={item.stock}
            onChange={(e) => onUpdate(item.product.catalogId, "stock", Math.max(0, Number(e.target.value)))}
            className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-mono text-center font-bold focus:ring-2 focus:ring-primary/40 focus:outline-none"
          />
          {/* Quick stock buttons */}
          <div className="flex gap-0.5 mt-1">
            {QUICK_STOCK.slice(0, 3).map((n) => (
              <button
                key={n}
                onClick={() => onUpdate(item.product.catalogId, "stock", n)}
                className={cn(
                  "flex-1 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold transition-all",
                  item.stock === n ? "bg-primary text-white" : "bg-gray-200 dark:bg-gray-700 text-muted hover:bg-primary/20"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[length:var(--ts-2xs)] font-semibold text-muted block mb-1">Precio venta</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={item.price}
            onChange={(e) => onUpdate(item.product.catalogId, "price", Math.max(0, Number(e.target.value)))}
            className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-mono text-center font-bold text-primary focus:ring-2 focus:ring-primary/40 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[length:var(--ts-2xs)] font-semibold text-muted block mb-1">Precio costo</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={item.costPrice}
            onChange={(e) => onUpdate(item.product.catalogId, "costPrice", Math.max(0, Number(e.target.value)))}
            className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-mono text-center focus:ring-2 focus:ring-primary/40 focus:outline-none"
          />
        </div>
      </div>

      {/* Subtotales */}
      <div className="flex items-center justify-between text-[length:var(--ts-2xs)] pt-1 border-t border-[var(--rule-base)] dark:border-card-border">
        <span className="text-muted">Inversion: <span className="font-bold text-foreground">S/ {costTotal.toFixed(2)}</span></span>
        <span className="text-muted">Ganancia: <span className="font-bold text-[var(--data-success)]">+S/ {profit.toFixed(2)}</span></span>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function CatalogBrowser() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CatalogCategory | "all">("all");
  const [cart, setCart] = useState<CatalogCartItem[]>([]);
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(true);

  const filtered = useMemo(() => {
    let items = [...PERU_CATALOG];
    if (selectedCategory !== "all") items = items.filter((p) => p.category === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.barcode?.includes(q));
    }
    return items;
  }, [search, selectedCategory]);

  const visibleProducts = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visibleProducts.length < filtered.length;
  const cartIds = useMemo(() => new Set(cart.map((c) => c.product.catalogId)), [cart]);

  // Totales del carrito
  const cartTotals = useMemo(() => {
    let inversion = 0, ventaTotal = 0;
    for (const c of cart) {
      inversion += c.costPrice * c.stock;
      ventaTotal += c.price * c.stock;
    }
    return { inversion, ventaTotal, ganancia: ventaTotal - inversion, items: cart.reduce((s, c) => s + c.stock, 0) };
  }, [cart]);

  const addToCart = useCallback((product: CatalogProduct) => {
    if (cartIds.has(product.catalogId)) return;
    setCart((prev) => [...prev, {
      product, stock: 10, price: product.suggestedPrice,
      costPrice: product.suggestedCostPrice ?? product.suggestedPrice * 0.7,
    }]);
  }, [cartIds]);

  const addCategoryToCart = useCallback(() => {
    const catProducts = selectedCategory === "all" ? filtered : filtered.filter((p) => p.category === selectedCategory);
    const newItems = catProducts.filter((p) => !cartIds.has(p.catalogId)).map((p) => ({
      product: p, stock: 10, price: p.suggestedPrice,
      costPrice: p.suggestedCostPrice ?? p.suggestedPrice * 0.7,
    }));
    if (newItems.length > 0) setCart((prev) => [...prev, ...newItems]);
  }, [filtered, selectedCategory, cartIds]);

  const updateCartItem = useCallback((catalogId: string, field: keyof CatalogCartItem, value: number) => {
    setCart((prev) => prev.map((item) => item.product.catalogId === catalogId ? { ...item, [field]: value } : item));
  }, []);

  const removeFromCart = useCallback((catalogId: string) => {
    setCart((prev) => prev.filter((item) => item.product.catalogId !== catalogId));
  }, []);

  const handleImport = async () => {
    if (cart.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/products/catalog-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            name: c.product.name, category: c.product.category, price: c.price,
            costPrice: c.costPrice, unit: c.product.unit, barcode: c.product.barcode,
            stock: c.stock, stockMin: Math.max(1, Math.round(c.stock * 0.2)),
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ created: data.created, skipped: data.skipped });
        if (data.created > 0) setCart([]);
      }
    } catch { /* silencioso */ } finally { setImporting(false); }
  };

  const categoryMeta = CATALOG_CATEGORIES.find((c) => c.id === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <CardTitle className="text-base font-extrabold text-foreground">Catalogo de Abarrotes Peruanos</CardTitle>
          <p className="text-xs text-muted">{CATALOG_STATS.total} productos · {CATALOG_STATS.categories} categorias · Marcas reales</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Add all category */}
          <button
            onClick={addCategoryToCart}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Agregar {selectedCategory === "all" ? "todos" : categoryMeta?.label ?? "categoria"}
          </button>
          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-[var(--surface-sunken)] rounded-lg p-0.5">
            <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-md transition-all", viewMode === "grid" ? "bg-white dark:bg-card " : "text-muted")}>
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded-md transition-all", viewMode === "list" ? "bg-white dark:bg-card " : "text-muted")}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Search + Category */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar producto, marca o codigo de barras..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <button onClick={() => setShowCategories(!showCategories)}
          className={cn("flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors",
            selectedCategory !== "all" ? "border-primary bg-primary/5 text-primary" : "border-[var(--rule-base)] dark:border-card-border text-muted hover:text-foreground")}>
          <Filter className="h-3.5 w-3.5" />
          {categoryMeta?.emoji ?? "Todas"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", showCategories && "rotate-180")} />
        </button>
      </div>

      {/* Category chips */}
      {showCategories && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => { setSelectedCategory("all"); setPage(1); }}
            className={cn("px-3 py-1.5 rounded-full text-[length:var(--ts-xs)] font-semibold transition-all",
              selectedCategory === "all" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-muted hover:text-foreground")}>
            Todas ({CATALOG_STATS.total})
          </button>
          {CATALOG_CATEGORIES.map((cat) => {
            const count = PERU_CATALOG.filter((p) => p.category === cat.id).length;
            return (
              <button key={cat.id} onClick={() => { setSelectedCategory(cat.id); setPage(1); }}
                className={cn("px-3 py-1.5 rounded-full text-[length:var(--ts-xs)] font-semibold transition-all",
                  selectedCategory === cat.id ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-muted hover:text-foreground")}>
                {cat.emoji} {cat.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[length:var(--ts-2xs)] text-muted">
        {filtered.length} productos encontrados
        {cart.length > 0 && <span className="ml-2 font-bold text-primary">· {cart.length} productos en carrito ({cartTotals.items} unidades)</span>}
      </p>

      {/* Products grid/list */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
          {visibleProducts.map((p) => (
            <ProductCard key={p.catalogId} product={p} inCart={cartIds.has(p.catalogId)} onAdd={addToCart} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {visibleProducts.map((p) => (
            <ProductRow key={p.catalogId} product={p} inCart={cartIds.has(p.catalogId)} onAdd={addToCart} />
          ))}
        </div>
      )}

      {hasMore && (
        <button onClick={() => setPage((p) => p + 1)}
          className="w-full py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-xs font-semibold text-muted hover:text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors">
          Cargar mas ({filtered.length - visibleProducts.length} restantes)
        </button>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-10 w-10 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mb-3" />
          <p className="text-sm font-semibold text-muted">No se encontraron productos</p>
        </div>
      )}

      {/* ═══ CARRITO MEJORADO (panel inferior expandible) ═══ */}
      {cart.length > 0 && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          {/* Header del carrito */}
          <button
            onClick={() => setCartExpanded(!cartExpanded)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-extrabold text-foreground">Carrito de importacion ({cart.length} productos)</p>
                <p className="text-xs text-muted">{cartTotals.items} unidades totales</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Totales en el header */}
              <div className="hidden sm:flex items-center gap-4 text-right">
                <div>
                  <p className="text-[length:var(--ts-2xs)] text-muted">Inversion</p>
                  <p className="text-sm font-bold text-foreground">S/ {cartTotals.inversion.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[length:var(--ts-2xs)] text-muted">Venta estimada</p>
                  <p className="text-sm font-bold text-primary">S/ {cartTotals.ventaTotal.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[length:var(--ts-2xs)] text-muted">Ganancia</p>
                  <p className="text-sm font-bold text-[var(--data-success)]">+S/ {cartTotals.ganancia.toFixed(2)}</p>
                </div>
              </div>
              {cartExpanded ? <ChevronDown className="h-5 w-5 text-muted" /> : <ChevronUp className="h-5 w-5 text-muted" />}
            </div>
          </button>

          {/* Contenido expandible */}
          {cartExpanded && (
            <div className="border-t border-[var(--rule-base)] dark:border-card-border">
              {/* Items del carrito */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
                {cart.map((item) => (
                  <CartItemRow
                    key={item.product.catalogId}
                    item={item}
                    onUpdate={updateCartItem}
                    onRemove={removeFromCart}
                  />
                ))}
              </div>

              {/* Footer con totales + acciones */}
              <div className="border-t border-[var(--rule-base)] dark:border-card-border px-5 py-4 bg-gray-50 dark:bg-surface">
                {/* Totales mobile */}
                <div className="sm:hidden grid grid-cols-3 gap-3 mb-3">
                  <div className="text-center">
                    <p className="text-[length:var(--ts-2xs)] text-muted">Inversion</p>
                    <p className="text-sm font-bold">S/ {cartTotals.inversion.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[length:var(--ts-2xs)] text-muted">Venta</p>
                    <p className="text-sm font-bold text-primary">S/ {cartTotals.ventaTotal.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[length:var(--ts-2xs)] text-muted">Ganancia</p>
                    <p className="text-sm font-bold text-[var(--data-success)]">+S/ {cartTotals.ganancia.toFixed(2)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setCart([])} className="text-xs font-semibold text-[var(--data-error)] hover:underline">
                    Vaciar carrito
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    {importing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
                    ) : (
                      <><Boxes className="h-4 w-4" /> Cargar {cart.length} productos al inventario</>
                    )}
                  </button>
                </div>

                {result && (
                  <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]">
                    <Check className="h-5 w-5 text-[var(--data-success)] shrink-0" />
                    <span className="text-sm text-[var(--data-success)] dark:text-[var(--data-success)] font-bold">
                      {result.created} productos importados exitosamente{result.skipped > 0 ? `. ${result.skipped} ya existian y se omitieron.` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
