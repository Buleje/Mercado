"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  startTransition,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Plus,
  Minus,
  ShoppingCart,
  Search,
  X,
  ArrowUpDown,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Package,
  Heart,
  ExternalLink,
} from "@buleje/design-system/icons";
import { getProductSlug, categories } from "@/data/products";
import { useStoreProducts } from "@/hooks/use-store-products";
import useProductAnalyticsTracking from "@/hooks/useProductAnalyticsTracking";
import { getCategoryIcon } from "@/lib/category-icons";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useFavorites } from "@/contexts/favorites-context";
import { cn } from "@/lib/utils";
import type { Product } from "@/data/products";
import { ProductCard } from "./ProductCard";
import { levenshteinDistance } from "@/hooks/use-advanced-search";

type LiveProduct = Product & { stock?: number; stockMin?: number };

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

function fuzzyScore(text: string, query: string): number {
  if (!query) return 0;
  const t = text.toLowerCase(),
    q = query.toLowerCase();
  if (t.includes(q)) return 100 + (q.length / t.length) * 50;
  const qWords = q.split(/\s+/).filter(Boolean);
  const tWords = t.split(/\s+/).filter(Boolean);
  let wordHits = 0;
  for (const qw of qWords) {
    if (tWords.some((tw) => tw.includes(qw) || qw.includes(tw))) wordHits++;
  }
  if (wordHits === qWords.length) return 85;
  if (wordHits > 0) return 60;
  let editHits = 0;
  for (const qw of qWords) {
    const maxDist = qw.length <= 4 ? 1 : qw.length <= 7 ? 2 : 3;
    if (tWords.some((tw) => levenshteinDistance(qw, tw) <= maxDist)) editHits++;
  }
  if (editHits === qWords.length) return 50;
  if (editHits > 0) return 30;
  return 0;
}

// ── List Row ──────────────────────────────────────────────────────────────────
function ListProductRow({
  product,
  onQuickView,
}: {
  product: LiveProduct;
  onQuickView: (p: LiveProduct) => void;
}) {
  const { items, addItem, updateQty } = useCart();
  const { showToast } = useToast();
  const cartItem = items.find((i) => i.id === product.id);
  const qty = cartItem?.quantity ?? 0;
  const isOutOfStock = product.stock != null && product.stock <= 0;
  const isLowStock =
    !isOutOfStock &&
    product.stock != null &&
    product.stockMin != null &&
    product.stock <= product.stockMin;

  return (
    <div
      onClick={() => onQuickView(product)}
      data-testid="product-card"
      className="flex items-center gap-3 bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-3 hover:shadow-[var(--shadow-md)] hover:border-primary/20 transition-all cursor-pointer"
    >
      <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-50 dark:bg-surface shrink-0">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-300">
            <Package className="h-6 w-6" />
          </div>
        )}
        {product.badge && (
          <span className="absolute top-0.5 left-0.5 rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase text-white bg-primary shadow-[var(--shadow-sm)] leading-none">
            {product.badge}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">
          {product.name}
        </h4>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted">{product.unit}</p>
          {isLowStock && (
            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-600)] dark:text-amber-400 bg-amber-50 dark:bg-[var(--data-warning-500)]/10 px-1.5 py-0.5 rounded-full animate-pulse">
              ¡Quedan {product.stock}!
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-base font-extrabold text-primary">
          S/{Number(product.price).toFixed(2)}
        </span>
        {isOutOfStock ? (
          <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-red-50 dark:bg-[var(--data-error-500)]/10 px-2 py-1 rounded-full">
            Agotado
          </span>
        ) : qty === 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              addItem(product);
              showToast(product.name, product.image);
            }}
            className="h-9 w-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all shadow-[var(--shadow-sm)]"
            aria-label={`Agregar ${product.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : (
          <div
            className="flex items-center bg-primary rounded-xl overflow-hidden shadow-[var(--shadow-sm)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => updateQty(product.id, qty - 1)}
              className="h-9 w-8 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-6 text-center font-bold text-white text-sm">
              {qty}
            </span>
            <button
              onClick={() => {
                addItem(product);
                showToast(product.name, product.image);
              }}
              className="h-9 w-8 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick View Modal (simplified for category page) ───────────────────────────
function QuickViewModal({
  product,
  onClose,
}: {
  product: LiveProduct;
  onClose: () => void;
}) {
  const { items, addItem, updateQty } = useCart();
  const { showToast } = useToast();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const qty = items.find((i) => i.id === product.id)?.quantity ?? 0;
  const isOutOfStock = product.stock != null && product.stock <= 0;
  const fav = isFavorite(String(product.id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleAdd = () => {
    if (isOutOfStock) return;
    addItem(product);
    showToast(product.name, product.image);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-[var(--surface-raised)] rounded-t-3xl sm:rounded-2xl shadow-[var(--shadow-xl)] max-w-lg w-full max-h-[85vh] overflow-y-auto animate-[scaleIn_0.2s_ease-out] border border-[var(--rule-base)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/80 dark:bg-[var(--surface-raised)]/80 hover:bg-white dark:hover:bg-[var(--surface-raised)] transition-colors shadow-[var(--shadow-md)]"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5 text-gray-600 dark:text-muted" />
        </button>
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        <div className="relative aspect-video bg-gray-50 dark:bg-surface">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 512px) 100vw, 512px"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-gray-300">
              <Package className="h-16 w-16" />
            </div>
          )}
          {product.badge && (
            <span className="absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-bold uppercase text-white bg-primary shadow-[var(--shadow-sm)]">
              {product.badge}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFav(String(product.id));
            }}
            className={cn(
              "absolute top-3 right-14 z-10 flex items-center justify-center h-10 w-10 rounded-full transition-all shadow-[var(--shadow-md)]",
              fav
                ? "bg-[var(--data-error-500)] text-white"
                : "bg-white/80 dark:bg-[var(--surface-raised)]/80 text-gray-400 hover:text-[var(--data-error-500)]"
            )}
            aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
          >
            <Heart className={cn("h-5 w-5", fav && "fill-current")} />
          </button>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <h3 className="text-xl font-extrabold text-[var(--text-primary)] mb-1">
                {product.name}
              </h3>
              <p className="text-sm text-muted">
                {categories.find((c) => c.id === product.category)?.emoji}{" "}
                {categories.find((c) => c.id === product.category)?.label ??
                  product.category}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-2xl font-extrabold text-primary">
                S/{Number(product.price).toFixed(2)}
              </span>
              <span className="block text-sm text-muted">
                por {product.unit}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              {product.stock != null && (
                <span
                  className={cn(
                    "text-xs font-semibold px-2.5 py-1 rounded-full",
                    product.stock <= 0
                      ? "bg-red-50 text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/10"
                      : product.stock <= (product.stockMin ?? 5)
                        ? "bg-amber-50 text-[var(--data-warning-600)] dark:bg-[var(--data-warning-500)]/10"
                        : "bg-emerald-50 text-[var(--data-success-600)] dark:bg-[var(--data-success-500)]/10"
                  )}
                >
                  {product.stock <= 0
                    ? "Agotado"
                    : `${product.stock} en stock`}
                </span>
              )}
            </div>
            {qty === 0 ? (
              <button
                onClick={handleAdd}
                disabled={isOutOfStock}
                className="flex items-center justify-center h-9 w-9 rounded-full bg-primary text-white shadow-[var(--shadow-lg)] hover:bg-primary-dark active:scale-95 disabled:opacity-50 shrink-0"
                aria-label="Agregar al carrito"
              >
                <ShoppingCart className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-primary rounded-xl overflow-hidden shadow-[var(--shadow-md)]">
                  <button
                    onClick={() => updateQty(product.id, qty - 1)}
                    className="h-10 w-9 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-7 text-center font-bold text-white">
                    {qty}
                  </span>
                  <button
                    onClick={handleAdd}
                    className="h-10 w-9 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-sm font-semibold text-primary">
                  En carrito
                </span>
              </div>
            )}
          </div>
          <Link
            href={`/tienda/${getProductSlug(product)}`}
            className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary hover:text-white transition-all active:scale-[0.98]"
            onClick={onClose}
          >
            Ver detalles completos <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── ITEMS PER PAGE ────────────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 24;

// ── Main Component ────────────────────────────────────────────────────────────
export default function CategoryCatalog({
  categoryId,
  categoryLabel,
  categoryEmoji,
}: {
  categoryId: string;
  categoryLabel: string;
  categoryEmoji: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { products, categories, isLoading: isStoreLoading } = useStoreProducts();
  const { trackClick } = useProductAnalyticsTracking();

  // Read initial state from URL
  const initialSearch = searchParams.get("q") ?? "";
  const initialSort = (searchParams.get("orden") as SortKey) || "relevancia";
  const initialPriceMin = Number(searchParams.get("precio_min")) || 0;
  const initialPriceMax = Number(searchParams.get("precio_max")) || 1000;

  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<SortKey>(
    SORT_OPTIONS.some((o) => o.id === initialSort) ? initialSort : "relevancia"
  );
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<LiveProduct | null>(
    null
  );
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (
      (localStorage.getItem("buleje-view-mode") as "grid" | "list") || "grid"
    );
  });

  // useStoreProducts NUNCA cae en fallback a data/products
  // Si el tenant no tiene productos, retorna [] — empty state correcto
  const isLoading = isStoreLoading;
  const _isError = false;

  // Only products for this category (solo productos reales del tenant)
  const categoryProducts = useMemo(
    () => (products as LiveProduct[]).filter((p) => p.category === categoryId),
    [products, categoryId]
  );

  const maxPrice = useMemo(
    () => Math.ceil(Math.max(...categoryProducts.map((p) => p.price), 100)),
    [categoryProducts]
  );

  const [priceRange, setPriceRange] = useState<[number, number]>([
    initialPriceMin,
    Math.min(initialPriceMax, 1000),
  ]);

  const loading = isLoading && categoryProducts.length === 0;

  // Sync filters → URL (debounced)
  const urlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (sort !== "relevancia") params.set("orden", sort);
      if (priceRange[0] > 0) params.set("precio_min", String(priceRange[0]));
      if (priceRange[1] < maxPrice)
        params.set("precio_max", String(priceRange[1]));
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    }, 400);
    return () => clearTimeout(urlTimer.current);
  }, [search, sort, priceRange, maxPrice, pathname, router]);

  // Reset page on filter change
  useEffect(() => {
    startTransition(() => setPage(1));
  }, [search, sort, priceRange]);

  // Filtered + sorted products
  const searchTerm = search.trim().toLowerCase();
  const filteredProducts = sortProducts(
    (searchTerm
      ? categoryProducts
          .map((p) => ({
            p,
            score:
              fuzzyScore(p.name, searchTerm) +
              fuzzyScore(p.category, searchTerm),
          }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .map(({ p }) => p)
      : categoryProducts
    ).filter(
      (p) => p.price >= priceRange[0] && p.price <= priceRange[1]
    ),
    sort
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / ITEMS_PER_PAGE)
  );
  const paginated = filteredProducts.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const handleQuickView = useCallback(
    (p: LiveProduct) => {
      trackClick(p.id);
      setQuickViewProduct(p);
    },
    [trackClick]
  );

  // Other categories for navigation
  const otherCategories = categories.filter(
    (c) => c.id !== "todos" && c.id !== categoryId
  );

  return (
    <section id="productos" className="py-12 sm:py-16 bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Stats bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
              {categoryLabel}
            </h2>
            <p className="text-sm text-muted mt-1">
              {categoryProducts.length} productos disponibles
            </p>
          </div>
          <Link
            href="/tienda"
            className="text-sm font-semibold text-primary hover:underline"
          >
            ← Ver todo el catálogo
          </Link>
        </div>

        {/* Other categories */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
          {otherCategories.map((cat) => {
            const Icon = getCategoryIcon(cat.id);
            return (
              <Link
                key={cat.id}
                href={`/tienda/categoria/${cat.id}`}
                className="shrink-0 flex items-center gap-2 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-primary)] text-[var(--text-secondary)] hover:border-primary hover:text-primary hover:bg-primary/5 active:scale-95 transition-all duration-[var(--dur-fast)] whitespace-nowrap shadow-[var(--shadow-sm)]"
              >
                <Icon size={18} className="text-[var(--text-secondary)] hover:text-[var(--accent)]" />
                {cat.label}
              </Link>
            );
          })}
        </div>

        {/* Search + Sort + Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-3xl mx-auto mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Buscar en ${categoryLabel}...`}
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-[var(--shadow-sm)]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-surface transition-colors"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="appearance-none pl-9 pr-8 py-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-[var(--shadow-sm)] cursor-pointer"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowPriceFilter((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-semibold transition-all shadow-[var(--shadow-sm)]",
                showPriceFilter
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-primary"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Precio</span>
            </button>
            <div className="flex items-center bg-gray-100 dark:bg-accent rounded-xl p-0.5 shadow-[var(--shadow-sm)]">
              <button
                onClick={() => {
                  setViewMode("grid");
                  localStorage.setItem("buleje-view-mode", "grid");
                }}
                className={cn(
                  "p-2.5 rounded-lg transition-all",
                  viewMode === "grid"
                    ? "bg-[var(--surface-raised)] text-primary shadow-[var(--shadow-sm)]"
                    : "text-gray-400 hover:text-gray-600"
                )}
                aria-label="Vista cuadrícula"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setViewMode("list");
                  localStorage.setItem("buleje-view-mode", "list");
                }}
                className={cn(
                  "p-2.5 rounded-lg transition-all",
                  viewMode === "list"
                    ? "bg-[var(--surface-raised)] text-primary shadow-[var(--shadow-sm)]"
                    : "text-gray-400 hover:text-gray-600"
                )}
                aria-label="Vista lista"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Price filter */}
        {showPriceFilter && (
          <div className="max-w-3xl mx-auto mb-6 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 shadow-[var(--shadow-sm)] animate-[fadeUp_0.2s_ease-out]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Filtrar por precio
              </span>
              <span className="text-sm font-bold text-primary">
                S/{priceRange[0].toFixed(0)} — S/{priceRange[1].toFixed(0)}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted w-10">S/0</span>
              <div className="flex-1 flex flex-col gap-2">
                <input
                  type="range"
                  min={0}
                  max={maxPrice}
                  step={1}
                  value={priceRange[0]}
                  onChange={(e) =>
                    setPriceRange([
                      Math.min(+e.target.value, priceRange[1] - 1),
                      priceRange[1],
                    ])
                  }
                  className="w-full accent-primary"
                />
                <input
                  type="range"
                  min={0}
                  max={maxPrice}
                  step={1}
                  value={priceRange[1]}
                  onChange={(e) =>
                    setPriceRange([
                      priceRange[0],
                      Math.max(+e.target.value, priceRange[0] + 1),
                    ])
                  }
                  className="w-full accent-primary"
                />
              </div>
              <span className="text-xs text-muted w-14 text-right">
                S/{maxPrice}
              </span>
            </div>
          </div>
        )}

        {/* El error notice fue eliminado — useStoreProducts maneja el estado internamente */}

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] overflow-hidden flex flex-col animate-pulse"
              >
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
            ))}
          </div>
        ) : categoryProducts.length === 0 ? (
          // Tenant sin productos en esta categoría — empty state informativo (NO fallback a data/products)
          <div className="text-center py-16 space-y-4">
            <Package className="h-16 w-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400">Tu catálogo está en preparación</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">Agrega productos desde tu panel de administración para empezar a vender.</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          (() => {
            const bestMatch = categoryProducts
              .map((p) => ({
                p,
                d: levenshteinDistance(
                  p.name.toLowerCase(),
                  search.trim().toLowerCase()
                ),
              }))
              .sort((a, b) => a.d - b.d)[0];
            const suggestion =
              bestMatch &&
              bestMatch.d <=
                Math.max(3, Math.floor(search.trim().length / 2))
                ? bestMatch.p.name
                : null;
            return (
              <div className="text-center py-12">
                <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-semibold">
                  No se encontraron productos
                </p>
                {suggestion ? (
                  <p className="text-sm text-gray-400 mt-2">
                    ¿Quisiste decir{" "}
                    <button
                      onClick={() => setSearch(suggestion)}
                      className="text-primary font-semibold hover:underline"
                    >
                      &ldquo;{suggestion}&rdquo;
                    </button>
                    ?
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">
                    Intenta con otro término de búsqueda
                  </p>
                )}
              </div>
            );
          })()
        ) : (
          <>
            {searchTerm && (
              <p className="text-sm text-gray-500 mb-4">
                {filteredProducts.length} resultado
                {filteredProducts.length !== 1 ? "s" : ""} para &ldquo;
                {search.trim()}&rdquo;
              </p>
            )}
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3"
                  : "space-y-2"
              }
            >
              {paginated.map((product) =>
                viewMode === "list" ? (
                  <ListProductRow
                    key={product.id}
                    product={product}
                    onQuickView={handleQuickView}
                  />
                ) : (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onQuickView={handleQuickView}
                  />
                )
              )}
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8 pt-6 border-t border-[var(--rule-base)]">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((p) => p - 1);
                    document
                      .getElementById("productos")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border border-[var(--rule-base)] text-gray-600 dark:text-muted hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  ← Anterior
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (pg) => (
                      <button
                        key={pg}
                        onClick={() => {
                          setPage(pg);
                          document
                            .getElementById("productos")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }}
                        className={cn(
                          "h-8 w-8 rounded-full text-sm font-bold transition-all",
                          pg === page
                            ? "bg-primary text-white shadow-[var(--shadow-md)] shadow-primary/25"
                            : "text-gray-500 hover:bg-primary/10 hover:text-primary"
                        )}
                      >
                        {pg}
                      </button>
                    )
                  )}
                </div>
                <button
                  disabled={page >= totalPages}
                  onClick={() => {
                    setPage((p) => p + 1);
                    document
                      .getElementById("productos")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border border-[var(--rule-base)] text-gray-600 dark:text-muted hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick View Modal */}
      {quickViewProduct && (
        <QuickViewModal
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}
    </section>
  );
}
