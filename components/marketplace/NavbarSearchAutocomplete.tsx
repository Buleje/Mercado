"use client";

/**
 * NavbarSearchAutocomplete — search bar del navbar con dropdown de
 * sugerencias inline. Muestra:
 *   - Focus vacío: categorías populares + tiendas top (precargadas)
 *   - Typing: dropdown agrupado (productos · tiendas · categorías) con
 *     debounce 180ms contra `/api/marketplace/search/suggestions`.
 *
 * Routing por tipo:
 *   - product → su categoría con `?q=label` (filtra similares)
 *   - store   → `/marketplace/{storeSlug}`
 *   - category → `/marketplace/categoria/{slug}`
 *   - submit (Enter) → `/marketplace/buscar?q={query}`
 *
 * Reusa la API de `MarketplaceAutocompleteItem` que ya el endpoint devuelve
 * con el href correcto por tipo (configurado en search-suggestions.db.ts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Store,
  Package,
  Tag,
  Loader,
  ShoppingBasket,
  Leaf,
  ChefHat,
  Droplets,
  Gift,
  Sparkles,
  HeartPulse,
  Clock,
  Star,
  X,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import SearchSuggestionThumb, { type ThumbVariant } from "@/components/marketplace/SearchSuggestionThumb";
import { useMarketplaceStores } from "@/hooks/useMarketplaceStores";
import {
  CATEGORIAS,
  type CategoriaDef,
} from "@/lib/constants/marketplace-categories";
import {
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
} from "@/lib/marketplace/recent-searches";

// ── Tipos ──────────────────────────────────────────────────────────────────
type SuggestionType = "query" | "store" | "product" | "category";

type Suggestion = {
  id: string;
  type: SuggestionType;
  label: string;
  subtitle?: string;
  href: string;
  image?: string | null;
  searchCount?: number;
  categorySlug?: string;
  storeSlug?: string;
  price?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
};

type StoreLite = { id: string; slug: string; name: string };

// ── Categorías populares precargadas (estado vacío) ────────────────────────
const POPULAR_CATEGORY_ICONS: Record<string, LucideIcon> = {
  abarrotes: ShoppingBasket,
  "frutas-verduras": Leaf,
  carnes: ChefHat,
  lacteos: Droplets,
  bebidas: Gift,
  panaderia: Package,
  "limpieza-hogar": Sparkles,
  farmacia: HeartPulse,
};

function popularCategoriesAsSuggestions(): Suggestion[] {
  return Object.values(CATEGORIAS).map((c: CategoriaDef) => ({
    id: `pc:${c.slug}`,
    type: "category",
    label: c.label,
    href: `/marketplace/categoria/${c.slug}`,
  }));
}

// ── Hook · top stores precargadas ──────────────────────────────────────────
// Brandon 2026-05-20 v12 audit F3: migrado a useMarketplaceStores con
// singleton dedupe. Antes este fetch corría en CADA mount del navbar
// (todas las páginas públicas) sin coordinación con otros consumers de
// stores. Ahora si TopStoresSection ya pidió limit=10 o initial-stores
// trajo limit=30, este hook hace slice client-side sin fetch nuevo
// (subset hint del hook). En el peor caso (sin cache previo), 1 fetch.
function useTopStores(enabled: boolean): Suggestion[] {
  const { stores } = useMarketplaceStores({ limit: 5, enabled });
  return stores.slice(0, 5).map((s) => ({
    id: `ts:${s.id}`,
    type: "store",
    label: s.name,
    subtitle: s.zone ?? s.category ?? undefined,
    href: `/marketplace/${s.slug}`,
    storeSlug: s.slug,
    image: s.logo ?? null,
    rating: typeof s.rating === "number" ? s.rating : null,
    reviewCount: typeof s.reviewCount === "number" ? s.reviewCount : null,
  }));
}

// ── Placeholder animado — rota cada 3.5s ───────────────────────────────────
const ROTATING_PLACEHOLDERS = [
  "Busca arroz, aceite, lácteos…",
  "Prueba 'detergente'",
  "Pollo entero, fresco hoy",
  "Yape · efectivo · Plin",
  "Busca una bodega cerca",
  "Ofertas de la semana",
];

function useRotatingPlaceholder(active: boolean): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % ROTATING_PLACEHOLDERS.length);
    }, 3500);
    return () => clearInterval(id);
  }, [active]);
  return ROTATING_PLACEHOLDERS[idx];
}

// ── Componente principal ───────────────────────────────────────────────────
interface Props {
  className?: string;
  placeholder?: string;
  /**
   * En modo "tiendas-only" (superadmin nav config), submit y selecciones
   * de productos/categorias/queries redirigen a /tiendas?q= para FILTRAR
   * tiendas en vez de abrir paginas cross-product. Solo selecciones de
   * tipo store siguen al storefront del vendor.
   */
  storesOnly?: boolean;
  /**
   * "Embebido": el input pierde su propio borde/fondo/redondeo para vivir
   * DENTRO de una pastilla contenedora (rediseño nav B — location + search
   * unidos). El ícono de lupa, clear y submit se mantienen.
   */
  embedded?: boolean;
}

export default function NavbarSearchAutocomplete({
  className,
  placeholder,
  storesOnly = false,
  embedded = false,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Perf 2026-06-01: latch para diferir el fetch de top-stores del dropdown
  // hasta la PRIMERA apertura del buscador. El navbar vive en TODA página
  // pública; traer las top-stores en cada first-paint era 1 request de más
  // que el usuario casi nunca ve. Una vez abierto, queda cacheado (120s).
  const [searchEverOpened, setSearchEverOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Placeholder rota solo cuando input está vacío y sin focus
  const isPlaceholderRotating = !open && query.length === 0;
  const rotatedPlaceholder = useRotatingPlaceholder(isPlaceholderRotating);
  const effectivePlaceholder = placeholder ?? rotatedPlaceholder;

  const popularCategories = useMemo(popularCategoriesAsSuggestions, []);
  const topStores = useTopStores(searchEverOpened);

  // Enciende el latch la primera vez que el buscador se abre (focus/click).
  useEffect(() => {
    if (open && !searchEverOpened) setSearchEverOpened(true);
  }, [open, searchEverOpened]);

  // ── Búsquedas recientes (localStorage real) ──
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (open) setRecent(getRecentSearches());
  }, [open]);
  const recentSuggestions = useMemo<Suggestion[]>(
    () =>
      recent.map((term) => ({
        id: `recent:${term}`,
        type: "query",
        label: term,
        href: storesOnly
          ? `/tiendas?q=${encodeURIComponent(term)}`
          : `/marketplace/buscar?q=${encodeURIComponent(term)}`,
      })),
    [recent, storesOnly],
  );

  // ── Fetch sugerencias con debounce ──
  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/marketplace/search/suggestions?q=${encodeURIComponent(q)}&limit=12`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        setSuggestions((json.suggestions ?? []) as Suggestion[]);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  // ── Click outside cierra ──
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // ── Lista de sugerencias renderizadas (con grupos) ──
  const groups = useMemo(() => {
    const isEmpty = query.trim().length === 0;
    if (isEmpty) {
      return [
        { kind: "recent", title: "Búsquedas recientes", items: recentSuggestions },
        { kind: "category", title: "Categorías populares", items: popularCategories },
        { kind: "store", title: "Tiendas destacadas", items: topStores },
      ].filter((g) => g.items.length > 0);
    }
    const products = suggestions.filter((s) => s.type === "product");
    const stores = suggestions.filter((s) => s.type === "store");
    const cats = suggestions.filter((s) => s.type === "category");
    const queries = suggestions.filter((s) => s.type === "query");
    return [
      { kind: "query", title: "Búsquedas populares", items: queries },
      { kind: "product", title: "Productos", items: products },
      { kind: "store", title: "Tiendas", items: stores },
      { kind: "category", title: "Categorías", items: cats },
    ].filter((g) => g.items.length > 0);
  }, [query, suggestions, popularCategories, topStores, recentSuggestions]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // ── Keyboard nav ──
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        setActiveIdx((i) => (i + 1) % Math.max(1, flatItems.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx(
          (i) => (i - 1 + Math.max(1, flatItems.length)) % Math.max(1, flatItems.length),
        );
      } else if (e.key === "Enter") {
        if (open && activeIdx >= 0 && flatItems[activeIdx]) {
          e.preventDefault();
          const it = flatItems[activeIdx];
          setOpen(false);
          if (it.type !== "store") addRecentSearch(it.label);
          // En storesOnly: solo type=store mantiene su href (storefront).
          // Productos/categorias/queries redirigen a /tiendas?q=label para
          // filtrar el listado de tiendas con ese termino.
          if (storesOnly && it.type !== "store") {
            router.push(`/tiendas?q=${encodeURIComponent(it.label)}`);
          } else {
            router.push(it.href);
          }
        }
      }
    },
    [activeIdx, flatItems, open, router, storesOnly],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      setOpen(false);
      addRecentSearch(q);
      // En storesOnly el submit filtra tiendas en /tiendas, no abre la
      // pagina cross-product de busqueda.
      const target = storesOnly
        ? `/tiendas?q=${encodeURIComponent(q)}`
        : `/marketplace/buscar?q=${encodeURIComponent(q)}`;
      router.push(target);
    },
    [query, router, storesOnly],
  );

  return (
    <form
      ref={containerRef}
      role="search"
      aria-label="Buscar en el marketplace"
      onSubmit={onSubmit}
      className={cn("relative", className)}
    >
      <div className="group relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors pointer-events-none"
          aria-hidden
          strokeWidth={2}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="navbar-search-listbox"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={effectivePlaceholder}
          className={cn(
            embedded
              ? // Embebido en una pastilla padre: transparente, sin borde propio.
                "w-full h-11 bg-transparent border-0 rounded-none pl-11 pr-14 text-base font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-0 focus:shadow-none"
              : cn(
                  "w-full h-12 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--rule-base)]",
                  "pl-11 pr-14 text-[length:var(--ts-sm)] font-medium text-[var(--text-primary)]",
                  "placeholder:text-[var(--text-tertiary)] outline-none transition-all",
                  "hover:border-[var(--accent)]/40 hover:shadow-sm",
                  "focus:border-[var(--accent)] focus:bg-[var(--surface-canvas)] focus:shadow-md focus:shadow-[var(--accent)]/15 focus:ring-4 focus:ring-[var(--accent)]/10",
                ),
            "buleje-search-input",
          )}
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveIdx(-1);
              inputRef.current?.focus();
            }}
            aria-label="Limpiar búsqueda"
            className="absolute right-12 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        )}
        <button
          type="submit"
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full",
            "text-white shadow-sm transition-all",
            "hover:scale-105 hover:shadow-md hover:shadow-[var(--accent)]/30",
            "active:scale-[0.97]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          )}
          style={{ backgroundColor: "var(--accent-600, var(--accent))" }}
          aria-label="Buscar"
        >
          <Search className="h-4 w-4" strokeWidth={2.75} aria-hidden />
        </button>
      </div>
      {/* Animación del placeholder — slide-in suave cada vez que rota */}
      <style jsx>{`
        :global(.buleje-search-input::placeholder) {
          animation: buleje-placeholder-slide 0.45s ease-out;
          color: var(--text-tertiary);
        }
        @keyframes buleje-placeholder-slide {
          0% {
            opacity: 0;
            transform: translateX(8px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.buleje-search-input::placeholder) {
            animation: none;
          }
        }
      `}</style>

      {/* Dropdown */}
      {open && (
        <div
          id="navbar-search-listbox"
          role="listbox"
          aria-label="Sugerencias"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] shadow-black/10"
        >
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-[var(--text-tertiary)]">
              <Loader className="h-4 w-4 animate-spin" aria-hidden />
              Buscando…
            </div>
          )}

          {!loading && groups.length === 0 && query.trim().length > 0 && (
            <div className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
              Sin resultados para <strong className="text-[var(--text-primary)]">&quot;{query}&quot;</strong>.
              Prueba con otra palabra.
            </div>
          )}

          {!loading &&
            groups.map((g, gi) => {
              let runningIdx = 0;
              for (let k = 0; k < gi; k++) runningIdx += groups[k].items.length;
              return (
                <div key={g.kind} className="border-b border-[var(--rule-soft)] last:border-b-0">
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      {g.title}
                    </p>
                    {g.kind === "recent" && (
                      <button
                        type="button"
                        onClick={() => {
                          clearRecentSearches();
                          setRecent([]);
                        }}
                        className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)] hover:underline"
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                  <ul>
                    {g.items.map((s, i) => {
                      const idx = runningIdx + i;
                      const active = idx === activeIdx;
                      const isRecent = s.id.startsWith("recent:");
                      const variant: ThumbVariant = isRecent
                        ? "recent"
                        : s.type === "store"
                          ? "store"
                          : s.type === "category"
                            ? "category"
                            : s.type === "product"
                              ? "product"
                              : "query";
                      const Icon = isRecent
                        ? Clock
                        : s.type === "store"
                          ? Store
                          : s.type === "category"
                            ? POPULAR_CATEGORY_ICONS[s.id.replace(/^c:|^pc:/, "")] ?? Tag
                            : s.type === "product"
                              ? Package
                              : Search;
                      const targetHref = storesOnly && s.type !== "store"
                        ? `/tiendas?q=${encodeURIComponent(s.label)}`
                        : s.href;
                      const hasRating = s.type === "store" && typeof s.rating === "number" && s.rating > 0;
                      const hasPrice = s.type === "product" && typeof s.price === "number" && s.price > 0;
                      return (
                        <li key={s.id}>
                          <Link
                            href={targetHref}
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              if (s.type !== "store") addRecentSearch(s.label);
                              setOpen(false);
                            }}
                            onMouseEnter={() => setActiveIdx(idx)}
                            className={cn(
                              "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                              active
                                ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                                : "hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                            )}
                          >
                            <SearchSuggestionThumb variant={variant} image={s.image} Icon={Icon} size={40} />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-[var(--text-primary)] truncate">
                                {s.label}
                              </p>
                              {(s.subtitle || hasRating) && (
                                <p className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] truncate">
                                  {hasRating && (
                                    <span className="inline-flex items-center gap-0.5 font-bold text-[var(--text-secondary)]">
                                      <Star className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" strokeWidth={0} aria-hidden />
                                      {s.rating!.toFixed(1)}
                                    </span>
                                  )}
                                  {hasRating && s.subtitle && <span aria-hidden>·</span>}
                                  {s.subtitle && <span className="truncate capitalize">{s.subtitle}</span>}
                                </p>
                              )}
                            </div>
                            {hasPrice && (
                              <span className="shrink-0 text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
                                S/ {s.price!.toFixed(2)}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
        </div>
      )}
    </form>
  );
}
