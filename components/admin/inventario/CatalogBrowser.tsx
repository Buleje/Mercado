"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Search, Grid3x3, List, Plus, Trash2, ShoppingCart,
  Loader2, Check, Package, ChevronDown, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PERU_CATALOG, CATALOG_STATS } from "@/lib/catalog/peru-abarrotes-catalog";
import { CATALOG_CATEGORIES } from "@/lib/catalog/catalog-categories";
import type { CatalogProduct, CatalogCartItem, CatalogCategory } from "@/lib/catalog/catalog-types";

const PAGE_SIZE = 60;

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
  return (
    <div className={cn(
      "rounded-xl border p-3 transition-all hover:shadow-md",
      inCart
        ? "border-primary bg-primary/5 dark:bg-primary/10"
        : "border-gray-200 dark:border-card-border bg-white dark:bg-card hover:border-primary/40"
    )}>
      {/* Emoji + badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-3xl">{product.emoji}</span>
        {product.tags?.includes("popular") && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            Popular
          </span>
        )}
      </div>
      {/* Info */}
      <p className="text-xs font-bold text-foreground truncate">{product.name}</p>
      <p className="text-[10px] text-muted truncate">{product.brand} · {product.presentation ?? product.unit}</p>
      {/* Precios */}
      <div className="flex items-center justify-between mt-2">
        <div>
          <p className="text-sm font-extrabold text-primary">S/ {product.suggestedPrice.toFixed(2)}</p>
          {product.suggestedCostPrice && (
            <p className="text-[9px] text-muted">Costo: S/ {product.suggestedCostPrice.toFixed(2)}</p>
          )}
        </div>
        <button
          onClick={() => onAdd(product)}
          disabled={inCart}
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
            inCart
              ? "bg-primary text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-primary hover:text-white active:scale-90"
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
        : "border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface"
    )}>
      <span className="text-xl shrink-0">{product.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{product.name}</p>
        <p className="text-[10px] text-muted">{product.brand} · {product.category}</p>
      </div>
      <p className="text-xs font-bold text-primary shrink-0 w-16 text-right">S/ {product.suggestedPrice.toFixed(2)}</p>
      {product.barcode && (
        <p className="text-[9px] text-muted font-mono shrink-0 w-24 text-right hidden lg:block">{product.barcode}</p>
      )}
      <button
        onClick={() => onAdd(product)}
        disabled={inCart}
        className={cn(
          "h-7 px-2.5 rounded-md text-[10px] font-bold transition-all shrink-0",
          inCart
            ? "bg-primary text-white"
            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-primary hover:text-white"
        )}
      >
        {inCart ? "Agregado" : "Agregar"}
      </button>
    </div>
  );
}

// ── Cart Item ────────────────────────────────────────────────────────────────

function CartItem({
  item,
  onUpdate,
  onRemove,
}: {
  item: CatalogCartItem;
  onUpdate: (catalogId: string, field: keyof CatalogCartItem, value: number) => void;
  onRemove: (catalogId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-card-border last:border-0">
      <span className="text-lg shrink-0">{item.product.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-foreground truncate">{item.product.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <label className="text-[9px] text-muted">Stock:</label>
          <input
            type="number"
            min={0}
            value={item.stock}
            onChange={(e) => onUpdate(item.product.catalogId, "stock", Number(e.target.value))}
            className="w-14 px-1.5 py-0.5 rounded border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-[10px] font-mono text-center"
          />
          <label className="text-[9px] text-muted">Venta:</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={item.price}
            onChange={(e) => onUpdate(item.product.catalogId, "price", Number(e.target.value))}
            className="w-16 px-1.5 py-0.5 rounded border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-[10px] font-mono text-center"
          />
          <label className="text-[9px] text-muted">Costo:</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={item.costPrice}
            onChange={(e) => onUpdate(item.product.catalogId, "costPrice", Number(e.target.value))}
            className="w-16 px-1.5 py-0.5 rounded border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-[10px] font-mono text-center"
          />
        </div>
      </div>
      <button
        onClick={() => onRemove(item.product.catalogId)}
        className="h-6 w-6 rounded flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors shrink-0"
      >
        <Trash2 className="h-3 w-3" />
      </button>
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

  // Filtrar productos
  const filtered = useMemo(() => {
    let items = [...PERU_CATALOG];
    if (selectedCategory !== "all") {
      items = items.filter((p) => p.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.barcode?.includes(q)
      );
    }
    return items;
  }, [search, selectedCategory]);

  const visibleProducts = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visibleProducts.length < filtered.length;

  const cartIds = useMemo(() => new Set(cart.map((c) => c.product.catalogId)), [cart]);

  const addToCart = useCallback((product: CatalogProduct) => {
    if (cartIds.has(product.catalogId)) return;
    setCart((prev) => [...prev, {
      product,
      stock: 10,
      price: product.suggestedPrice,
      costPrice: product.suggestedCostPrice ?? product.suggestedPrice * 0.7,
    }]);
  }, [cartIds]);

  const updateCartItem = useCallback((catalogId: string, field: keyof CatalogCartItem, value: number) => {
    setCart((prev) => prev.map((item) =>
      item.product.catalogId === catalogId ? { ...item, [field]: value } : item
    ));
  }, []);

  const removeFromCart = useCallback((catalogId: string) => {
    setCart((prev) => prev.filter((item) => item.product.catalogId !== catalogId));
  }, []);

  // Importar al inventario
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
            name: c.product.name,
            category: c.product.category,
            price: c.price,
            costPrice: c.costPrice,
            unit: c.product.unit,
            barcode: c.product.barcode,
            stock: c.stock,
            stockMin: Math.max(1, Math.round(c.stock * 0.2)),
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ created: data.created, skipped: data.skipped });
        if (data.created > 0) {
          setCart([]);
        }
      }
    } catch {
      // silencioso
    } finally {
      setImporting(false);
    }
  };

  const categoryMeta = CATALOG_CATEGORIES.find((c) => c.id === selectedCategory);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-extrabold text-foreground">Catalogo de Abarrotes</h3>
          <p className="text-xs text-muted">{CATALOG_STATS.total} productos peruanos · {CATALOG_STATS.categories} categorias</p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={cn("p-1.5 rounded-md transition-all", viewMode === "grid" ? "bg-white dark:bg-card shadow-sm" : "text-muted")}
          >
            <Grid3x3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn("p-1.5 rounded-md transition-all", viewMode === "list" ? "bg-white dark:bg-card shadow-sm" : "text-muted")}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search + Category filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar producto, marca o codigo..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          onClick={() => setShowCategories(!showCategories)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors",
            selectedCategory !== "all"
              ? "border-primary bg-primary/5 text-primary"
              : "border-gray-200 dark:border-card-border text-muted hover:text-foreground"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {categoryMeta?.emoji ?? "Todas"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", showCategories && "rotate-180")} />
        </button>
      </div>

      {/* Category chips */}
      {showCategories && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { setSelectedCategory("all"); setPage(1); }}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all",
              selectedCategory === "all" ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800 text-muted hover:text-foreground"
            )}
          >
            Todas ({CATALOG_STATS.total})
          </button>
          {CATALOG_CATEGORIES.map((cat) => {
            const count = PERU_CATALOG.filter((p) => p.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setPage(1); }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all",
                  selectedCategory === cat.id ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800 text-muted hover:text-foreground"
                )}
              >
                {cat.emoji} {cat.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Results count */}
      <p className="text-[10px] text-muted">
        {filtered.length} productos encontrados
        {cart.length > 0 && <span className="ml-2 font-bold text-primary">· {cart.length} en carrito</span>}
      </p>

      <div className="flex gap-4">
        {/* Product list/grid */}
        <div className="flex-1 min-w-0">
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
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
            <button
              onClick={() => setPage((p) => p + 1)}
              className="w-full mt-4 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-xs font-semibold text-muted hover:text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors"
            >
              Cargar mas ({filtered.length - visibleProducts.length} restantes)
            </button>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-semibold text-muted">No se encontraron productos</p>
              <p className="text-xs text-muted mt-1">Prueba con otra busqueda o categoria</p>
            </div>
          )}
        </div>

        {/* Cart sidebar */}
        {cart.length > 0 && (
          <div className="w-80 shrink-0 hidden lg:block">
            <div className="sticky top-4 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  <p className="text-sm font-extrabold text-foreground">Carrito ({cart.length})</p>
                </div>
                <button
                  onClick={() => setCart([])}
                  className="text-[10px] text-red-500 hover:underline font-semibold"
                >
                  Vaciar
                </button>
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-0">
                {cart.map((item) => (
                  <CartItem
                    key={item.product.catalogId}
                    item={item}
                    onUpdate={updateCartItem}
                    onRemove={removeFromCart}
                  />
                ))}
              </div>

              {/* Import button */}
              <button
                onClick={handleImport}
                disabled={importing || cart.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {importing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
                ) : (
                  <><Plus className="h-4 w-4" /> Cargar {cart.length} al inventario</>
                )}
              </button>

              {result && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-xs">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    {result.created} productos importados{result.skipped > 0 ? `, ${result.skipped} ya existian` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile cart bar */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-card border-t border-gray-200 dark:border-card-border p-3 z-40 shadow-2xl">
          <button
            onClick={handleImport}
            disabled={importing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-bold text-sm"
          >
            {importing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
            ) : (
              <><ShoppingCart className="h-4 w-4" /> Cargar {cart.length} productos al inventario</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
