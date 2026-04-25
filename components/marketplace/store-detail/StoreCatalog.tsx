"use client";

/**
 * StoreCatalog — grid filtrable de productos del tenant.
 *
 * Filtros: categoría (chips externos via prop), sort, búsqueda.
 * Grid: 2 cols mobile / 3 tablet / 4 desktop.
 * Reutiliza UnifiedProductCard del marketplace para tener el mismo
 * carrito + AddedToCartDrawer modal en toda la PDP de tienda.
 *
 * REGLA: No calcula totales — usa retailPrice directo (backend lo validó).
 * Evitar setState en useEffect — usar event handlers (lint rule hooks/set-state-in-effect).
 */

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, LayoutGrid, List } from "@buleje/design-system/icons";
import { CanastaVacia } from "@/components/ui-system/illustrations";
import { cn } from "@/lib/utils";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import type { DbStoreProduct } from "@/lib/db/marketplace.db";

interface StoreCatalogProps {
  storeSlug: string;
  storeName: string;
  storeId: string;
  products: DbStoreProduct[];
  /** Categoría activa desde StoreCategories (prop-driven, no local state) */
  activeCategory: string | null;
}

type SortKey = "default" | "price_asc" | "price_desc" | "name_az";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "Relevancia" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
  { value: "name_az", label: "Nombre A-Z" },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function ProductListRow({
  product,
  storeSlug,
}: {
  product: DbStoreProduct;
  storeSlug: string;
}) {
  const href = `/marketplace/${storeSlug}/producto/${product.id}`;
  return (
    <Link
      href={href}
      className="flex gap-4 items-center p-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 transition-colors group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        {product.productImage ? (
          <Image
            src={product.productImage}
            alt={product.productName}
            width={64}
            height={64}
            className="object-cover w-full h-full"
          />
        ) : (
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 text-center leading-tight px-1">
            {product.productCategory}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
          {product.productName}
        </p>
        {product.productUnit && (
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {product.productUnit}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-sm font-bold text-[var(--text-primary)]">
          {fmt(product.retailPrice)}
        </p>
      </div>
    </Link>
  );
}

export default function StoreCatalog({
  storeSlug,
  storeName,
  storeId,
  products,
  activeCategory,
}: StoreCatalogProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = useMemo(() => {
    let list = [...products];

    // Filter by active category (controlled from parent)
    if (activeCategory) {
      list = list.filter(
        (p) => p.productCategory?.toLowerCase() === activeCategory.toLowerCase()
      );
    }

    // Filter by search
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.productName.toLowerCase().includes(q));
    }

    // Sort
    if (sort === "price_asc") list.sort((a, b) => a.retailPrice - b.retailPrice);
    else if (sort === "price_desc") list.sort((a, b) => b.retailPrice - a.retailPrice);
    else if (sort === "name_az") list.sort((a, b) => a.productName.localeCompare(b.productName, "es"));

    return list;
  }, [products, activeCategory, search, sort]);

  return (
    <section
      id="catalogo"
      aria-labelledby="store-catalog-heading"
      className="scroll-mt-24 space-y-6"
    >
      {/* Header */}
      <div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-2">
          Catálogo
        </p>
        <h2
          id="store-catalog-heading"
          className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white"
        >
          Todos nuestros productos
        </h2>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition"
          />
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Ordenar por"
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Count + view toggle */}
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
          </span>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label="Vista en cuadrícula"
              aria-pressed={view === "grid"}
              className={cn(
                "p-2 transition-colors",
                view === "grid"
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                  : "bg-white dark:bg-gray-900 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="Vista en lista"
              aria-pressed={view === "list"}
              className={cn(
                "p-2 border-l border-gray-200 dark:border-gray-700 transition-colors",
                view === "list"
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                  : "bg-white dark:bg-gray-900 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid or list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-gray-500 dark:text-gray-400">
          <CanastaVacia size={120} strokeWidth={1.5} />
          <p className="text-sm font-medium">No hay productos que coincidan</p>
          {(search || activeCategory) && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-xs underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((p, idx) => (
            <UnifiedProductCard
              key={p.id}
              index={idx}
              href={`/marketplace/${storeSlug}/producto/${p.id}`}
              product={{
                id: p.productId,
                name: p.productName,
                price: p.retailPrice,
                image: p.productImage,
                unit: p.productUnit,
                category: p.productCategory,
                storeId,
                storeName,
                storeSlug,
                storeProductId: p.id,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((p) => (
            <ProductListRow key={p.id} product={p} storeSlug={storeSlug} />
          ))}
        </div>
      )}
    </section>
  );
}
