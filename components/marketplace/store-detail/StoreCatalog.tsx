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
  const href = `/marketplace/${storeSlug}/producto/${product.productId}`;
  return (
    <Link
      href={href}
      className="flex gap-4 items-center p-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 transition-colors group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center">
        {product.productImage ? (
          <Image
            src={product.productImage}
            alt={product.productName}
            width={64}
            height={64}
            className="object-cover w-full h-full"
          />
        ) : (
          <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] text-center leading-tight px-1">
            {product.productCategory}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
          {product.productName}
        </p>
        {product.productUnit && (
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
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

  /**
   * Cuando NO hay filtro activo (ni categoría ni búsqueda), agrupamos los
   * productos por categoría para que el cliente navegue por secciones —
   * mucho más fácil que un grid plano de 40+ items mezclados. Cuando aplica
   * un filtro o busca, mostramos un grid plano (las secciones vacías
   * confunden al filtrar).
   */
  const grouped = useMemo(() => {
    if (activeCategory || search.trim()) return null;
    const map = new Map<string, DbStoreProduct[]>();
    for (const p of filtered) {
      const cat = p.productCategory || "Otros";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    // Orden estable: por cantidad descendente (la categoría con más
    // productos primero suele ser la "estrella" del catálogo).
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered, activeCategory, search]);

  const humanizeCategory = (id: string) =>
    id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <section
      id="catalogo"
      aria-labelledby="store-catalog-heading"
      className="scroll-mt-24 space-y-6"
    >
      {/* Header */}
      <div>
        <p className="text-sm font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
          Catálogo
        </p>
        <h2
          id="store-catalog-heading"
          className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]"
        >
          Todos nuestros productos
        </h2>
      </div>

      {/* Toolbar — filtros grandes, cuadrados, visibles */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        {/* Search — input grande, padding generoso, icono más grande */}
        <div className="relative flex-1 lg:max-w-md">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-secondary)]"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 h-12 text-base font-medium rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] transition"
          />
        </div>

        {/* Sort — select grande con label visible */}
        <label className="relative inline-flex flex-col gap-1">
          <span className="sr-only">Ordenar por</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Ordenar por"
            className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] px-4 pr-10 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] transition cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* Count + view toggle */}
        <div className="flex items-center gap-3 lg:ml-auto">
          <span className="text-sm font-bold tabular-nums text-[var(--text-secondary)] whitespace-nowrap px-3 py-2 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]">
            {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
          </span>
          <div className="flex rounded-2xl border-2 border-[var(--rule-base)] overflow-hidden bg-[var(--surface-raised)]">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label="Vista en cuadrícula"
              aria-pressed={view === "grid"}
              className={cn(
                "h-12 w-12 inline-flex items-center justify-center transition-colors",
                view === "grid"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              )}
            >
              <LayoutGrid className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="Vista en lista"
              aria-pressed={view === "list"}
              className={cn(
                "h-12 w-12 inline-flex items-center justify-center border-l-2 border-[var(--rule-base)] transition-colors",
                view === "list"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              )}
            >
              <List className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid or list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-[var(--text-secondary)]">
          <CanastaVacia size={120} strokeWidth={1.5} />
          <p className="text-lg font-bold text-[var(--text-primary)]">No hay productos que coincidan</p>
          {(search || activeCategory) && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-base font-semibold text-[var(--accent)] underline underline-offset-4 decoration-2 hover:text-[var(--data-success-600)] transition-colors"
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : view === "list" ? (
        <div className="flex flex-col gap-2">
          {filtered.map((p) => (
            <ProductListRow key={p.id} product={p} storeSlug={storeSlug} />
          ))}
        </div>
      ) : grouped ? (
        // Vista por secciones: agrupada por categoría, cada sección con su header.
        <div className="space-y-10">
          {grouped.map(([cat, items]) => (
            <section
              key={cat}
              id={`cat-${cat}`}
              className="scroll-mt-28"
              aria-labelledby={`cat-h-${cat}`}
            >
              <div className="flex items-center gap-3 mb-5">
                <span className="h-3.5 w-3.5 rounded-full bg-[var(--accent)] shrink-0 shadow-[0_0_0_4px_var(--accent-soft)]" aria-hidden="true" />
                <div>
                  <h3
                    id={`cat-h-${cat}`}
                    className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] leading-tight tracking-tight"
                  >
                    {humanizeCategory(cat)}
                  </h3>
                  <p className="text-base font-medium text-[var(--text-secondary)]">
                    {items.length} producto{items.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {items.map((p, idx) => (
                  <UnifiedProductCard
                    key={p.id}
                    index={idx}
                    href={`/marketplace/${storeSlug}/producto/${p.productId}`}
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
                      modifierGroups: p.modifierGroups,
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        // Grid plano cuando hay filtro de categoría o búsqueda activa.
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {filtered.map((p, idx) => (
            <UnifiedProductCard
              key={p.id}
              index={idx}
              href={`/marketplace/${storeSlug}/producto/${p.productId}`}
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
                modifierGroups: p.modifierGroups,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
