"use client";

import { useState, useEffect, useCallback, useDeferredValue } from "react";
import Image from "next/image";
import Link from "next/link";
import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import LiveViewers from "@/components/marketplace/LiveViewers";
import { StoreCardCanonical } from "@buleje/design-system";

// ---------- tipos ----------

interface Store {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string;
  rating: number | null;
  reviewCount: number;
  description: string | null;
  isOpen?: boolean;
  productCount?: number;
}

// ---------- helpers ----------

// Zonas del catálogo canónico (lib/marketplace-zones.ts).
import { MARKETPLACE_ZONES } from "@/lib/marketplace-zones";

const ZONES = [
  { value: "", label: "Todas las zonas" },
  ...MARKETPLACE_ZONES.map((z) => ({ value: z.id, label: z.label })),
];

const CATEGORIES = [
  { value: "",              label: "Todas" },
  { value: "bodega",        label: "Bodega" },
  { value: "minimarket",    label: "Minimarket" },
  { value: "distribuidor",  label: "Distribuidor" },
];

function StarRating({ rating, count }: { rating: number | null; count: number }) {
  const r = rating ?? 0;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${s <= Math.round(r) ? "text-yellow-400" : "text-[var(--rule-base)]"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-0.5 text-xs text-[var(--text-tertiary)]">
        {r > 0 ? r.toFixed(1) : "—"} ({count})
      </span>
    </div>
  );
}

// ---------- skeletons ----------

function StoreCardSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="aspect-[4/3] rounded-t-lg bg-[var(--surface-sunken)]" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-[var(--surface-sunken)]" />
        <div className="h-3 w-1/2 rounded bg-[var(--surface-sunken)]" />
        <div className="h-3 w-2/3 rounded bg-[var(--surface-sunken)]" />
        <div className="h-9 w-full rounded-xl bg-[var(--surface-sunken)]" />
      </div>
    </div>
  );
}

// ---------- wrapper de card de tienda ----------
/**
 * StoreCardWrapper — adapta StoreCardCanonical al contexto MarketplaceGrid.
 * Preserva hover-prefetch y slots especificos (StarRating, LiveViewers, isOpen badge,
 * productCount, CTA button). El canonical maneja imagen/placeholder/focus/a11y.
 */
function StoreCardWrapper({ store, priority = false }: { store: Store; priority?: boolean }) {
  const isOpen = store.isOpen ?? true; // fallback optimista
  const href = `/marketplace/${store.slug}`;
  const { onMouseEnter, onMouseLeave } = useHoverPrefetch(href);

  const badges = (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold ${
        isOpen
          ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
          : "bg-red-100 text-[var(--data-error-700)] dark:bg-red-900/50 dark:text-red-400"
      }`}
    >
      {isOpen ? "Abierto" : "Cerrado"}
    </span>
  );

  const footer = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold capitalize text-[var(--accent-dark)] dark:bg-teal-900/30 dark:text-teal-400">
          {store.category}
        </span>
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] capitalize">
          {store.zone?.replace(/-/g, " ")}
        </span>
      </div>
      <StarRating rating={store.rating} count={store.reviewCount} />
      {store.productCount != null && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {store.productCount} productos
        </p>
      )}
      <LiveViewers storeSlug={store.slug} compact className="mt-1" />
      <a
        href={href}
        aria-label={`Ver tienda ${store.name}`}
        className="mt-1 block w-full min-h-[44px] rounded-xl text-center text-sm font-bold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        style={{
          background: "linear-gradient(135deg, var(--accent) 0%, #0d6560 100%)",
          boxShadow: "0 4px 14px -2px rgba(15,118,110,0.35)",
          paddingTop: "0.625rem",
          paddingBottom: "0.625rem",
        }}
      >
        Ver tienda
      </a>
    </div>
  );

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-label={`Tienda ${store.name}`}
    >
      <StoreCardCanonical
        storeId={store.id}
        name={store.name}
        slug={store.slug}
        imageUrl={store.logo}
        badges={badges}
        footer={footer}
        renderImage={({ src, alt, className }) => (
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            className={className}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PGZpbHRlciBpZD0iYiI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMiIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgZmlsdGVyPSJ1cmwoI2IpIiBmaWxsPSIjZWVlIi8+PC9zdmc+"
          />
        )}
        // Brandon 2026-05-21 perf v4: SPA navigation con Next Link.
        renderLink={({ href, className, ariaLabel, children }) => (
          <Link href={href} className={className} aria-label={ariaLabel}>
            {children}
          </Link>
        )}
      />
    </div>
  );
}

// ---------- componente principal ----------

export default function MarketplaceGrid() {
  const [stores, setStores]       = useState<Store[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [zone, setZone]           = useState("");
  const [category, setCategory]   = useState("");

  const deferredSearch = useDeferredValue(search);

  const fetchStores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (deferredSearch) params.set("search", deferredSearch);
      if (zone)           params.set("zone",   zone);
      if (category)       params.set("category", category);
      params.set("limit", "60");

      const res = await fetch(`/api/marketplace/stores?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setStores(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las tiendas");
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, zone, category]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  return (
    <div className="mx-auto max-w-[1760px] px-4 py-8 sm:px-6 lg:px-8">
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black text-[var(--text-primary)] sm:text-4xl">
          Encuentra tu bodega
        </h1>
        <p className="mt-2 text-base text-[var(--text-secondary)]">
          Todas las bodegas, minimarkets y distribuidores en un solo lugar
        </p>
      </div>

      {/* ── BARRA DE BÚSQUEDA ──────────────────────────────────── */}
      <div className="mb-6">
        <div className="relative">
          <svg
            aria-hidden="true"
            className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tienda por nombre…"
            aria-label="Buscar tienda"
            className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] py-3 pl-12 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
      </div>

      {/* ── FILTROS ────────────────────────────────────────────── */}
      <div className="mb-8 space-y-3">
        {/* Zonas */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Zona
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por zona">
            {ZONES.map((z) => (
              <button
                key={z.value}
                onClick={() => setZone(z.value)}
                aria-pressed={zone === z.value}
                className={`min-h-[36px] rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  zone === z.value
                    ? "bg-[var(--accent-dark)] text-white shadow-sm"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] border border-[var(--rule-base)]"
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>

        {/* Categorías */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Categoría
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                aria-pressed={category === c.value}
                className={`min-h-[36px] rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  category === c.value
                    ? "bg-[var(--accent-dark)] text-white shadow-sm"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] border border-[var(--rule-base)]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENIDO ──────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-[var(--data-error-700)] dark:bg-red-900/20 dark:text-red-400">
          {error}{" "}
          <button onClick={fetchStores} aria-label="Reintentar cargar tiendas" className="underline hover:no-underline">
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <div
          aria-busy="true"
          aria-label="Cargando tiendas..."
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {[...Array(6)].map((_, i) => <StoreCardSkeleton key={i} />)}
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--rule-base)] py-20">
          <svg
            aria-hidden="true"
            className="mb-4 h-12 w-12 text-[var(--text-tertiary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg font-semibold text-[var(--text-secondary)]">
            No se encontraron tiendas
          </p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            Prueba con otros filtros o busca por otro nombre
          </p>
          <button
            onClick={() => { setSearch(""); setZone(""); setCategory(""); }}
            aria-label="Limpiar todos los filtros y ver todas las tiendas"
            className="mt-4 min-h-[44px] rounded-xl bg-[var(--accent-dark)] px-6 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <>
          <p
            aria-live="polite"
            aria-atomic="true"
            className="mb-4 text-sm text-[var(--text-secondary)]"
          >
            {stores.length} {stores.length === 1 ? "tienda encontrada" : "tiendas encontradas"}
          </p>
          <div
            role="list"
            aria-label={`${stores.length} ${stores.length === 1 ? "tienda encontrada" : "tiendas encontradas"}`}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {stores.map((s, idx) => (
              <div key={s.id} role="listitem">
                {/* First 6 cards render eagerly with priority for LCP — rest lazy */}
                <StoreCardWrapper store={s} priority={idx < 6} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
