"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  startTransition,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import { Plus, Minus, ShoppingCart, ArrowRight, Sparkles, Package, Search, X, ArrowUpDown, Heart, SlidersHorizontal, Clock, Eye, GitCompareArrows, Star } from "lucide-react";
import { products, categories } from "@/data/products";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useFavorites } from "@/contexts/favorites-context";
import { useCompare } from "@/contexts/compare-context";
import { cn } from "@/lib/utils";
import type { Product } from "@/data/products";

type LiveProduct = Product & { stock?: number; stockMin?: number };

// Only real categories (not "todos")
const realCategories = categories.filter((c) => c.id !== "todos");
const INITIAL_SECTIONS = 2; // show only 2 sections at start

type SortKey = "relevancia" | "precio-asc" | "precio-desc" | "nombre";
const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "relevancia", label: "Relevancia" },
  { id: "precio-asc", label: "Precio: menor a mayor" },
  { id: "precio-desc", label: "Precio: mayor a menor" },
  { id: "nombre", label: "Nombre A-Z" },
];

function sortProducts(list: LiveProduct[], key: SortKey): LiveProduct[] {
  if (key === "relevancia") return list;
  const sorted = [...list];
  if (key === "precio-asc") sorted.sort((a, b) => a.price - b.price);
  else if (key === "precio-desc") sorted.sort((a, b) => b.price - a.price);
  else if (key === "nombre") sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

// ── Skeleton Card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white dark:bg-card border border-gray-100 dark:border-card-border overflow-hidden flex flex-col animate-pulse">
      <div className="aspect-square bg-gray-200 dark:bg-surface" />
      <div className="p-3 sm:p-4 flex flex-col gap-3 flex-1">
        <div className="h-4 bg-gray-200 dark:bg-surface rounded-full w-3/4" />
        <div className="h-3 bg-gray-200 dark:bg-surface rounded-full w-1/2" />
        <div className="flex items-end justify-between mt-auto">
          <div className="h-5 bg-gray-200 dark:bg-surface rounded-full w-20" />
          <div className="h-10 w-10 bg-gray-200 dark:bg-surface rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function SkeletonSection() {
  return (
    <div className="rounded-2xl p-5 sm:p-6 bg-white dark:bg-card animate-pulse">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-9 w-9 bg-gray-200 dark:bg-surface rounded-full" />
        <div className="flex flex-col gap-2">
          <div className="h-5 bg-gray-200 dark:bg-surface rounded-full w-36" />
          <div className="h-3 bg-gray-200 dark:bg-surface rounded-full w-28" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product, onQuickView }: { product: LiveProduct; onQuickView?: (p: LiveProduct) => void }) {
  const { items, addItem, updateQty } = useCart();
  const { showToast } = useToast();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const { add: addCompare, isIn: isCompare, remove: removeCompare } = useCompare();
  const cartItem = items.find((i) => i.id === product.id);
  const qty = cartItem?.quantity ?? 0;
  const fav = isFavorite(String(product.id));

  const isOutOfStock = product.stock != null && product.stock <= 0;
  const isLowStock = !isOutOfStock && product.stock != null && product.stockMin != null && product.stock <= product.stockMin;

  const handleAdd = () => {
    if (isOutOfStock) return;
    addItem(product);
    showToast(product.name, product.image);
  };

  const badgeColors: Record<string, string> = {
    Oferta: "bg-red-500",
    Popular: "bg-secondary",
    Fresco: "bg-emerald-500",
    Premium: "bg-violet-600",
  };

  return (
    <div className={cn(
      "group relative bg-white dark:bg-card rounded-2xl overflow-hidden border border-gray-100 dark:border-card-border hover:shadow-xl hover:shadow-primary/8 hover:-translate-y-1.5 transition-all duration-300 flex flex-col",
      isOutOfStock && "opacity-60 pointer-events-none"
    )}>
      {/* Badge */}
      {product.badge && (
        <span className={cn(
          "absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm",
          badgeColors[product.badge] ?? "bg-primary"
        )}>
          {product.badge}
        </span>
      )}

      {/* Stock indicators */}
      {isOutOfStock && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-gray-500">
          Agotado
        </span>
      )}
      {isLowStock && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-amber-500 animate-pulse">
          ¡Últimas unidades!
        </span>
      )}

      {/* Favorite button */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleFav(String(product.id)); }}
        aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
        className={cn(
          "absolute z-10 flex items-center justify-center h-8 w-8 rounded-full transition-all duration-200 pointer-events-auto",
          isOutOfStock || isLowStock ? "top-12 right-3" : "top-3 right-3",
          fav
            ? "bg-red-500 text-white shadow-md scale-110"
            : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-card shadow-sm"
        )}
      >
        <Heart className={cn("h-4 w-4", fav && "fill-current")} />
      </button>

      {/* Image */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden shrink-0">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            loading="lazy"
            className="object-cover group-hover:scale-110 transition-transform duration-500"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gray-100 text-gray-300">
            <Package className="h-10 w-10" />
          </div>
        )}
        {/* Compare button */}
        <button
          onClick={(e) => { e.stopPropagation(); if (isCompare(product.id)) { removeCompare(product.id); } else { addCompare(product); } }}
          aria-label={isCompare(product.id) ? "Quitar de comparación" : "Comparar"}
          className={cn(
            "absolute bottom-2 left-2 z-10 flex items-center justify-center h-7 w-7 rounded-full transition-all duration-200 pointer-events-auto opacity-0 group-hover:opacity-100",
            isCompare(product.id)
              ? "bg-primary text-white shadow-md"
              : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-primary hover:bg-white dark:hover:bg-card shadow-sm"
          )}
        >
          <GitCompareArrows className="h-3.5 w-3.5" />
        </button>

        {/* Quick View overlay */}
        {onQuickView && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickView(product); }}
            className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-300 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
            aria-label={`Vista rápida de ${product.name}`}
          >
            <span className="flex items-center gap-1.5 bg-white dark:bg-card text-foreground rounded-full px-3 py-1.5 text-xs font-bold shadow-lg scale-90 group-hover:scale-100 transition-transform">
              <Eye className="h-3.5 w-3.5" /> Vista rápida
            </span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-3 sm:p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-semibold text-foreground text-sm sm:text-base leading-tight line-clamp-2 flex-1">
          {product.name}
        </h3>

        <div className="flex items-end justify-between gap-2">
          <div>
            <span className="text-lg sm:text-xl font-extrabold text-primary leading-none">
              S/{product.price.toFixed(2)}
            </span>
            <span className="block text-[11px] text-muted mt-0.5">/{product.unit}</span>
          </div>

          {/* Counter or Add button */}
          {qty === 0 ? (
            <button
              onClick={handleAdd}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary text-white shadow-md hover:bg-primary-dark hover:scale-110 active:scale-95 transition-all duration-200 animate-[scaleIn_0.15s_ease-out]"
              aria-label={`Agregar ${product.name}`}
            >
              <Plus className="h-5 w-5" />
            </button>
          ) : (
            <div className="flex items-center bg-primary rounded-xl overflow-hidden shadow-md animate-[scaleIn_0.15s_ease-out]">
              <button
                onClick={() => updateQty(product.id, qty - 1)}
                className="flex items-center justify-center h-10 w-9 text-white hover:bg-primary-dark transition-colors"
                aria-label="Reducir"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span
                key={qty}
                className="w-7 text-center text-sm font-bold text-white animate-[pop_0.15s_ease-out]"
              >
                {qty}
              </span>
              <button
                onClick={handleAdd}
                className="flex items-center justify-center h-10 w-9 text-white hover:bg-primary-dark transition-colors"
                aria-label="Aumentar"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Category Section ──────────────────────────────────────────────────────────
function CategorySection({ categoryId, highlight, productList, onQuickView }: { categoryId: string; highlight: boolean; productList: LiveProduct[]; onQuickView: (p: LiveProduct) => void }) {
  const cat = categories.find((c) => c.id === categoryId);
  const catProducts = productList.filter((p) => p.category === categoryId);

  if (!cat || catProducts.length === 0) return null;

  return (
    <div
      id={`cat-${categoryId}`}
      className={cn(
        "rounded-2xl p-5 sm:p-6 transition-all duration-500 animate-[fadeUp_0.4s_ease-out]",
        highlight ? "ring-2 ring-primary ring-offset-4 bg-primary/3" : "bg-white dark:bg-card"
      )}
    >
      <div className="flex items-center gap-3 mb-6">
        <span className="flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/8 dark:bg-primary/15 text-2xl leading-none shrink-0">{cat.emoji}</span>
        <div className="flex-1">
          <h3 className="text-xl font-extrabold text-foreground">{cat.label}</h3>
          <p className="text-sm text-muted">{catProducts.length} productos disponibles</p>
        </div>
        <span className="hidden sm:flex items-center gap-1 text-xs font-bold text-primary bg-primary/8 dark:bg-primary/15 px-3 py-1.5 rounded-full">
          <Package className="h-3 w-3" /> {catProducts.length}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {catProducts.map((product) => (
          <ProductCard key={product.id} product={product} onQuickView={onQuickView} />
        ))}
      </div>
    </div>
  );
}

// ── Quick View Modal ──────────────────────────────────────────────────────────
function QuickViewModal({ product, onClose }: { product: LiveProduct; onClose: () => void }) {
  const { items, addItem, updateQty } = useCart();
  const { showToast } = useToast();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const cartItem = items.find((i) => i.id === product.id);
  const qty = cartItem?.quantity ?? 0;
  const isOutOfStock = product.stock != null && product.stock <= 0;
  const [tab, setTab] = useState<"info" | "reviews" | "related">("info");
  const [reviews, setReviews] = useState<Array<{ name: string; rating: number; comment: string; createdAt: string }>>([]);
  const fav = isFavorite(String(product.id));

  // Fetch reviews for this product
  useEffect(() => {
    fetch(`/api/reviews?productId=${product.id}`)
      .then(r => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setReviews(data.slice(0, 5)); })
      .catch(() => {});
  }, [product.id]);

  // Track as recently viewed
  useEffect(() => {
    try {
      const key = "bsm-recently-viewed";
      const saved: Product[] = JSON.parse(localStorage.getItem(key) || "[]");
      const filtered = saved.filter((p: Product) => p.id !== product.id);
      filtered.unshift(product);
      localStorage.setItem(key, JSON.stringify(filtered.slice(0, 12)));
      window.dispatchEvent(new Event("bsm:productViewed"));
    } catch {}
  }, [product]);

  const handleAdd = () => {
    if (isOutOfStock) return;
    addItem(product);
    showToast(product.name, product.image);
  };

  const relatedProducts = products.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
  const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto animate-[scaleIn_0.2s_ease-out] border border-gray-100 dark:border-card-border"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/80 dark:bg-card/80 hover:bg-white dark:hover:bg-card transition-colors shadow-md" aria-label="Cerrar">
          <X className="h-5 w-5 text-gray-600 dark:text-muted" />
        </button>

        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Image */}
        <div className="relative aspect-video sm:aspect-4/3 bg-gray-50 dark:bg-surface">
          {product.image ? (
            <Image src={product.image} alt={product.name} fill className="object-cover" sizes="(max-width: 672px) 100vw, 672px" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-16 w-16" /></div>
          )}
          {product.badge && (
            <span className="absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-bold uppercase text-white bg-primary shadow-sm">{product.badge}</span>
          )}
          {/* Fav button */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFav(String(product.id)); }}
            className={cn(
              "absolute top-3 right-14 z-10 flex items-center justify-center h-10 w-10 rounded-full transition-all shadow-md",
              fav ? "bg-red-500 text-white" : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-red-500"
            )}
            aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
          >
            <Heart className={cn("h-5 w-5", fav && "fill-current")} />
          </button>
        </div>

        {/* Product info bar */}
        <div className="p-5 sm:p-6 pb-3 border-b border-gray-100 dark:border-card-border">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-xl sm:text-2xl font-extrabold text-foreground mb-1">{product.name}</h3>
              <p className="text-sm text-muted">
                {categories.find(c => c.id === product.category)?.emoji} {categories.find(c => c.id === product.category)?.label ?? product.category}
                {reviews.length > 0 && (
                  <span className="ml-3 inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    <span className="font-semibold text-foreground">{avgRating.toFixed(1)}</span>
                    <span className="text-muted">({reviews.length})</span>
                  </span>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-2xl sm:text-3xl font-extrabold text-primary">S/{product.price.toFixed(2)}</span>
              <span className="block text-sm text-muted">por {product.unit}</span>
            </div>
          </div>

          {/* Stock + Add to cart */}
          <div className="flex items-center justify-between mt-4">
            <div>
              {product.stock != null && (
                <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", product.stock <= 0 ? "bg-red-50 text-red-500 dark:bg-red-500/10" : product.stock <= (product.stockMin ?? 5) ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10")}>
                  {product.stock <= 0 ? "Agotado" : `${product.stock} en stock`}
                </span>
              )}
            </div>
            {qty === 0 ? (
              <button onClick={handleAdd} disabled={isOutOfStock} className="flex items-center gap-2 bg-primary text-white rounded-xl px-6 py-3 font-bold shadow-md hover:bg-primary-dark active:scale-95 transition-all disabled:opacity-50">
                <ShoppingCart className="h-5 w-5" /> Agregar al carrito
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-primary rounded-xl overflow-hidden shadow-md">
                  <button onClick={() => updateQty(product.id, qty - 1)} className="h-11 w-10 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"><Minus className="h-4 w-4" /></button>
                  <span className="w-8 text-center font-bold text-white">{qty}</span>
                  <button onClick={handleAdd} className="h-11 w-10 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"><Plus className="h-4 w-4" /></button>
                </div>
                <span className="text-sm font-semibold text-primary">En carrito</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-card-border">
          {([["info", "Detalles"], ["reviews", "Reseñas"], ["related", "Relacionados"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 py-3 text-sm font-semibold transition-all border-b-2",
                tab === key
                  ? "text-primary border-primary bg-primary/5"
                  : "text-muted border-transparent hover:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
              )}
            >
              {label} {key === "reviews" && reviews.length > 0 && `(${reviews.length})`}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5 sm:p-6">
          {tab === "info" && (
            <div className="space-y-4 animate-[fadeUp_0.2s_ease-out]">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface dark:bg-surface rounded-xl p-3 text-center">
                  <p className="text-xs text-muted mb-1">Categoría</p>
                  <p className="font-bold text-foreground text-sm">{categories.find(c => c.id === product.category)?.label}</p>
                </div>
                <div className="bg-surface dark:bg-surface rounded-xl p-3 text-center">
                  <p className="text-xs text-muted mb-1">Unidad</p>
                  <p className="font-bold text-foreground text-sm">{product.unit}</p>
                </div>
                {product.badge && (
                  <div className="bg-surface dark:bg-surface rounded-xl p-3 text-center">
                    <p className="text-xs text-muted mb-1">Etiqueta</p>
                    <p className="font-bold text-primary text-sm">{product.badge}</p>
                  </div>
                )}
                <div className="bg-surface dark:bg-surface rounded-xl p-3 text-center">
                  <p className="text-xs text-muted mb-1">Precio</p>
                  <p className="font-bold text-primary text-sm">S/{product.price.toFixed(2)}/{product.unit}</p>
                </div>
              </div>
              <div className="bg-primary/5 dark:bg-primary/10 rounded-xl p-4 border border-primary/10">
                <p className="text-sm text-foreground font-medium">
                  🚚 <strong>Delivery gratis</strong> en Pucallpa. Paga con <strong>Yape</strong> o <strong>efectivo</strong> contra entrega.
                </p>
              </div>
            </div>
          )}

          {tab === "reviews" && (
            <div className="space-y-3 animate-[fadeUp_0.2s_ease-out]">
              {reviews.length === 0 ? (
                <div className="text-center py-8">
                  <Star className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-muted text-sm">Aún no hay reseñas para este producto</p>
                  <p className="text-xs text-muted mt-1">¡Sé el primero en opinar!</p>
                </div>
              ) : (
                reviews.map((r, i) => (
                  <div key={i} className="bg-surface dark:bg-surface rounded-xl p-4 border border-gray-100 dark:border-card-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-foreground">{r.name}</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, s) => (
                          <Star key={s} className={cn("h-3.5 w-3.5", s < r.rating ? "text-amber-500 fill-amber-500" : "text-gray-300")} />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-muted">{r.comment}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "related" && (
            <div className="grid grid-cols-2 gap-3 animate-[fadeUp_0.2s_ease-out]">
              {relatedProducts.length === 0 ? (
                <div className="col-span-2 text-center py-8">
                  <Package className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-muted text-sm">No hay productos relacionados</p>
                </div>
              ) : (
                relatedProducts.map((rp) => (
                  <div key={rp.id} className="bg-surface dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border overflow-hidden">
                    <div className="relative aspect-square bg-gray-50 dark:bg-card">
                      {rp.image && <Image src={rp.image} alt={rp.name} fill className="object-cover" sizes="200px" />}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-semibold text-foreground line-clamp-1">{rp.name}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="font-extrabold text-primary text-sm">S/{rp.price.toFixed(2)}</span>
                        <button
                          onClick={() => { addItem(rp); showToast(rp.name, rp.image); }}
                          className="h-7 w-7 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all"
                          aria-label={`Agregar ${rp.name}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Search History ────────────────────────────────────────────────────────────
const SEARCH_HISTORY_KEY = "bsm-search-history";
const MAX_HISTORY = 5;

function getSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveSearchTerm(term: string) {
  const clean = term.trim();
  if (!clean || clean.length < 2) return;
  const history = getSearchHistory().filter(h => h !== clean);
  history.unshift(clean);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

// ── Fuzzy search score (0 = no match, higher = better match) ──────────────────
function fuzzyScore(text: string, query: string): number {
  if (!query) return 0;
  const t = text.toLowerCase(), q = query.toLowerCase();
  if (t.includes(q)) return 100 + (q.length / t.length) * 50; // exact substring match gets top score
  // check if all chars of query appear in order (fuzzy)
  let ti = 0, qi = 0, score = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) { qi++; score += 10 - ti * 0.1; }
    ti++;
  }
  return qi === q.length ? Math.max(1, score) : 0;
}

// ── Ver Más Block ─────────────────────────────────────────────────────────────
function ShowMoreBlock({ onExpand }: { onExpand: () => void }) {
  const remaining = realCategories.length - INITIAL_SECTIONS;
  const hiddenCats = realCategories.slice(INITIAL_SECTIONS);
  return (
    <div
      className="relative overflow-hidden rounded-3xl bg-white dark:bg-card border border-gray-100 dark:border-card-border shadow-xl animate-[fadeUp_0.5s_ease-out]"
    >
      {/* Top gradient accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: "linear-gradient(90deg, #2d6a4f, #f4a261, #2d6a4f)" }} />
      {/* Background decorations */}
      <div className="absolute -top-14 -right-14 h-56 w-56 rounded-full bg-primary/5 pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-secondary/5 pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row items-center gap-10 px-8 pt-10 pb-12 sm:px-14">
        {/* Left: text */}
        <div className="flex-1 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/15 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            Descubre más
          </div>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-3 tracking-tight leading-tight">
            ¡Hay más para ti!<br />
            <span className="text-primary">Más categorías</span> disponibles
          </h3>
          <p className="text-foreground/60 text-base max-w-sm leading-relaxed mb-5">
            Tenemos{" "}
            <span className="text-secondary font-bold">{remaining} categorías más</span>{" "}
            con todo lo que tu familia necesita.
          </p>

          {/* Pills */}
          <div className="flex flex-wrap justify-center lg:justify-start gap-2">
            {hiddenCats.map((cat) => (
              <span
                key={cat.id}
                className="inline-flex items-center gap-1.5 bg-primary/8 border border-primary/15 text-primary rounded-full px-3.5 py-1.5 text-sm font-semibold"
              >
                {cat.emoji} {cat.label}
              </span>
            ))}
          </div>
        </div>

        {/* Right: animated CTA */}
        <div className="shrink-0 flex flex-col items-center gap-3">
          <div className="animate-[bounceY_2.5s_ease-in-out_infinite]">
            <div className="relative">
              {/* Pulsing ring */}
              <div className="absolute inset-0 rounded-2xl bg-secondary/40 animate-[pulseRing_2s_ease-in-out_infinite]" />
              <button
                onClick={onExpand}
                className="relative group inline-flex items-center gap-3 bg-secondary text-white rounded-2xl px-10 py-5 font-extrabold text-xl shadow-2xl shadow-secondary/35 hover:bg-[#e8903d] hover:scale-[1.07] active:scale-[0.93] transition-all duration-200"
              >
                Ver todo el catálogo
                <span className="animate-[nudgeX_1s_ease-in-out_infinite]">
                  <ArrowRight className="h-6 w-6" />
                </span>
              </button>
            </div>
          </div>
          <p className="text-foreground/40 text-xs font-medium">
            {hiddenCats.map((c) => c.label).join(" · ")} y más…
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ProductCatalog() {
  const [expanded, setExpanded] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [productList, setProductList] = useState<LiveProduct[]>(products);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("relevancia");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 100]);
  const [maxPrice, setMaxPrice] = useState(100);
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<LiveProduct | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [suggestions, setSuggestions] = useState<LiveProduct[]>([]);
  const [suggestionIdx, setSuggestionIdx] = useState(-1);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch live products from API (admin changes reflect here)
  useEffect(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Array<LiveProduct & { active?: boolean }> | null) => {
        if (Array.isArray(data) && data.length > 0) {
          const active = data.filter((p) => p.active !== false);
          setProductList(active);
          const mp = Math.ceil(Math.max(...active.map(p => p.price), 100));
          setMaxPrice(mp);
          setPriceRange([0, mp]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Hydrate search history from localStorage after mount
  useEffect(() => {
    startTransition(() => setSearchHistory(getSearchHistory()));
  }, []);

  // Close search history on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowHistory(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Save search on commit (debounced) + compute suggestions
  const searchCommitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(searchCommitTimer.current);
    const term = search.trim();
    if (term.length >= 2) {
      // Suggestions: top-5 fuzzy matches for the dropdown
      const scored = productList
        .map(p => ({ p, score: fuzzyScore(p.name, term) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ p }) => p);
      startTransition(() => { setSuggestions(scored); setSuggestionIdx(-1); });
      searchCommitTimer.current = setTimeout(() => {
        saveSearchTerm(term);
        setSearchHistory(getSearchHistory());
      }, 1500);
    } else {
      startTransition(() => setSuggestions([]));
    }
    return () => clearTimeout(searchCommitTimer.current);
  }, [search, productList]);

  // Listen for category selection events from Header mega menu
  useEffect(() => {
    const handler = (e: Event) => {
      const { categoryId } = (e as CustomEvent<{ categoryId: string }>).detail;
      setExpanded(true);
      setHighlighted(categoryId);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlighted(null), 2500);
      requestAnimationFrame(() => {
        const el = document.getElementById(`cat-${categoryId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    window.addEventListener("bsm:selectCategory", handler);
    return () => window.removeEventListener("bsm:selectCategory", handler);
  }, []);

  // Listen for search from Header
  useEffect(() => {
    const handler = (e: Event) => {
      const { query } = (e as CustomEvent<{ query: string }>).detail;
      setSearch(query);
    };
    window.addEventListener("bsm:searchProduct", handler);
    return () => window.removeEventListener("bsm:searchProduct", handler);
  }, []);

  const visibleCategories = expanded
    ? realCategories
    : realCategories.slice(0, INITIAL_SECTIONS);

  // Normalize search term
  const searchTerm = search.trim().toLowerCase();
  const filteredProducts = sortProducts(
    (searchTerm
      ? productList
          .map(p => ({ p, score: fuzzyScore(p.name, searchTerm) + fuzzyScore(p.category, searchTerm) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .map(({ p }) => p)
      : productList
    ).filter(p => p.price >= priceRange[0] && p.price <= priceRange[1]),
    sort
  );

  const handleQuickView = useCallback((p: LiveProduct) => setQuickViewProduct(p), []);

  return (
    <section id="productos" className="py-20 sm:py-28 bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            Abarrotes y <span className="text-primary">Productos</span> en Pucallpa
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            Bebidas, golosinas, carne, pollo, productos de limpieza y más. Compra online
            con delivery en Pucallpa. Paga con Yape o efectivo.
          </p>
        </div>

        {/* Search bar + Sort + Price Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-3xl mx-auto mb-4">
          <div className="relative flex-1" ref={searchRef}>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowHistory(false); }}
              onFocus={() => { if (!search && searchHistory.length > 0) setShowHistory(true); }}
              onKeyDown={(e) => {
                const items = suggestions.length > 0 ? suggestions : [];
                if (e.key === "ArrowDown") { e.preventDefault(); setSuggestionIdx(i => Math.min(i + 1, items.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSuggestionIdx(i => Math.max(i - 1, -1)); }
                else if (e.key === "Enter" && suggestionIdx >= 0 && items[suggestionIdx]) {
                  setSearch(items[suggestionIdx].name);
                  setSuggestions([]);
                  setSuggestionIdx(-1);
                }
                else if (e.key === "Escape") { setSuggestions([]); setShowHistory(false); }
              }}
              placeholder="Buscar producto…"
              className="w-full pl-10 pr-9 py-3 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-sm"
              autoComplete="off"
            />
            {search && (
              <button onClick={() => { setSearch(""); setSuggestions([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
            {/* Smart suggestions dropdown */}
            {suggestions.length > 0 && search.trim().length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-lg z-20 overflow-hidden">
                {suggestions.map((p, i) => (
                  <button key={p.id} onMouseDown={() => { setSearch(p.name); setSuggestions([]); setSuggestionIdx(-1); }}
                    className={cn("flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground transition-colors text-left", i === suggestionIdx ? "bg-primary/10" : "hover:bg-gray-50 dark:hover:bg-surface")}>
                    {p.image && <Image src={p.image} alt="" width={28} height={28} className="w-7 h-7 rounded-md object-cover shrink-0" unoptimized />}
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-muted shrink-0">S/{p.price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Search History Dropdown */}
            {showHistory && !search && searchHistory.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-lg z-20 overflow-hidden">
                <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Búsquedas recientes</p>
                {searchHistory.map((term) => (
                  <button key={term} onClick={() => { setSearch(term); setShowHistory(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                    <Clock className="h-3.5 w-3.5 text-muted shrink-0" />
                    {term}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="appearance-none pl-9 pr-8 py-3 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-sm cursor-pointer"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowPriceFilter(v => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-semibold transition-all shadow-sm",
                showPriceFilter
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-200 dark:border-card-border bg-white dark:bg-card text-foreground hover:border-primary"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Precio</span>
            </button>
          </div>
        </div>

        {/* Price Range Filter */}
        {showPriceFilter && (
          <div className="max-w-3xl mx-auto mb-6 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 shadow-sm animate-[fadeUp_0.2s_ease-out]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">Filtrar por precio</span>
              <span className="text-sm font-bold text-primary">S/{priceRange[0].toFixed(0)} — S/{priceRange[1].toFixed(0)}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted w-10">S/0</span>
              <div className="flex-1 flex flex-col gap-2">
                <input type="range" min={0} max={maxPrice} step={1} value={priceRange[0]} onChange={(e) => setPriceRange([Math.min(+e.target.value, priceRange[1] - 1), priceRange[1]])} className="w-full accent-primary" />
                <input type="range" min={0} max={maxPrice} step={1} value={priceRange[1]} onChange={(e) => setPriceRange([priceRange[0], Math.max(+e.target.value, priceRange[0] + 1)])} className="w-full accent-primary" />
              </div>
              <span className="text-xs text-muted w-14 text-right">S/{maxPrice}</span>
            </div>
          </div>
        )}

        {/* Category Filter Pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-8 -mx-4 px-4 sm:mx-0 sm:px-0">
          {realCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                if (!expanded) {
                  const idx = realCategories.indexOf(cat);
                  if (idx >= INITIAL_SECTIONS) {
                    setExpanded(true);
                    setTimeout(() => {
                      const el = document.getElementById(`cat-${cat.id}`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 120);
                  } else {
                    const el = document.getElementById(`cat-${cat.id}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                } else {
                  const el = document.getElementById(`cat-${cat.id}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className="shrink-0 flex items-center gap-2 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-full px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary hover:bg-primary/5 active:scale-95 transition-all duration-200 whitespace-nowrap shadow-sm"
            >
              <span className="text-base">{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Category Sections */}
        <div className="space-y-8">
          {loading ? (
            // Skeleton loaders while products are being fetched
            Array.from({ length: INITIAL_SECTIONS }).map((_, i) => (
              <SkeletonSection key={i} />
            ))
          ) : searchTerm ? (
            // When searching, show all matching products in a flat grid
            filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-semibold">No se encontraron productos</p>
                <p className="text-sm text-gray-400 mt-1">Intenta con otro término de búsqueda</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-card rounded-2xl p-5 sm:p-6">
                <p className="text-sm text-gray-500 mb-4">
                  {filteredProducts.length} resultado{filteredProducts.length !== 1 ? "s" : ""} para &ldquo;{search.trim()}&rdquo;
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {filteredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} onQuickView={handleQuickView} />
                  ))}
                </div>
              </div>
            )
          ) : (
            visibleCategories.map((cat) => (
              <CategorySection
                key={cat.id}
                categoryId={cat.id}
                highlight={highlighted === cat.id}
                productList={productList}
                onQuickView={handleQuickView}
              />
            ))
          )}
        </div>

        {/* Ver Más Block */}
        {!expanded && !searchTerm && (
          <div className="mt-8">
            <ShowMoreBlock onExpand={() => setExpanded(true)} />
          </div>
        )}

        {/* Cart summary CTA (shown when cart has items) */}
        <CartFloatCTA />
      </div>

      {/* Quick View Modal */}
      {quickViewProduct && (
        <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
      )}
    </section>
  );
}

// ── Floating Cart CTA (inside products section) ───────────────────────────────
function CartFloatCTA() {
  const { count, total, toggle } = useCart();
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!isClient || count === 0) return null;

  return (
    <div className="mt-10 flex justify-center animate-[fadeUp_0.4s_ease-out]">
      <button
        onClick={toggle}
        className="flex items-center gap-4 bg-primary text-white rounded-2xl px-6 py-4 shadow-2xl shadow-primary/30 hover:bg-primary-dark active:scale-[0.98] transition-all duration-200"
      >
        <div className="relative">
          <ShoppingCart className="h-6 w-6" />
          <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">
            {count}
          </span>
        </div>
        <div className="text-left">
          <p className="text-xs font-medium text-white/70">Ver pedido</p>
          <p className="font-bold text-base">S/{total.toFixed(2)} · {count} {count === 1 ? "producto" : "productos"}</p>
        </div>
        <ArrowRight className="h-5 w-5 text-white/70 ml-2" />
      </button>
    </div>
  );
}

