"use client";

/**
 * MobileSearchOverlay — buscador full-screen para MOBILE (estilo Rappi/MELI).
 *
 * Antes el search mobile del navbar era un <input> plano que solo routeaba al
 * hacer submit: sin sugerencias, sin recientes, sin panel. Al tocar el pill
 * ahora se abre este overlay con:
 *   - Input autofocus + limpiar + cerrar
 *   - Búsquedas recientes (localStorage real) con quitar / borrar todo
 *   - Categorías populares (chips)
 *   - Tiendas destacadas
 *   - Sugerencias EN VIVO al tipear (debounce → /api/marketplace/search/suggestions)
 *
 * Al elegir/submit: guarda reciente, navega y cierra.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowLeft,
  X,
  Store as StoreIcon,
  Package,
  Tag,
  Clock,
  Loader,
  TrendingUp,
  Flame,
  ChefHat,
  Truck,
  ChevronRight,
  Search as SearchIcon,
  Star,
} from "@buleje/design-system/icons";
import { useMarketplaceStores } from "@/hooks/useMarketplaceStores";
import SearchSuggestionThumb, { type ThumbVariant } from "@/components/marketplace/SearchSuggestionThumb";
import { CATEGORIAS, type CategoriaDef } from "@/lib/constants/marketplace-categories";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from "@/lib/marketplace/recent-searches";

type SuggestionType = "query" | "store" | "product" | "category";
type Suggestion = {
  id: string;
  type: SuggestionType;
  label: string;
  subtitle?: string;
  href: string;
  image?: string | null;
  price?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** En tiendas-only redirige selecciones no-store a /tiendas?q= */
  storesOnly?: boolean;
}

export default function MobileSearchOverlay({ open, onClose, storesOnly = false }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  const { stores } = useMarketplaceStores({ limit: 6 });
  const popularCategories = useMemo(
    () => Object.values(CATEGORIAS).slice(0, 8) as CategoriaDef[],
    [],
  );

  // Al abrir: cargar recientes, autofocus, lock scroll del body.
  useEffect(() => {
    if (!open) return;
    setRecent(getRecentSearches());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  // Debounced fetch de sugerencias.
  useEffect(() => {
    if (!open) return;
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
  }, [query, open]);

  const go = useCallback(
    (href: string, term?: string) => {
      if (term) {
        addRecentSearch(term);
      }
      onClose();
      setQuery("");
      router.push(href);
    },
    [router, onClose],
  );

  const submitQuery = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      const href = storesOnly
        ? `/tiendas?q=${encodeURIComponent(q)}`
        : `/marketplace/buscar?q=${encodeURIComponent(q)}`;
      go(href, q);
    },
    [go, storesOnly],
  );

  const selectSuggestion = useCallback(
    (s: Suggestion) => {
      const href =
        storesOnly && s.type !== "store"
          ? `/tiendas?q=${encodeURIComponent(s.label)}`
          : s.href;
      go(href, s.type === "store" ? undefined : s.label);
    },
    [go, storesOnly],
  );

  if (!open) return null;

  const isEmpty = query.trim().length === 0;
  const grouped = {
    queries: suggestions.filter((s) => s.type === "query"),
    products: suggestions.filter((s) => s.type === "product"),
    stores: suggestions.filter((s) => s.type === "store"),
    cats: suggestions.filter((s) => s.type === "category"),
  };

  return (
    <div
      className="md:hidden fixed inset-0 z-[70] flex flex-col bg-[var(--surface-canvas)]"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar en el marketplace"
    >
      {/* ── Barra superior: volver + input + limpiar ── */}
      <div className="flex items-center gap-2 border-b border-[var(--rule-base)] px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar búsqueda"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery(query);
          }}
          className="relative flex-1 min-w-0"
        >
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]"
            strokeWidth={2}
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos, bodegas o categorías"
            aria-label="Buscar"
            enterKeyHint="search"
            className="h-11 w-full rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-10 text-base font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Limpiar"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] active:scale-90 transition"
            >
              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          )}
        </form>
      </div>

      {/* ── Cuerpo scrollable ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[env(safe-area-inset-bottom)]">
        {/* Loading */}
        {!isEmpty && loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-tertiary)]">
            <Loader className="h-4 w-4 animate-spin" aria-hidden /> Buscando…
          </div>
        )}

        {/* ── Estado vacío: accesos + recientes + categorías + tiendas ── */}
        {isEmpty && (
          <div className="space-y-6">
            {/* Accesos rápidos — atajos de navegación frecuentes */}
            <section>
              <h2 className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Accesos rápidos
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { label: "Ofertas del día", href: "/marketplace/ofertas", Icon: Tag },
                    { label: "Más vendidos", href: "/marketplace?sort=bestsellers", Icon: Flame },
                    { label: "Todas las tiendas", href: "/tiendas", Icon: StoreIcon },
                    { label: "Recetas", href: "/recetas", Icon: ChefHat },
                    { label: "Delivery gratis", href: "/marketplace/explorar?delivery=free", Icon: Truck },
                  ] as const
                ).map((q) => (
                  <button
                    key={q.href}
                    type="button"
                    onClick={() => go(q.href)}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3 text-left text-sm font-bold text-[var(--text-primary)] active:border-[var(--accent)] active:bg-[var(--accent-soft)]"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                      <q.Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="truncate">{q.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {recent.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Búsquedas recientes
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      clearRecentSearches();
                      setRecent([]);
                    }}
                    className="text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] active:opacity-70"
                  >
                    Borrar todo
                  </button>
                </div>
                <ul className="space-y-1">
                  {recent.map((term) => (
                    <li key={term} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => submitQuery(term)}
                        className="flex flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left text-base text-[var(--text-primary)] active:bg-[var(--surface-sunken)]"
                      >
                        <Clock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />
                        <span className="truncate font-medium">{term}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecent(removeRecentSearch(term))}
                        aria-label={`Quitar ${term}`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] active:bg-[var(--surface-sunken)]"
                      >
                        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="mb-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Categorías populares
              </h2>
              <div className="flex flex-wrap gap-2">
                {popularCategories.map((c) => {
                  const Icon = getProductCategoryIcon(c.slug);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => go(`/marketplace/categoria/${c.slug}`)}
                      className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm font-bold text-[var(--text-primary)] active:border-[var(--accent)] active:bg-[var(--accent-soft)]"
                    >
                      <Icon className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {stores.length > 0 && (
              <section>
                <h2 className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Tiendas destacadas
                </h2>
                <ul className="space-y-1">
                  {stores.slice(0, 6).map((s) => {
                    const logo = (s.logo as string | null) ?? null;
                    const category = (s.category as string | null) ?? null;
                    const zone = (s.zone as string | null) ?? null;
                    const rating = typeof s.rating === "number" ? s.rating : 0;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => go(`/marketplace/${s.slug}`)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-[var(--surface-sunken)]"
                        >
                          {/* Logo real de la tienda (su imagen característica) */}
                          <SearchSuggestionThumb variant="store" image={logo} Icon={StoreIcon} size={44} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold text-[var(--text-primary)]">{s.name}</span>
                            <span className="flex items-center gap-1 truncate text-xs text-[var(--text-tertiary)]">
                              {rating > 0 && (
                                <span className="inline-flex items-center gap-0.5 font-bold text-[var(--text-secondary)]">
                                  <Star className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" strokeWidth={0} aria-hidden />
                                  {rating.toFixed(1)}
                                </span>
                              )}
                              {rating > 0 && (zone || category) && <span aria-hidden>·</span>}
                              <span className="truncate capitalize">{zone ?? category ?? "Tienda"}</span>
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* ── Sugerencias en vivo ── */}
        {!isEmpty && !loading && suggestions.length === 0 && (
          <div className="py-10 text-center text-sm text-[var(--text-tertiary)]">
            Sin resultados para{" "}
            <strong className="text-[var(--text-primary)]">&quot;{query.trim()}&quot;</strong>.
            <br />
            Probá con otra palabra.
          </div>
        )}

        {!isEmpty && !loading && suggestions.length > 0 && (
          <div className="space-y-5">
            {([
              { title: "Búsquedas", items: grouped.queries, Icon: TrendingUp },
              { title: "Productos", items: grouped.products, Icon: Package },
              { title: "Tiendas", items: grouped.stores, Icon: StoreIcon },
              { title: "Categorías", items: grouped.cats, Icon: Tag },
            ] as const)
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <section key={g.title}>
                  <h2 className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    {g.title}
                  </h2>
                  <ul>
                    {g.items.map((s) => {
                      const variant: ThumbVariant =
                        s.type === "store"
                          ? "store"
                          : s.type === "product"
                            ? "product"
                            : s.type === "category"
                              ? "category"
                              : "query";
                      const ItemIcon =
                        s.type === "store"
                          ? StoreIcon
                          : s.type === "product"
                            ? Package
                            : s.type === "category"
                              ? Tag
                              : SearchIcon;
                      const hasRating = s.type === "store" && typeof s.rating === "number" && s.rating > 0;
                      const hasPrice = s.type === "product" && typeof s.price === "number" && s.price > 0;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => selectSuggestion(s)}
                            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-[var(--surface-sunken)]"
                          >
                            <SearchSuggestionThumb variant={variant} image={s.image} Icon={ItemIcon} size={44} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-bold text-[var(--text-primary)]">{s.label}</span>
                              {(s.subtitle || hasRating) && (
                                <span className="flex items-center gap-1 truncate text-xs text-[var(--text-tertiary)]">
                                  {hasRating && (
                                    <span className="inline-flex items-center gap-0.5 font-bold text-[var(--text-secondary)]">
                                      <Star className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" strokeWidth={0} aria-hidden />
                                      {s.rating!.toFixed(1)}
                                    </span>
                                  )}
                                  {hasRating && s.subtitle && <span aria-hidden>·</span>}
                                  {s.subtitle && <span className="truncate capitalize">{s.subtitle}</span>}
                                </span>
                              )}
                            </span>
                            {hasPrice && (
                              <span className="shrink-0 text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
                                S/ {s.price!.toFixed(2)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
