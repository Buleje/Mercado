"use client";

/**
 * StoreLinkerModal — Modal split-view para vincular tiendas a categorías/subcategorías.
 *
 * Izquierda: lista de tiendas con checkbox + zona + buscador.
 * Derecha: preview de productos de la tienda seleccionada (fetch /api/marketplace/catalog).
 *
 * Ayuda al superadmin a decidir qué tienda vincular viendo qué vende cada una.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Search,
  Store as StoreIcon,
  MapPin,
  CheckCircle2,
  Circle,
  Package,
  ArrowRight,
  ShoppingBag,
} from "@buleje/design-system/icons";

export interface StoreLinkerOption {
  slug: string;
  name: string;
  ownZone?: string;
}

interface CatalogProduct {
  storeProductId: number;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit?: string | null;
  category?: string | null;
  stock?: number;
  avgRating?: number;
}

interface StoreLinkerModalProps {
  open: boolean;
  /** Título del modal — "Vincular tiendas a Restaurantes" */
  title: string;
  subtitle?: string;
  stores: StoreLinkerOption[];
  linkedSlugs: string[];
  storeZones: Record<string, string>;
  zoneDrafts: Record<string, string>;
  onChange: (next: string[]) => void;
  onZoneDraftChange: (slug: string, value: string) => void;
  onClose: () => void;
}

export default function StoreLinkerModal({
  open,
  title,
  subtitle,
  stores,
  linkedSlugs,
  storeZones,
  zoneDrafts,
  onChange,
  onZoneDraftChange,
  onClose,
}: StoreLinkerModalProps) {
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});

  const linkedSet = useMemo(() => new Set(linkedSlugs), [linkedSlugs]);
  const filteredStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
    );
  }, [stores, search]);

  // Auto-select primera tienda al abrir
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      if (filteredStores.length > 0 && !selectedSlug) {
        setSelectedSlug(filteredStores[0].slug);
      }
    }
    if (!open) {
      wasOpen.current = false;
      setSelectedSlug(null);
      setProducts(null);
      setSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc cierra
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Fetch productos cuando cambia selectedSlug
  useEffect(() => {
    if (!selectedSlug) {
      setProducts(null);
      return;
    }
    let cancelled = false;
    setLoadingProducts(true);
    setProductsError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/marketplace/catalog?storeSlug=${encodeURIComponent(selectedSlug)}&limit=24`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: CatalogProduct[]; total: number };
        if (cancelled) return;
        setProducts(json.data ?? []);
        setProductCounts((prev) => ({ ...prev, [selectedSlug]: json.total ?? json.data?.length ?? 0 }));
      } catch (e) {
        if (cancelled) return;
        setProductsError((e as Error).message || "Error cargando productos");
        setProducts([]);
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  const toggle = useCallback(
    (slug: string) => {
      const next = new Set(linkedSet);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      onChange(Array.from(next));
    },
    [linkedSet, onChange],
  );

  const selectAll = useCallback(() => {
    onChange(filteredStores.map((s) => s.slug));
  }, [filteredStores, onChange]);

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  if (!open) return null;

  const selectedStore = stores.find((s) => s.slug === selectedSlug);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="relative flex w-full max-w-6xl flex-col rounded-3xl bg-[var(--surface-raised)] shadow-2xl overflow-hidden border-2 border-[var(--rule-soft)]">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
              Marketplace · Vincular tiendas
            </p>
            <h2 className="font-display text-base sm:text-lg font-extrabold tracking-tight text-[var(--text-primary)] truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-[var(--text-tertiary)] truncate">{subtitle}</p>
            )}
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] h-11 px-3">
            <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
            <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
              {linkedSet.size}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">/ {stores.length}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[var(--rule-soft)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </header>

        {/* Body split */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,360px)_1fr] flex-1 min-h-0">
          {/* Left: stores list */}
          <aside className="flex flex-col border-b-2 md:border-b-0 md:border-r-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] min-h-0">
            <div className="border-b border-[var(--rule-soft)] p-3 space-y-2">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
                  aria-hidden
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tienda…"
                  className="w-full rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] h-12 pl-10 pr-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={filteredStores.length === 0}
                  className="flex-1 inline-flex h-9 items-center justify-center gap-1 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 disabled:opacity-50"
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={linkedSet.size === 0}
                  className="flex-1 inline-flex h-9 items-center justify-center gap-1 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[280px]">
              {filteredStores.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]">
                  Sin resultados.
                </div>
              ) : (
                filteredStores.map((s) => {
                  const checked = linkedSet.has(s.slug);
                  const isSelected = selectedSlug === s.slug;
                  const persisted = (storeZones[s.slug] ?? "").trim();
                  const draftZone =
                    zoneDrafts[s.slug] !== undefined ? zoneDrafts[s.slug] : persisted;
                  const ownZone = (s.ownZone ?? "").trim();
                  const count = productCounts[s.slug];
                  return (
                    <div
                      key={s.slug}
                      role="button"
                      tabIndex={0}
                      aria-label={`Ver artículos de ${s.name}`}
                      className={`group rounded-xl border-2 transition cursor-pointer outline-none focus:ring-2 focus:ring-[var(--accent)]/30 ${
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm"
                          : checked
                            ? "border-[var(--accent)]/30 bg-[var(--accent)]/5 hover:border-[var(--accent)]/60"
                            : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40"
                      }`}
                      onClick={() => setSelectedSlug(s.slug)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedSlug(s.slug);
                        }
                      }}
                    >
                      <div className="flex items-start gap-2.5 p-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(s.slug);
                          }}
                          aria-label={
                            checked ? `Desvincular ${s.name}` : `Vincular ${s.name}`
                          }
                          className="mt-0.5 shrink-0"
                        >
                          {checked ? (
                            <CheckCircle2
                              className="h-5 w-5 text-[var(--accent)]"
                              strokeWidth={2.25}
                            />
                          ) : (
                            <Circle
                              className="h-5 w-5 text-[var(--text-tertiary)] group-hover:text-[var(--accent)]/60"
                              strokeWidth={2}
                            />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm leading-tight truncate font-extrabold ${
                              checked
                                ? "text-[var(--accent)]"
                                : "text-[var(--text-primary)]"
                            }`}
                          >
                            {s.name}
                          </p>
                          <p className="text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)] truncate leading-tight">
                            /{s.slug}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                            {ownZone ? (
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-[var(--data-success-500)]/10 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]">
                                <MapPin className="h-2.5 w-2.5" />
                                {ownZone}
                              </span>
                            ) : checked ? (
                              <input
                                type="text"
                                value={draftZone}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  onZoneDraftChange(s.slug, e.target.value)
                                }
                                placeholder="Zona…"
                                aria-label={`Zona para ${s.name}`}
                                className="rounded-md border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-semibold outline-none focus:border-[var(--accent)] w-[80px]"
                              />
                            ) : null}
                            {typeof count === "number" && (
                              <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                                <Package className="h-2.5 w-2.5" />
                                {count}
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight
                          className={`h-3.5 w-3.5 shrink-0 mt-1 text-[var(--text-tertiary)] transition ${
                            isSelected ? "text-[var(--accent)] translate-x-0.5" : ""
                          }`}
                          strokeWidth={2.25}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right: products preview */}
          <section className="flex flex-col bg-[var(--surface-raised)] min-h-0">
            {selectedStore ? (
              <>
                <div className="border-b-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Vista previa
                  </p>
                  <div className="flex items-center justify-between gap-3 mt-0.5">
                    <h3 className="font-display text-lg font-extrabold tracking-tight text-[var(--text-primary)] truncate">
                      {selectedStore.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => toggle(selectedStore.slug)}
                      className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold uppercase tracking-wider transition ${
                        linkedSet.has(selectedStore.slug)
                          ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)] border-2 border-[var(--data-success-500)]/40"
                          : "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25 hover:brightness-110"
                      }`}
                    >
                      {linkedSet.has(selectedStore.slug) ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                          Vinculada
                        </>
                      ) : (
                        <>
                          <ShoppingBag className="h-3.5 w-3.5" strokeWidth={2.5} />
                          Vincular tienda
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs font-mono text-[var(--text-tertiary)] mt-1">
                    /{selectedStore.slug}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {loadingProducts && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] animate-pulse aspect-square"
                        />
                      ))}
                    </div>
                  )}
                  {!loadingProducts && productsError && (
                    <div className="rounded-xl border-2 border-rose-300/60 bg-rose-50/50 p-4 text-sm font-bold text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
                      {productsError}
                    </div>
                  )}
                  {!loadingProducts && !productsError && products && products.length === 0 && (
                    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 px-6 py-12 text-center">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
                        <Package
                          className="h-6 w-6 text-[var(--text-tertiary)]"
                          strokeWidth={1.75}
                        />
                      </div>
                      <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
                        Sin productos publicados
                      </p>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Esta tienda todavía no tiene catálogo activo en el marketplace.
                      </p>
                    </div>
                  )}
                  {!loadingProducts && products && products.length > 0 && (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Mostrando {products.length} artículo
                          {products.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {products.map((p) => (
                          <ProductCard key={p.storeProductId} p={p} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-sm">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/10 mb-3">
                    <StoreIcon
                      className="h-7 w-7 text-[var(--accent)]"
                      strokeWidth={1.75}
                    />
                  </div>
                  <p className="font-display text-lg font-extrabold text-[var(--text-primary)]">
                    Elegí una tienda
                  </p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Hacé click en cualquier tienda de la izquierda para ver sus artículos
                    y decidir si vincularla.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3">
          <p className="text-xs text-[var(--text-tertiary)]">
            <strong className="text-[var(--text-primary)]">{linkedSet.size}</strong>{" "}
            tienda{linkedSet.size === 1 ? "" : "s"} vinculada
            {linkedSet.size === 1 ? "" : "s"}. Los cambios se guardan al cerrar la
            categoría con &quot;Guardar&quot;.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-extrabold uppercase tracking-wider text-white shadow-md shadow-[var(--accent)]/25 transition hover:brightness-110"
          >
            <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
            Listo
          </button>
        </footer>
      </div>
    </div>
  );
}

function ProductCard({ p }: { p: CatalogProduct }) {
  return (
    <div className="rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] overflow-hidden transition hover:border-[var(--accent)]/40">
      <div className="relative aspect-square bg-[var(--surface-sunken)]">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image}
            alt={p.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package
              className="h-6 w-6 text-[var(--text-tertiary)]"
              strokeWidth={1.5}
            />
          </div>
        )}
        {typeof p.stock === "number" && p.stock <= 0 && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-rose-500/90 backdrop-blur px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white">
            Agotado
          </span>
        )}
      </div>
      <div className="p-2.5 space-y-1">
        <p className="text-xs font-bold text-[var(--text-primary)] leading-tight line-clamp-2 min-h-[28px]">
          {p.name}
        </p>
        <p className="text-sm font-extrabold tabular-nums text-[var(--accent)]">
          S/ {Number(p.price).toFixed(2)}
        </p>
      </div>
    </div>
  );
}
