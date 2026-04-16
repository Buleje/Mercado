"use client";

import { useState, useEffect, useCallback, useDeferredValue } from "react";
import Link from "next/link";
import Image from "next/image";

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

const ZONES = [
  { value: "",              label: "Todas las zonas" },
  { value: "pucallpa-centro", label: "Centro" },
  { value: "yarinacocha",   label: "Yarinacocha" },
  { value: "calleria",      label: "Callería" },
  { value: "manantay",      label: "Manantay" },
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
          className={`h-3.5 w-3.5 ${s <= Math.round(r) ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-0.5 text-xs text-gray-500 dark:text-gray-400">
        {r > 0 ? r.toFixed(1) : "—"} ({count})
      </span>
    </div>
  );
}

function StoreInitials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <div
      className="flex h-full w-full items-center justify-center text-2xl font-black text-white"
      style={{ background: "linear-gradient(135deg, #00B4A6 0%, #134e4a 100%)" }}
    >
      {initials}
    </div>
  );
}

// ---------- skeletons ----------

function StoreCardSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="h-32 rounded-t-2xl bg-gray-200 dark:bg-gray-800" />
      <div className="p-4 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-9 w-full rounded-xl bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

// ---------- card de tienda ----------

function StoreCard({ store }: { store: Store }) {
  const isOpen = store.isOpen ?? true; // fallback optimista

  return (
    <article
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"
      aria-label={`Tienda ${store.name}`}
    >
      {/* imagen / iniciales */}
      <div className="relative h-32 overflow-hidden rounded-t-2xl bg-gray-100 dark:bg-gray-800">
        {store.logo ? (
          <Image
            src={store.logo}
            alt={`Logo de ${store.name}`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <StoreInitials name={store.name} />
        )}
        {/* badge abierto/cerrado */}
        <span
          className={`absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-bold ${
            isOpen
              ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
          }`}
        >
          {isOpen ? "Abierto" : "Cerrado"}
        </span>
      </div>

      {/* contenido */}
      <div className="flex flex-1 flex-col p-4">
        <h2 className="truncate text-base font-bold text-gray-900 dark:text-white">
          {store.name}
        </h2>

        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold capitalize text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
            {store.category}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
            {store.zone?.replace(/-/g, " ")}
          </span>
        </div>

        <div className="mt-2">
          <StarRating rating={store.rating} count={store.reviewCount} />
        </div>

        {store.productCount != null && (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {store.productCount} productos
          </p>
        )}

        <Link
          href={`/marketplace/${store.slug}`}
          aria-label={`Ver tienda ${store.name}`}
          className="mt-auto pt-4 block w-full min-h-[44px] rounded-xl text-center text-sm font-bold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          style={{
            background: "linear-gradient(135deg, #00B4A6 0%, #0d6560 100%)",
            boxShadow: "0 4px 14px -2px rgba(15,118,110,0.35)",
            paddingTop: "0.625rem",
            paddingBottom: "0.625rem",
          }}
        >
          Ver tienda
        </Link>
      </div>
    </article>
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white sm:text-4xl">
          Encuentra tu bodega
        </h1>
        <p className="mt-2 text-base text-gray-600 dark:text-gray-400">
          Todas las bodegas, minimarkets y distribuidores en un solo lugar
        </p>
      </div>

      {/* ── BARRA DE BÚSQUEDA ──────────────────────────────────── */}
      <div className="mb-6">
        <div className="relative">
          <svg
            aria-hidden="true"
            className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
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
            className="w-full rounded-2xl border border-gray-300 bg-white py-3 pl-12 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>
      </div>

      {/* ── FILTROS ────────────────────────────────────────────── */}
      <div className="mb-8 space-y-3">
        {/* Zonas */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
                    ? "bg-teal-700 text-white shadow-sm"
                    : "bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>

        {/* Categorías */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
                    ? "bg-teal-700 text-white shadow-sm"
                    : "bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
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
        <div role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
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
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[...Array(6)].map((_, i) => <StoreCardSkeleton key={i} />)}
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 py-20 dark:border-gray-700">
          <svg
            aria-hidden="true"
            className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg font-semibold text-gray-500 dark:text-gray-400">
            No se encontraron tiendas
          </p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Prueba con otros filtros o busca por otro nombre
          </p>
          <button
            onClick={() => { setSearch(""); setZone(""); setCategory(""); }}
            aria-label="Limpiar todos los filtros y ver todas las tiendas"
            className="mt-4 min-h-[44px] rounded-xl bg-teal-700 px-6 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <>
          <p
            aria-live="polite"
            aria-atomic="true"
            className="mb-4 text-sm text-gray-500 dark:text-gray-400"
          >
            {stores.length} {stores.length === 1 ? "tienda encontrada" : "tiendas encontradas"}
          </p>
          <div
            role="list"
            aria-label={`${stores.length} ${stores.length === 1 ? "tienda encontrada" : "tiendas encontradas"}`}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {stores.map((s) => (
              <div key={s.id} role="listitem">
                <StoreCard store={s} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
