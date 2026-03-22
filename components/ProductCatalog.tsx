 "use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  startTransition,
  useMemo,
  memo,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Plus, Minus, Package, Search, X, ArrowUpDown, SlidersHorizontal, Clock, LayoutGrid, List } from "lucide-react";
import { categories } from "@/data/products";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";
import { onAppEvent } from "@/lib/events";
import type { Product } from "@/data/products";
import { ProductCard } from "./ProductCard";
import { useCachedData } from "@/hooks/use-cached-data";
import { levenshteinDistance } from "@/hooks/use-advanced-search";

// QuickViewModal loaded on-demand only when user clicks "Vista rápida"
const QuickViewModal = dynamic(() => import("@/components/QuickViewModal"), { ssr: false });

type LiveProduct = Product & { stock?: number; stockMin?: number };

// Only real categories (not "todos")
const realCategories = categories.filter((c) => c.id !== "todos");

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

// ── Per-category color themes ─────────────────────────────────────────────────
const CAT_THEME: Record<string, { emojiBg: string; dot: string; pillHover: string; linkBtn: string; sectionBorder: string }> = {
  "frutas-verduras": {
    emojiBg:       "bg-emerald-50 dark:bg-emerald-950/30",
    dot:           "bg-emerald-500",
    pillHover:     "hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/30",
    linkBtn:       "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white",
    sectionBorder: "border-l-4 border-l-emerald-400",
  },
  "abarrotes": {
    emojiBg:       "bg-amber-50 dark:bg-amber-950/30",
    dot:           "bg-amber-500",
    pillHover:     "hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-950/30",
    linkBtn:       "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500 hover:text-white",
    sectionBorder: "border-l-4 border-l-amber-400",
  },
  "carnes": {
    emojiBg:       "bg-red-50 dark:bg-red-950/30",
    dot:           "bg-red-500",
    pillHover:     "hover:border-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30",
    linkBtn:       "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-500 hover:text-white",
    sectionBorder: "border-l-4 border-l-red-400",
  },
  "lacteos": {
    emojiBg:       "bg-sky-50 dark:bg-sky-950/30",
    dot:           "bg-sky-500",
    pillHover:     "hover:border-sky-400 hover:text-sky-700 hover:bg-sky-50 dark:hover:text-sky-400 dark:hover:bg-sky-950/30",
    linkBtn:       "bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 hover:bg-sky-500 hover:text-white",
    sectionBorder: "border-l-4 border-l-sky-400",
  },
  "bebidas": {
    emojiBg:       "bg-violet-50 dark:bg-violet-950/30",
    dot:           "bg-violet-500",
    pillHover:     "hover:border-violet-400 hover:text-violet-700 hover:bg-violet-50 dark:hover:text-violet-400 dark:hover:bg-violet-950/30",
    linkBtn:       "bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 hover:bg-violet-500 hover:text-white",
    sectionBorder: "border-l-4 border-l-violet-400",
  },
  "limpieza": {
    emojiBg:       "bg-cyan-50 dark:bg-cyan-950/30",
    dot:           "bg-cyan-500",
    pillHover:     "hover:border-cyan-400 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:text-cyan-400 dark:hover:bg-cyan-950/30",
    linkBtn:       "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500 hover:text-white",
    sectionBorder: "border-l-4 border-l-cyan-400",
  },
};
const DEFAULT_CAT_THEME = {
  emojiBg:       "bg-primary/8 dark:bg-primary/15",
  dot:           "bg-primary",
  pillHover:     "hover:border-primary hover:text-primary hover:bg-primary/5",
  linkBtn:       "bg-primary/8 dark:bg-primary/15 text-primary hover:bg-primary hover:text-white",
  sectionBorder: "border-l-4 border-l-primary/40",
};
function getCatTheme(id: string) { return CAT_THEME[id] ?? DEFAULT_CAT_THEME; }

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

// ── U1: List View Row ─────────────────────────────────────────────────────────
function ListProductRowBase({ product, onQuickView }: { product: LiveProduct; onQuickView: (p: LiveProduct) => void }) {
  const { items, addItem, updateQty } = useCart();
  const { showToast } = useToast();
  const cartItem = items.find((i) => i.id === product.id);
  const qty = cartItem?.quantity ?? 0;
  const isOutOfStock = product.stock != null && product.stock <= 0;
  const isLowStock = !isOutOfStock && product.stock != null && product.stockMin != null && product.stock <= product.stockMin;

  return (
    <div
      onClick={() => onQuickView(product)}
      className="flex items-center gap-3 bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer"
    >
      <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-50 dark:bg-surface shrink-0">
        {product.image ? (
          <Image src={product.image} alt={product.name} fill className="object-cover" sizes="64px" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-6 w-6" /></div>
        )}
        {product.badge && (
          <span className="absolute top-0.5 left-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase text-white bg-primary shadow-sm leading-none">{product.badge}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-foreground truncate">{product.name}</h4>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted">{product.unit}</p>
          {isLowStock && (
            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded-full animate-pulse">¡Quedan {product.stock}!</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-base font-extrabold text-primary">S/{product.price.toFixed(2)}</span>
        {isOutOfStock ? (
          <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded-full">Agotado</span>
        ) : qty === 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); addItem(product); showToast(product.name, product.image); }}
            className="h-9 w-9 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all shadow-sm"
            aria-label={`Agregar ${product.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex items-center bg-primary rounded-xl overflow-hidden shadow-sm" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => updateQty(product.id, qty - 1)} className="h-9 w-8 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
            <span className="w-6 text-center font-bold text-white text-sm">{qty}</span>
            <button onClick={() => { addItem(product); showToast(product.name, product.image); }} className="h-9 w-8 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

const ListProductRow = memo(ListProductRowBase);

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

  // Exact substring — highest priority
  if (t.includes(q)) return 100 + (q.length / t.length) * 50;

  // Word-level matching: check how many query words are found in the text
  const qWords = q.split(/\s+/).filter(Boolean);
  const tWords = t.split(/\s+/).filter(Boolean);
  let wordHits = 0;
  for (const qw of qWords) {
    if (tWords.some(tw => tw.includes(qw) || qw.includes(tw))) wordHits++;
  }
  if (wordHits === qWords.length) return 85;
  if (wordHits > 0) return 60;

  // Levenshtein tolerance per word (handles 1-2 char typos)
  let editHits = 0;
  for (const qw of qWords) {
    const maxDist = qw.length <= 4 ? 1 : qw.length <= 7 ? 2 : 3;
    if (tWords.some(tw => levenshteinDistance(qw, tw) <= maxDist)) editHits++;
  }
  if (editHits === qWords.length) return 50;
  if (editHits > 0) return 30;

  // In-order character matching (original fuzzy)
  let ti = 0, qi = 0, score = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) { qi++; score += 10 - ti * 0.1; }
    ti++;
  }
  return qi === q.length ? Math.max(1, score) : 0;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ProductCatalog({ initialProducts = [] }: { initialProducts?: LiveProduct[] }) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("relevancia");
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [filterOnSale, setFilterOnSale] = useState(false);
  const [filterAvailable, setFilterAvailable] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<LiveProduct | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [suggestions, setSuggestions] = useState<LiveProduct[]>([]);
  const [suggestionIdx, setSuggestionIdx] = useState(-1);
  const [searchPage, setSearchPage] = useState(1);
  /* U1: Grid/List view toggle */
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("bsm-view-mode") as "grid" | "list") || "grid";
  });
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch live products from API (admin changes reflect here) - with caching
  const { data: apiProducts, isLoading: isLoadingProducts, isError: apiError, refetch: refetchProducts } = useCachedData<Array<LiveProduct & { active?: boolean }>>(
    "products",
    async () => {
      const response = await fetch("/api/products");
      if (!response.ok) return [];
      return response.json();
    },
    {
      staleTime: 2 * 60 * 1000, // 2 minutes - products don't change that often
      refetchOnFocus: true, // Refetch when user returns to tab
    }
  );

  // Compute productList from API data.
  // Images are always taken from static data (authoritative source) so stale DB photo IDs
  // never cause 404s even when the DB was seeded before a static-data image fix.
  const productList = useMemo(() => {
    if (apiProducts && Array.isArray(apiProducts) && apiProducts.length > 0) {
      const staticImageMap = new Map(initialProducts.map(p => [p.id, p.image]));
      return apiProducts
        .filter((p) => p.active !== false)
        .map(p => ({ ...p, image: staticImageMap.get(p.id) ?? p.image }));
    }
    return initialProducts; // Fallback to static data
  }, [apiProducts, initialProducts]);

  // Compute maxPrice from productList
  const maxPrice = useMemo(() => {
    return Math.ceil(Math.max(...productList.map(p => p.price), 100));
  }, [productList]);

  // Price range state - will be updated by user interaction
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);

  // Only show skeleton when loading AND no fallback data is available
  const loading = isLoadingProducts && productList.length === 0;

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

  // Save search on commit (debounced) + compute suggestions with debounce
  const searchCommitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(searchCommitTimer.current);
    clearTimeout(suggestTimer.current);
    const term = search.trim();
    if (term.length >= 2) {
      // Debounce suggestions computation (300ms) to avoid CPU work per keystroke
      suggestTimer.current = setTimeout(() => {
        const scored = productList
          .map(p => ({ p, score: fuzzyScore(p.name, term) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ p }) => p);
        startTransition(() => { setSuggestions(scored); setSuggestionIdx(-1); });
      }, 300);
      searchCommitTimer.current = setTimeout(() => {
        saveSearchTerm(term);
        setSearchHistory(getSearchHistory());
      }, 1500);
    } else {
      startTransition(() => setSuggestions([]));
    }
    return () => {
      clearTimeout(searchCommitTimer.current);
      clearTimeout(suggestTimer.current);
    };
  }, [search, productList]);

  // Listen for category selection events from Header mega menu
  useEffect(() => {
    const unsub = onAppEvent("selectCategory", ({ categoryId }) => {
      setHighlighted(categoryId);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlighted(null), 2500);
      requestAnimationFrame(() => {
        const el = document.getElementById(`cat-${categoryId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    return unsub;
  }, []);

  // Listen for search from Header
  useEffect(() => {
    const unsub = onAppEvent("searchProduct", ({ query }) => {
      setSearch(query);
    });
    return unsub;
  }, []);

  // Reset to first page whenever search term or filters change
  useEffect(() => {
    startTransition(() => setSearchPage(1));
  }, [search, sort, priceRange, filterOnSale, filterAvailable]);

  // Debounced search term to avoid running fuzzy scoring on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const searchTerm = debouncedSearch;
  const filteredProducts = useMemo(() => sortProducts(
    (searchTerm
      ? productList
          .map(p => ({ p, score: fuzzyScore(p.name, searchTerm) + fuzzyScore(p.category, searchTerm) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .map(({ p }) => p)
      : productList
    )
      .filter(p => p.price >= priceRange[0] && p.price <= priceRange[1])
      .filter(p => !filterOnSale || (p.badge && /\d+%|oferta|promo|sale/i.test(p.badge)))
      .filter(p => !filterAvailable || p.stock === undefined || p.stock > 0),
    sort
  ), [searchTerm, productList, priceRange, filterOnSale, filterAvailable, sort]);

  const handleQuickView = useCallback((p: LiveProduct) => setQuickViewProduct(p), []);

  const ITEMS_PER_PAGE = 24;
  const totalSearchPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const paginatedSearchProducts = filteredProducts.slice(
    (searchPage - 1) * ITEMS_PER_PAGE,
    searchPage * ITEMS_PER_PAGE
  );

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
            <button
              onClick={() => setFilterOnSale(v => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-semibold transition-all shadow-sm whitespace-nowrap",
                filterOnSale
                  ? "border-red-400 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                  : "border-gray-200 dark:border-card-border bg-white dark:bg-card text-foreground hover:border-red-400"
              )}
            >
              <span className="hidden sm:inline">🏷️ Oferta</span>
              <span className="sm:hidden">🏷️</span>
            </button>
            <button
              onClick={() => setFilterAvailable(v => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-semibold transition-all shadow-sm whitespace-nowrap",
                filterAvailable
                  ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                  : "border-gray-200 dark:border-card-border bg-white dark:bg-card text-foreground hover:border-emerald-400"
              )}
            >
              <span className="hidden sm:inline">✅ Disponible</span>
              <span className="sm:hidden">✅</span>
            </button>
            {/* U1: Grid/List toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-accent rounded-xl p-0.5 shadow-sm">
              <button
                onClick={() => { setViewMode("grid"); localStorage.setItem("bsm-view-mode", "grid"); }}
                className={cn("p-2.5 rounded-lg transition-all", viewMode === "grid" ? "bg-white dark:bg-card text-primary shadow-sm" : "text-gray-400 hover:text-gray-600")}
                aria-label="Vista cuadrícula"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setViewMode("list"); localStorage.setItem("bsm-view-mode", "list"); }}
                className={cn("p-2.5 rounded-lg transition-all", viewMode === "list" ? "bg-white dark:bg-card text-primary shadow-sm" : "text-gray-400 hover:text-gray-600")}
                aria-label="Vista lista"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
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

        {/* Active filters bar */}
        {(search || filterOnSale || filterAvailable || (priceRange[0] > 0 || priceRange[1] < maxPrice)) && (
          <div className="max-w-3xl mx-auto mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted">Filtros activos:</span>
            {search && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                🔍 &ldquo;{search}&rdquo;
                <button onClick={() => setSearch("")} className="ml-0.5 hover:text-primary-dark"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterOnSale && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-full">
                🏷️ Oferta
                <button onClick={() => setFilterOnSale(false)} className="ml-0.5"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterAvailable && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full">
                ✅ Disponible
                <button onClick={() => setFilterAvailable(false)} className="ml-0.5"><X className="h-3 w-3" /></button>
              </span>
            )}
            {(priceRange[0] > 0 || priceRange[1] < maxPrice) && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full">
                S/{priceRange[0]}–S/{priceRange[1]}
                <button onClick={() => setPriceRange([0, maxPrice])} className="ml-0.5"><X className="h-3 w-3" /></button>
              </span>
            )}
            <button
              onClick={() => { setSearch(""); setFilterOnSale(false); setFilterAvailable(false); setPriceRange([0, maxPrice]); }}
              className="text-xs font-bold text-muted hover:text-foreground ml-auto underline underline-offset-2"
            >
              Limpiar todo
            </button>
          </div>
        )}
        {/* Product count bar — visible when filters are active (not in search mode) */}
        {!searchTerm && (filterOnSale || filterAvailable || priceRange[0] > 0 || priceRange[1] < maxPrice) && (
          <div className="max-w-3xl mx-auto mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">
              <span className="text-primary font-bold">{filteredProducts.length}</span>{" "}
              producto{filteredProducts.length !== 1 ? "s" : ""} encontrado{filteredProducts.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {apiError && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/40 text-xs text-amber-700 dark:text-amber-400">
            <span>⚠️ No se pudo cargar el catálogo actualizado. Mostrando datos de muestra.</span>
            <button
              onClick={refetchProducts}
              className="shrink-0 font-bold underline hover:no-underline transition-all"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Category Sections */}
        <div className="space-y-8">
          {loading ? (
            // Skeleton loaders while products are being fetched
            Array.from({ length: realCategories.length }).map((_, i) => (
              <SkeletonSection key={i} />
            ))
          ) : searchTerm ? (
            // When searching, show all matching products in a flat grid
            filteredProducts.length === 0 ? (
              (() => {
                // Find the closest product name to suggest
                const bestMatch = productList
                  .map(p => ({ p, d: levenshteinDistance(p.name.toLowerCase(), search.trim().toLowerCase()) }))
                  .sort((a, b) => a.d - b.d)[0];
                const suggestion = bestMatch && bestMatch.d <= Math.max(3, Math.floor(search.trim().length / 2)) ? bestMatch.p.name : null;
                return (
                  <div className="text-center py-12">
                    <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-semibold">No se encontraron productos</p>
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
                      <p className="text-sm text-gray-400 mt-1">Intenta con otro término de búsqueda</p>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="bg-white dark:bg-card rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-500">
                    {filteredProducts.length} resultado{filteredProducts.length !== 1 ? "s" : ""} para &ldquo;{search.trim()}&rdquo;
                    {totalSearchPages > 1 && (
                      <span className="ml-2 text-gray-400">· página {searchPage} de {totalSearchPages}</span>
                    )}
                  </p>
                </div>
                <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3" : "space-y-2"}>
                  {paginatedSearchProducts.map((product) => (
                    viewMode === "list" ? (
                      <ListProductRow key={product.id} product={product} onQuickView={handleQuickView} />
                    ) : (
                      <ProductCard key={product.id} product={product} onQuickView={handleQuickView} />
                    )
                  ))}
                </div>
                {totalSearchPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6 pt-5 border-t border-gray-100 dark:border-card-border">
                    <button
                      disabled={searchPage <= 1}
                      onClick={() => { setSearchPage(p => p - 1); document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      ← Anterior
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalSearchPages }, (_, i) => i + 1).map(pg => (
                        <button
                          key={pg}
                          onClick={() => { setSearchPage(pg); document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                          className={cn(
                            "h-8 w-8 rounded-full text-sm font-bold transition-all",
                            pg === searchPage
                              ? "bg-primary text-white shadow-md shadow-primary/25"
                              : "text-gray-500 hover:bg-primary/10 hover:text-primary"
                          )}
                        >
                          {pg}
                        </button>
                      ))}
                    </div>
                    <button
                      disabled={searchPage >= totalSearchPages}
                      onClick={() => { setSearchPage(p => p + 1); document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Siguiente →
                    </button>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="space-y-10">
              {realCategories.map((cat) => {
                const catProducts = filteredProducts.filter((p) => p.category === cat.id);
                if (catProducts.length === 0) return null;
                const theme = getCatTheme(cat.id);
                return (
                  <div
                    key={cat.id}
                    id={`cat-${cat.id}`}
                    className={highlighted === cat.id ? "ring-2 ring-primary ring-offset-4 rounded-xl p-3 scroll-mt-4" : "scroll-mt-4"}
                  >
                    <div className={cn("flex items-center gap-2.5 mb-4 pl-3", theme.sectionBorder)}>
                      <span className={cn("flex items-center justify-center h-9 w-9 rounded-xl text-xl leading-none shrink-0", theme.emojiBg)}>
                        {cat.emoji}
                      </span>
                      <div>
                        <h3 className="text-base font-extrabold text-foreground leading-tight">{cat.label}</h3>
                        <p className="text-xs text-muted">{catProducts.length} producto{catProducts.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3" : "space-y-2"}>
                      {catProducts.map((product) =>
                        viewMode === "list" ? (
                          <ListProductRow key={product.id} product={product} onQuickView={handleQuickView} />
                        ) : (
                          <ProductCard key={product.id} product={product} onQuickView={handleQuickView} />
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Quick View Modal */}
      {quickViewProduct && (
        <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
      )}
    </section>
  );
}

