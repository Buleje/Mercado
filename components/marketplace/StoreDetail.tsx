"use client";

import { useState, useEffect, useCallback, useDeferredValue } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import MarketplaceChat from "@/components/marketplace/MarketplaceChat";

// ---------- tipos ----------

interface StoreInfo {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  category: string;
  zone: string;
  rating: number | null;
  reviewCount: number;
  description: string | null;
  isOpen?: boolean;
}

interface StoreProduct {
  id: number;
  name: string;
  price: number;
  unit: string | null;
  image: string | null;
  category: string | null;
  stock: number;
}

// ---------- helpers ----------

function StarRating({ rating, count }: { rating: number | null; count: number }) {
  const r = rating ?? 0;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          aria-hidden="true"
          className={`h-4 w-4 ${s <= Math.round(r) ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-sm font-medium text-gray-600 dark:text-gray-400">
        {r > 0 ? r.toFixed(1) : "Sin rating"} · {count} reseñas
      </span>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800 ${className}`} />
  );
}

function ProductCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="h-40 rounded-t-2xl bg-gray-200 dark:bg-gray-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-9 w-full rounded-xl bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

// ---------- product card ----------

function ProductCard({
  product,
  storeId,
  storeName,
  onAdded,
}: {
  product: StoreProduct;
  storeId: string;
  storeName: string;
  onAdded: (productName: string) => void;
}) {
  const [added, setAdded] = useState(false);
  const { addItem } = useMarketplaceCart();

  const handleAdd = () => {
    addItem({
      storeId,
      storeName,
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      unit: product.unit,
    });
    onAdded(product.name);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      <div className="relative h-40 overflow-hidden rounded-t-2xl bg-gray-100 dark:bg-gray-800">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-gray-300 dark:text-gray-600">
            <svg aria-hidden="true" className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-t-2xl bg-black/50">
            <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
              Agotado
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">
          {product.name}
        </h3>

        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-base font-bold text-teal-700 dark:text-teal-400">
            {fmt(product.price)}
          </span>
          {product.unit && (
            <span className="text-xs text-gray-400">/ {product.unit}</span>
          )}
        </div>

        {product.category && (
          <span className="mt-1 inline-block w-fit rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400 capitalize">
            {product.category}
          </span>
        )}

        <button
          onClick={handleAdd}
          disabled={product.stock === 0}
          aria-label={`Agregar ${product.name} al carrito`}
          className={`mt-auto pt-3 min-h-[44px] w-full rounded-xl text-sm font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50 ${
            added
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-teal-700 text-white hover:bg-teal-800"
          }`}
          style={!added ? { paddingTop: "0.5rem", paddingBottom: "0.5rem" } : {}}
        >
          {added ? "Agregado" : "Agregar"}
        </button>
      </div>
    </article>
  );
}

// ---------- componente principal ----------

export default function StoreDetail({ slug }: { slug: string }) {
  const [store, setStore]       = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [search, setSearch]     = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [loadingStore, setLoadingStore]     = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [errorStore, setErrorStore]         = useState<string | null>(null);
  const [errorProducts, setErrorProducts]   = useState<string | null>(null);
  const [toastMsg, setToastMsg]             = useState<string | null>(null);
  const [customerPhone, setCustomerPhone]   = useState<string | null>(null);

  // Leer phone del localStorage para el chat
  useEffect(() => {
    try {
      const raw = localStorage.getItem("marketplace-customer-phone");
      if (raw) setCustomerPhone(raw);
    } catch { /* silent */ }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const deferredSearch = useDeferredValue(search);

  const fetchStore = useCallback(async () => {
    setLoadingStore(true);
    setErrorStore(null);
    try {
      const res = await fetch(`/api/marketplace/stores/${slug}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setStore(json.data ?? null);
    } catch (err) {
      setErrorStore(err instanceof Error ? err.message : "No se pudo cargar la tienda");
    } finally {
      setLoadingStore(false);
    }
  }, [slug]);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    setErrorProducts(null);
    try {
      const params = new URLSearchParams();
      if (deferredSearch) params.set("search", deferredSearch);
      if (catFilter)      params.set("category", catFilter);

      const res = await fetch(`/api/marketplace/stores/${slug}/products?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setProducts(json.data ?? []);
    } catch (err) {
      setErrorProducts(err instanceof Error ? err.message : "No se pudieron cargar los productos");
    } finally {
      setLoadingProducts(false);
    }
  }, [slug, deferredSearch, catFilter]);

  useEffect(() => { fetchStore(); }, [fetchStore]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // categorías únicas de los productos para el filtro
  const categories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean))
  ) as string[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-0 sm:px-6 lg:px-8">
      {/* ── HEADER DE TIENDA ───────────────────────────────────── */}
      {loadingStore ? (
        <div className="mb-8">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="mt-4 space-y-2 px-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      ) : errorStore ? (
        <div className="mb-8 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {errorStore}{" "}
          <button onClick={fetchStore} className="underline hover:no-underline">Reintentar</button>
        </div>
      ) : store ? (
        <div className="mb-8">
          {/* banner */}
          <div className="relative h-40 overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 sm:h-48">
            {store.banner && (
              <Image
                src={store.banner}
                alt={`Banner de ${store.name}`}
                fill
                className="object-cover opacity-70"
                priority
                sizes="100vw"
              />
            )}
            {/* overlay info */}
            <div className="absolute inset-0 flex items-end p-5">
              <div className="flex items-center gap-4">
                {/* logo */}
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border-2 border-white/30 bg-white shadow-lg">
                  {store.logo ? (
                    <Image
                      src={store.logo}
                      alt={`Logo de ${store.name}`}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-xl font-black text-white"
                      style={{ background: "linear-gradient(135deg, #0f766e, #134e4a)" }}
                    >
                      {store.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>

                <div>
                  <h1 className="text-xl font-black text-white sm:text-2xl drop-shadow-sm">
                    {store.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white capitalize">
                      {store.category}
                    </span>
                    <span className="text-xs text-white/80 capitalize">
                      {store.zone?.replace(/-/g, " ")}
                    </span>
                    {(store.isOpen ?? true) ? (
                      <span className="rounded-full bg-green-400/30 px-2.5 py-0.5 text-xs font-bold text-green-200">
                        Abierto
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-400/30 px-2.5 py-0.5 text-xs font-bold text-red-200">
                        Cerrado
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* rating + descripción */}
          <div className="mt-4 px-1">
            <StarRating rating={store.rating} count={store.reviewCount} />
            {store.description && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {store.description}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-8 rounded-2xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">Tienda no encontrada</p>
          <Link
            href="/marketplace"
            className="mt-3 inline-block text-sm text-teal-600 underline hover:no-underline"
          >
            Volver al marketplace
          </Link>
        </div>
      )}

      {/* ── BARRA DE BÚSQUEDA + FILTROS ───────────────────────── */}
      <div className="mb-6 space-y-4">
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
            placeholder="Buscar producto…"
            aria-label="Buscar producto en la tienda"
            className="w-full rounded-2xl border border-gray-300 bg-white py-3 pl-12 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {/* filtro categoría (solo si hay categorías) */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
            <button
              onClick={() => setCatFilter("")}
              aria-pressed={catFilter === ""}
              className={`min-h-[36px] rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                catFilter === ""
                  ? "bg-teal-700 text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                aria-pressed={catFilter === c}
                className={`min-h-[36px] rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  catFilter === c
                    ? "bg-teal-700 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── GRID DE PRODUCTOS ──────────────────────────────────── */}
      {errorProducts && (
        <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {errorProducts}{" "}
          <button onClick={fetchProducts} className="underline hover:no-underline">Reintentar</button>
        </div>
      )}

      {loadingProducts ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 py-16 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">No se encontraron productos</p>
          {(search || catFilter) && (
            <button
              onClick={() => { setSearch(""); setCatFilter(""); }}
              className="mt-3 min-h-[44px] rounded-xl bg-teal-700 px-6 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {products.length} {products.length === 1 ? "producto" : "productos"}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                storeId={store?.id ?? slug}
                storeName={store?.name ?? "Tienda"}
                onAdded={(name) => showToast(`${name} agregado al carrito`)}
              />
            ))}
          </div>
        </>
      )}

      {/* Toast al agregar producto */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-gray-900/90 px-5 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur-sm dark:bg-gray-100/90 dark:text-gray-900"
        >
          {toastMsg}
        </div>
      )}

      {/* Chat floating widget */}
      {store && customerPhone && (
        <MarketplaceChat
          storeId={store.id}
          storeName={store.name}
          storeLogo={store.logo}
          customerPhone={customerPhone}
        />
      )}
    </div>
  );
}
