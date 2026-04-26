 "use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  startTransition,
  useMemo,
  memo,
  useContext,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Plus, Minus, Package, Search, X, ArrowUpDown, SlidersHorizontal, Clock, LayoutGrid, List } from "@buleje/design-system/icons";
import { ProductBadge, ProductPrice, type ProductBadgeIntent } from "@buleje/design-system";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { SettingsContext } from "@/contexts/settings-context";
import { cn } from "@/lib/utils";
import { onAppEvent } from "@/lib/events";
import type { Product } from "@/data/products";
import { ProductCard } from "./ProductCard";
import { useCachedData } from "@/hooks/use-cached-data";
import { levenshteinDistance } from "@/hooks/use-advanced-search";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { CanastaVacia } from "@/components/ui-system/illustrations";

// QuickViewModal loaded on-demand only when user clicks "Vista rápida"
const QuickViewModal = dynamic(() => import("@/components/QuickViewModal"), { ssr: false });

type LiveProduct = Product & { stock?: number; stockMin?: number; rating?: number; reviewCount?: number };

// realCategories se deriva dinámicamente de productList en el componente

// Map string badges del backend → intent canónico del DS (Ola 2 — ADR-075).
const BADGE_INTENT: Record<string, ProductBadgeIntent> = {
  Popular: "popular",
  Oferta: "offer",
  Fresco: "fresh",
  Nuevo: "new",
  Premium: "premium",
};

type SortKey = "relevancia" | "precio-asc" | "precio-desc" | "nombre" | "popular" | "newest" | "rating" | "delivery";
const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "relevancia", label: "Relevancia" },
  { id: "popular", label: "Más vendidos" },
  { id: "newest", label: "Más nuevos" },
  { id: "rating", label: "Mejor calificación" },
  { id: "delivery", label: "Envío más rápido" },
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
  else if (key === "popular") {
    // Primero los marcados isTopSeller, luego los que tienen badge "Popular", resto por id estable
    sorted.sort((a, b) => {
      const aTop = (a as LiveProduct & { isTopSeller?: boolean }).isTopSeller;
      const bTop = (b as LiveProduct & { isTopSeller?: boolean }).isTopSeller;
      const aScore = (aTop ? 100 : 0) + (a.badge === "Popular" ? 50 : 0);
      const bScore = (bTop ? 100 : 0) + (b.badge === "Popular" ? 50 : 0);
      return bScore !== aScore ? bScore - aScore : a.id - b.id;
    });
  }
  else if (key === "newest") {
    // Usa createdAt si existe (string ISO), sino fallback a id desc (mayor id = más reciente)
    sorted.sort((a, b) => {
      const aTime = (a as LiveProduct & { createdAt?: string }).createdAt
        ? new Date((a as LiveProduct & { createdAt?: string }).createdAt!).getTime()
        : a.id;
      const bTime = (b as LiveProduct & { createdAt?: string }).createdAt
        ? new Date((b as LiveProduct & { createdAt?: string }).createdAt!).getTime()
        : b.id;
      return bTime - aTime;
    });
  }
  else if (key === "rating") {
    // Productos con rating primero; sin rating van al final
    sorted.sort((a, b) => {
      const aR = a.rating ?? -1;
      const bR = b.rating ?? -1;
      return bR !== aR ? bR - aR : (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
    });
  }
  else if (key === "delivery") {
    // avgPrepTime asc si existe; sino orden estable por id
    sorted.sort((a, b) => {
      const aT = (a as LiveProduct & { avgPrepTime?: number }).avgPrepTime ?? 9999;
      const bT = (b as LiveProduct & { avgPrepTime?: number }).avgPrepTime ?? 9999;
      return aT !== bT ? aT - bT : a.id - b.id;
    });
  }
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

/**
 * #49: Lazy category section — defers rendering of below-fold category grids
 * until the section enters the viewport via IntersectionObserver.
 * First 2 categories render immediately; the rest show skeletons until scrolled near.
 */
function LazyCategorySection({
  children,
  eager = false,
  productCount = 6,
}: {
  children: React.ReactNode;
  eager?: boolean;
  productCount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (eager) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  if (visible) return <>{children}</>;

  return (
    <div ref={ref} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3">
      {Array.from({ length: Math.min(productCount, 6) }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
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
          <div className="absolute top-0.5 left-0.5 scale-75 origin-top-left">
            <ProductBadge intent={BADGE_INTENT[product.badge] ?? "popular"}>{product.badge}</ProductBadge>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-foreground truncate">{product.name}</h4>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted">{product.unit}</p>
          {isLowStock && (
            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded-full">¡Quedan {product.stock}!</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <ProductPrice price={product.price} size="sm" />
        {isOutOfStock ? (
          <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border border-[var(--rule-base)] px-2 py-1 rounded-full">Agotado</span>
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
const SEARCH_HISTORY_KEY = "buleje-recent-searches";
const MAX_HISTORY = 10;

// MK-9: Trending searches (hardcoded por ahora — máx 5 visibles)
const TRENDING_SEARCHES = [
  "Pollo a la brasa",
  "Cerveza",
  "Pizza",
  "Hamburguesa",
  "Helado",
];

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
// MK-9: Show recientes + trending — retorna null si input no está vacío
function buildSearchDropdown(history: string[]): { recientes: string[]; trending: string[] } | null {
  return { recientes: history.slice(0, 3), trending: TRENDING_SEARCHES };
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
  const settings = useContext(SettingsContext);
  const storeName = settings?.storeTheme?.name || settings?.businessName || "tu tienda";
  const storeSlogan = settings?.storeTheme?.slogan || settings?.storeTheme?.description || "Compra online con delivery a domicilio. Paga con Yape o efectivo.";
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("relevancia");
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [filterOnSale, setFilterOnSale] = useState(false);
  const [filterAvailable, setFilterAvailable] = useState(false);
  const [filterOutOfStock, setFilterOutOfStock] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<LiveProduct | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [suggestions, setSuggestions] = useState<LiveProduct[]>([]);
  const [suggestionIdx, setSuggestionIdx] = useState(-1);
  const [searchPage, setSearchPage] = useState(1);
  /* U1: Grid/List view toggle */
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("buleje-view-mode") as "grid" | "list") || "grid";
  });
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef = useRef<HTMLDivElement>(null);

  // Lazy-init: read sessionStorage once on mount (avoids impure Date.now() during render)
  const [productsInitialData] = useState<Array<LiveProduct & { active?: boolean }> | undefined>(() => {
    try {
      const cached = sessionStorage.getItem("products-cache");
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 5 * 60 * 1000) return data;
      }
    } catch { /* ignore */ }
    return undefined;
  });

  // Fetch live products from API (admin changes reflect here) - with in-memory + sessionStorage caching
  const { data: apiProducts, isLoading: isLoadingProducts, isError: apiError, refetch: refetchProducts } = useCachedData<Array<LiveProduct & { active?: boolean }>>(
    "products",
    async () => {
      const response = await fetch("/api/products");
      if (!response.ok) {
        // Fallback: try sessionStorage cache
        try {
          const cached = sessionStorage.getItem("products-cache");
          if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < 5 * 60 * 1000) return data;
          }
        } catch { /* ignore */ }
        return [];
      }
      const data = await response.json();
      // Persist to sessionStorage for cross-navigation cache
      try {
        sessionStorage.setItem("products-cache", JSON.stringify({ data, timestamp: Date.now() }));
      } catch { /* quota exceeded — ignore */ }
      return data;
    },
    {
      staleTime: 2 * 60 * 1000, // 2 minutes - products don't change that often
      refetchOnFocus: true, // Refetch when user returns to tab
      initialData: productsInitialData,
    }
  );

  // Fetch aggregated product ratings from the database
  const { data: ratingsMap } = useCachedData<Record<number, { rating: number; reviewCount: number }>>(
    "product-ratings",
    async () => {
      const response = await fetch("/api/products/ratings");
      if (!response.ok) return {};
      return response.json();
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes — matches server-side TTL
    }
  );

  // Compute productList from API data.
  // - Si la API aún no respondió (undefined): usar initialProducts como placeholder de carga.
  // - Si la API ya respondió (array): usar SOLO esos datos, aunque estén vacíos.
  //   Esto evita mostrar productos del tenant "main" a tenants nuevos sin productos.
  // - Las imágenes se toman del mapa estático cuando coinciden por ID (evita 404s).
  const productList = useMemo(() => {
    let list: LiveProduct[];
    if (apiProducts === undefined) {
      list = initialProducts; // Aún cargando — placeholder estático
    } else if (Array.isArray(apiProducts) && apiProducts.length > 0) {
      const staticImageMap = new Map(initialProducts.map(p => [p.id, p.image]));
      list = apiProducts
        .filter((p) => p.active !== false)
        .map(p => ({ ...p, image: staticImageMap.get(p.id) ?? p.image }));
    } else {
      list = []; // API respondió con 0 productos — tenant sin catálogo aún
    }
    // Merge database ratings into products
    if (ratingsMap && Object.keys(ratingsMap).length > 0) {
      list = list.map(p => {
        const r = ratingsMap[p.id];
        return r ? { ...p, rating: r.rating, reviewCount: r.reviewCount } : p;
      });
    }
    return list;
  }, [apiProducts, initialProducts, ratingsMap]);

  // Deriva las categorías reales del tenant a partir de sus productos (NUNCA de data/products)
  const realCategories = useMemo(() => {
    const catIds = [...new Set(productList.map(p => p.category).filter(Boolean))];
    return catIds.map(id => ({
      id,
      label: id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      emoji: "📦",
    }));
  }, [productList]);

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
  }, [search, sort, priceRange, filterOnSale, filterAvailable, filterOutOfStock]);

  // Debounced search term to avoid running fuzzy scoring on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const searchTerm = debouncedSearch;
  // Mejora 13: Products out of stock go to the end
  const filteredProducts = useMemo(() => {
    const sorted = sortProducts(
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
        .filter(p => !filterAvailable || p.stock === undefined || p.stock > 0)
        .filter(p => !filterOutOfStock || (p.stock != null && p.stock <= 0)),
      sort
    );
    // Push out-of-stock products to the end
    sorted.sort((a, b) => {
      const aStock = a.stock ?? 1;
      const bStock = b.stock ?? 1;
      if (aStock === 0 && bStock > 0) return 1;
      if (bStock === 0 && aStock > 0) return -1;
      return 0;
    });
    return sorted;
  }, [searchTerm, productList, priceRange, filterOnSale, filterAvailable, filterOutOfStock, sort]);

  const handleQuickView = useCallback((p: LiveProduct) => setQuickViewProduct(p), []);

  const ITEMS_PER_PAGE = 24;
  const totalSearchPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const paginatedSearchProducts = filteredProducts.slice(
    (searchPage - 1) * ITEMS_PER_PAGE,
    searchPage * ITEMS_PER_PAGE
  );

  return (
    <section id="productos" className="py-10 sm:py-16 bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            Catálogo de <span className="text-primary">{storeName}</span>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            {storeSlogan}
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
              onFocus={() => { if (!search) setShowHistory(true); }}
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
              className="w-full pl-10 pr-9 py-3 min-h-[48px] rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-sm"
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
            {/* MK-9: Recientes + Trending Dropdown */}
            {showHistory && !search && (() => {
              const dropdown = buildSearchDropdown(searchHistory);
              if (!dropdown) return null;
              const { recientes, trending } = dropdown;
              return (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-lg z-20 overflow-hidden">
                  {recientes.length > 0 && (
                    <>
                      <p className="px-3 pt-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-muted">Recientes</p>
                      {recientes.map((term) => (
                        <button key={term} onMouseDown={() => { setSearch(term); setShowHistory(false); saveSearchTerm(term); }} className="flex items-center gap-2 w-full px-3 py-2.5 min-h-[44px] text-sm text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors text-left">
                          <Clock className="h-3.5 w-3.5 text-muted shrink-0" />
                          {term}
                        </button>
                      ))}
                    </>
                  )}
                  <p className="px-3 pt-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-muted border-t border-gray-100 dark:border-card-border mt-1">Tendencias</p>
                  {trending.map((term) => (
                    <button key={term} onMouseDown={() => { setSearch(term); setShowHistory(false); saveSearchTerm(term); }} className="flex items-center gap-2 w-full px-3 py-2.5 min-h-[44px] text-sm text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors text-left">
                      <svg className="h-3.5 w-3.5 text-muted shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><path d="M2 12L6 6l3 4 2-3 3 3"/></svg>
                      {term}
                    </button>
                  ))}
                </div>
              );
            })()}
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
              {/* Filtros de catálogo: solo texto, sin emojis. */}
              <span>Oferta</span>
            </button>
            <button
              onClick={() => { setFilterAvailable(v => !v); if (!filterAvailable) setFilterOutOfStock(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-semibold transition-all shadow-sm whitespace-nowrap",
                filterAvailable
                  ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                  : "border-gray-200 dark:border-card-border bg-white dark:bg-card text-foreground hover:border-emerald-400"
              )}
            >
              <span>Disponible</span>
            </button>
            <button
              onClick={() => { setFilterOutOfStock(v => !v); if (!filterOutOfStock) setFilterAvailable(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-semibold transition-all shadow-sm whitespace-nowrap",
                filterOutOfStock
                  ? "border-gray-400 bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300"
                  : "border-gray-200 dark:border-card-border bg-white dark:bg-card text-foreground hover:border-gray-400"
              )}
            >
              <span>Agotado</span>
            </button>
            {/* U1: Grid/List toggle — enhanced with active indicator */}
            <div className="flex items-center bg-gray-100 dark:bg-accent rounded-xl p-0.5 shadow-sm relative">
              <button
                onClick={() => { setViewMode("grid"); localStorage.setItem("buleje-view-mode", "grid"); }}
                className={cn(
                  "p-2.5 rounded-lg transition-all relative z-10",
                  viewMode === "grid"
                    ? "bg-white dark:bg-card text-primary shadow-sm font-bold"
                    : "text-gray-400 hover:text-gray-600"
                )}
                aria-label="Vista cuadrícula"
                title="Vista cuadrícula"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setViewMode("list"); localStorage.setItem("buleje-view-mode", "list"); }}
                className={cn(
                  "p-2.5 rounded-lg transition-all relative z-10",
                  viewMode === "list"
                    ? "bg-white dark:bg-card text-primary shadow-sm font-bold"
                    : "text-gray-400 hover:text-gray-600"
                )}
                aria-label="Vista lista"
                title="Vista lista"
              >
                <List className="h-4 w-4" />
              </button>
              {/* Active count indicator */}
              <span className="ml-1 pr-2 text-[length:var(--ts-2xs)] font-bold text-muted hidden sm:inline">
                {viewMode === "grid" ? "Grid" : "Lista"}
              </span>
            </div>
          </div>
        </div>

        {/* Price Range Filter — Dual range slider */}
        {showPriceFilter && (
          <div className="max-w-3xl mx-auto mb-6 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 shadow-sm animate-[fadeUp_0.2s_ease-out]">
            <style>{`
              .price-range-slider { position: relative; height: 28px; }
              .price-range-slider input[type="range"] {
                position: absolute; width: 100%; top: 50%; transform: translateY(-50%);
                pointer-events: none; -webkit-appearance: none; appearance: none;
                background: transparent; height: 6px; margin: 0;
              }
              .price-range-slider input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none; appearance: none;
                width: 18px; height: 18px; border-radius: 50%;
                background: #2563EB; border: 3px solid #fff;
                box-shadow: 0 1px 6px rgba(0,0,0,0.2);
                cursor: grab; pointer-events: all;
                transition: transform 0.15s, box-shadow 0.15s;
              }
              .price-range-slider input[type="range"]::-webkit-slider-thumb:hover {
                transform: scale(1.2); box-shadow: 0 2px 10px rgba(45,106,79,0.4);
              }
              .price-range-slider input[type="range"]::-webkit-slider-thumb:active { cursor: grabbing; }
              .price-range-slider input[type="range"]::-moz-range-thumb {
                width: 18px; height: 18px; border-radius: 50%;
                background: #2563EB; border: 3px solid #fff;
                box-shadow: 0 1px 6px rgba(0,0,0,0.2);
                cursor: grab; pointer-events: all;
              }
              .price-range-track {
                position: absolute; top: 50%; transform: translateY(-50%);
                height: 6px; border-radius: 3px;
              }
            `}</style>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">Filtrar por precio</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary bg-primary/8 px-2.5 py-0.5 rounded-lg">S/{priceRange[0].toFixed(0)}</span>
                <span className="text-xs text-muted">—</span>
                <span className="text-sm font-bold text-primary bg-primary/8 px-2.5 py-0.5 rounded-lg">S/{priceRange[1].toFixed(0)}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted font-semibold w-10">S/0</span>
              <div className="flex-1 price-range-slider">
                {/* Background track */}
                <div className="price-range-track bg-gray-200 dark:bg-surface" style={{ left: 0, right: 0 }} />
                {/* Active range track */}
                <div
                  className="price-range-track"
                  style={{
                    left: `${(priceRange[0] / maxPrice) * 100}%`,
                    right: `${100 - (priceRange[1] / maxPrice) * 100}%`,
                    background: "linear-gradient(90deg, #f97316, #2563EB)",
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={maxPrice}
                  step={1}
                  value={priceRange[0]}
                  onChange={(e) => setPriceRange([Math.min(+e.target.value, priceRange[1] - 1), priceRange[1]])}
                />
                <input
                  type="range"
                  min={0}
                  max={maxPrice}
                  step={1}
                  value={priceRange[1]}
                  onChange={(e) => setPriceRange([priceRange[0], Math.max(+e.target.value, priceRange[0] + 1)])}
                />
              </div>
              <span className="text-xs text-muted font-semibold w-14 text-right">S/{maxPrice}</span>
            </div>
          </div>
        )}

        {/* Active filters bar */}
        {(search || filterOnSale || filterAvailable || filterOutOfStock || (priceRange[0] > 0 || priceRange[1] < maxPrice)) && (
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
                Oferta
                <button onClick={() => setFilterOnSale(false)} className="ml-0.5"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterAvailable && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full">
                Disponible
                <button onClick={() => setFilterAvailable(false)} className="ml-0.5"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterOutOfStock && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-full">
                Agotado
                <button onClick={() => setFilterOutOfStock(false)} className="ml-0.5"><X className="h-3 w-3" /></button>
              </span>
            )}
            {(priceRange[0] > 0 || priceRange[1] < maxPrice) && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full">
                S/{priceRange[0]}–S/{priceRange[1]}
                <button onClick={() => setPriceRange([0, maxPrice])} className="ml-0.5"><X className="h-3 w-3" /></button>
              </span>
            )}
            <button
              onClick={() => { setSearch(""); setFilterOnSale(false); setFilterAvailable(false); setFilterOutOfStock(false); setPriceRange([0, maxPrice]); }}
              className="text-xs font-bold text-muted hover:text-foreground ml-auto underline underline-offset-2"
            >
              Limpiar todo
            </button>
          </div>
        )}
        {/* Product count bar — visible when filters are active (not in search mode) */}
        {!searchTerm && (filterOnSale || filterAvailable || filterOutOfStock || priceRange[0] > 0 || priceRange[1] < maxPrice) && (
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
                  <div className="text-center py-16">
                    <div
                      className="flex justify-center text-[var(--text-secondary)] mb-4"
                      aria-hidden="true"
                    >
                      <CanastaVacia size={160} />
                    </div>
                    <p className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
                      No se encontraron productos
                    </p>
                    {suggestion ? (
                      <p className="text-sm text-[var(--text-tertiary)] mt-2">
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
                      <p className="text-sm text-[var(--text-tertiary)] mt-2 max-w-sm mx-auto leading-relaxed">
                        Intentá con otro término de búsqueda o explorá las categorías.
                      </p>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="bg-white dark:bg-card rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-500">
                    {filteredProducts.length} resultado{filteredProducts.length !== 1 ? "s" : ""} para &ldquo;{search.trim()}&rdquo;
                    {filteredProducts.length <= 50 && totalSearchPages > 1 && (
                      <span className="ml-2 text-gray-400">· página {searchPage} de {totalSearchPages}</span>
                    )}
                    {filteredProducts.length > 50 && viewMode === "list" && (
                      <span className="ml-2 text-gray-400">· scroll virtualizado</span>
                    )}
                  </p>
                </div>

                {/* Virtualización con react-window cuando hay más de 50 resultados en vista lista */}
                {filteredProducts.length > 50 && viewMode === "list" ? (
                  (() => {
                    const ROW_HEIGHT = 80; // altura fija por fila ListProductRow (px)
                    const VirtualRow = ({ index, style }: ListChildComponentProps) => (
                      <div style={style} className="px-0 py-1">
                        <ListProductRow
                          product={filteredProducts[index]}
                          onQuickView={handleQuickView}
                        />
                      </div>
                    );
                    return (
                      <FixedSizeList
                        height={typeof window !== "undefined" ? Math.min(filteredProducts.length * ROW_HEIGHT, window.innerHeight - 200) : 600}
                        itemCount={filteredProducts.length}
                        itemSize={ROW_HEIGHT}
                        width="100%"
                        overscanCount={5}
                        className="scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent"
                      >
                        {VirtualRow}
                      </FixedSizeList>
                    );
                  })()
                ) : filteredProducts.length > 50 && viewMode === "grid" ? (
                  /* Grid con más de 50 resultados: mantener paginación normal */
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3">
                      {paginatedSearchProducts.map((product) => (
                        <ProductCard key={product.id} product={product} onQuickView={handleQuickView} />
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
                  </>
                ) : (
                  /* Render normal para <=50 resultados (grid o lista) */
                  <>
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
                  </>
                )}
              </div>
            )
          ) : productList.length === 0 ? (
            // Tenant sin productos aún — empty state informativo
            <div className="text-center py-20 px-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                <span className="text-3xl" aria-hidden="true">🏪</span>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Catálogo en preparación</h3>
              <p className="text-sm text-muted max-w-xs mx-auto">
                Esta tienda todavía no tiene productos publicados. Vuelve pronto o contacta al administrador.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {realCategories.map((cat, catIdx) => {
                const catProducts = filteredProducts.filter((p) => p.category === cat.id);
                if (catProducts.length === 0) return null;
                const theme = getCatTheme(cat.id);
                /* #49: First 2 categories render eagerly; rest lazy-loaded */
                const isEager = catIdx < 2;
                return (
                  <div
                    key={cat.id}
                    id={`cat-${cat.id}`}
                    className={highlighted === cat.id ? "ring-2 ring-primary ring-offset-4 rounded-xl p-3 scroll-mt-4" : "scroll-mt-4"}
                  >
                    <div className={cn("flex items-center gap-3 mb-4 pl-3", theme.sectionBorder)}>
                      <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", theme.dot)} aria-hidden="true" />
                      <div>
                        <h3 className="text-base font-extrabold text-foreground leading-tight">{cat.label}</h3>
                        <p className="text-xs text-muted">{catProducts.length} producto{catProducts.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <LazyCategorySection eager={isEager} productCount={catProducts.length}>
                      <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3" : "space-y-2"}>
                        {catProducts.map((product) =>
                          viewMode === "list" ? (
                            <ListProductRow key={product.id} product={product} onQuickView={handleQuickView} />
                          ) : (
                            <ProductCard key={product.id} product={product} onQuickView={handleQuickView} />
                          )
                        )}
                      </div>
                    </LazyCategorySection>
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

