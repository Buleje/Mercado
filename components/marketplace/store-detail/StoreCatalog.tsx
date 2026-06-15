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

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, LayoutGrid, List, ShoppingCart, Check, Flame } from "@buleje/design-system/icons";
import { CanastaVacia } from "@/components/ui-system/illustrations";
import { cn } from "@/lib/utils";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import ProductModifierModal from "@/components/marketplace/ProductModifierModal";
import { useMarketplaceCart, modifierHashOf } from "@/hooks/use-marketplace-cart";
import type { DbStoreProduct } from "@/lib/db/marketplace.db";

/**
 * PENTEST 2026-05-18 Fase 3 P1 #33: slugifyCat para IDs HTML válidos.
 * Antes: `id={`cat-${cat}`}` con cat="Pollo a la Brasa" generaba `cat-Pollo a la Brasa`
 * — espacios NO son válidos en HTML id. getElementById("cat-Pollo a la Brasa") = null.
 * El scrollspy y el click handler fallaban silenciosamente para cualquier categoría
 * de 2+ palabras ("Pollo a la Brasa", "Jugos Naturales", "Pizza Familiar", etc.).
 * AHORA: slug determinista alfanumérico + guiones. Reverse-lookup via data attribute.
 */
export function slugifyCat(cat: string): string {
  return cat
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacríticos (á → a)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface StoreCatalogProps {
  storeSlug: string;
  storeName: string;
  storeId: string;
  /** Prueba social de la tienda — para el bloque de confianza del modal. */
  storeRating?: number;
  storeReviewCount?: number;
  storeCategory?: string | null;
  /** ISO de creación de la tienda (antigüedad en el modal). */
  storeSince?: string | null;
  products: DbStoreProduct[];
  /** Categoría activa desde StoreCategories (prop-driven, no local state) */
  activeCategory: string | null;
  /** Búsqueda controlada desde el sticky bar del padre. Si no se pasa,
      el catalog mantiene su input interno como fallback. */
  externalSearch?: string;
  onExternalSearchChange?: (value: string) => void;
  /** View toggle controlado desde el padre (sticky bar arriba del catalogo).
      Si no se pasa, fallback al toggle local en el toolbar. */
  externalView?: "grid" | "list";
  onExternalViewChange?: (view: "grid" | "list") => void;
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
  storeId,
  storeName,
  storeRating,
  storeReviewCount,
  storeCategory,
  storeSince,
  storeProductCount,
}: {
  product: DbStoreProduct;
  storeSlug: string;
  storeId: string;
  storeName: string;
  storeRating?: number;
  storeReviewCount?: number;
  storeCategory?: string | null;
  storeSince?: string | null;
  storeProductCount?: number;
}) {
  const href = `/marketplace/${storeSlug}/producto/${product.productId}`;
  const { addItem, items } = useMarketplaceCart();
  // qty del producto en este store (para mostrar feedback "ya agregado")
  const inCart = items.find(
    (i) => i.productId === product.productId && i.storeId === storeId,
  );
  const qty = inCart?.quantity ?? 0;
  const hasModifiers = (product.modifierGroups?.length ?? 0) > 0;
  const [modifierModalOpen, setModifierModalOpen] = useState(false);

  const handleAdd = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Brandon 2026-05-27: SIEMPRE abrir el modal "Armá tu pedido", tenga o no
      // adicionales. Sin grupos el modal muestra solo cantidad + agregar.
      // Unifica el flujo de agregado en un único formato.
      setModifierModalOpen(true);
    },
    [],
  );

  return (
    <div className="flex gap-3 sm:gap-4 items-center p-3 sm:p-4 rounded-xl max-md:rounded-none border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 transition-colors group">
      <Link
        href={href}
        className="flex flex-1 min-w-0 gap-3 sm:gap-4 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded-lg"
      >
        <div className="flex-shrink-0 w-16 h-16 rounded-lg max-md:rounded-none overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center">
          {product.productImage ? (
            <Image
              src={product.productImage}
              alt={product.productName}
              width={64}
              height={64}
              sizes="64px"
              className="object-cover w-full h-full"
            />
          ) : (
            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] text-center leading-tight px-1">
              {product.productCategory}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {/*
            SEO 2026-05-28 audit P1: product name was <p>, ahora <h3> para que
            Google entienda jerarquía H1(store) → H2(catálogo) → H3(producto).
            ItemList JSON-LD asocia mejor con headings semánticos. className
            mantiene estética idéntica.
          */}
          <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
            {product.productName}
          </h3>
          {product.productUnit && (
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5 truncate">
              {product.productUnit}
            </p>
          )}
          <p className="mt-1 text-base sm:text-lg font-extrabold text-[var(--text-primary)] tabular-nums">
            {fmt(product.retailPrice)}
          </p>
        </div>
      </Link>
      <button
        type="button"
        onClick={handleAdd}
        aria-label={qty > 0 ? `Agregar otro ${product.productName}` : `Agregar ${product.productName} al carrito`}
        title={hasModifiers ? "Elegi opciones del producto" : "Agregar al carrito"}
        className={cn(
          "shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl max-md:rounded-none border-2 transition-all",
          // Tamaño grande para tap target en mobile, compacto en desktop.
          "h-12 w-12 sm:h-11 sm:w-auto sm:px-4",
          qty > 0
            ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-raised)]"
            : "border-[var(--text-primary)]/25 bg-transparent text-[var(--text-primary)] hover:border-[var(--text-primary)] hover:bg-[var(--text-primary)] hover:text-[var(--surface-raised)]",
        )}
      >
        {qty > 0 ? (
          <>
            <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            <span className="hidden sm:inline text-sm font-extrabold tabular-nums">{qty}</span>
          </>
        ) : (
          <>
            <ShoppingCart className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            <span className="hidden sm:inline text-sm font-extrabold">Agregar</span>
          </>
        )}
      </button>

      {/* Modal "Armá tu pedido" — SIEMPRE montado (Brandon 2026-05-27): todo
          producto abre este formato; sin adicionales muestra solo cantidad. */}
      {(
        <ProductModifierModal
          open={modifierModalOpen}
          onClose={() => setModifierModalOpen(false)}
          product={{
            id: product.productId,
            name: product.productName,
            price: product.retailPrice,
            image: product.productImage ?? null,
            unit: product.productUnit ?? null,
            category: product.productCategory ?? null,
            storeId,
            storeName,
            storeSlug,
            storeProductId: String(product.id),
            description: null,
            storeRating: storeRating ?? null,
            storeReviewCount: storeReviewCount ?? null,
            storeCategory: storeCategory ?? null,
            storeProductCount: storeProductCount ?? null,
            storeSince: storeSince ?? null,
          }}
          groups={product.modifierGroups ?? []}
          onConfirm={({ quantity, modifiers, finalUnitPrice }) => {
            addItem({
              storeId,
              storeName,
              storeSlug,
              storeProductId: String(product.id),
              productId: product.productId,
              name: product.productName,
              price: finalUnitPrice,
              basePrice: product.retailPrice,
              image: product.productImage ?? null,
              unit: product.productUnit ?? null,
              category: product.productCategory,
              stock: product.stock ?? null,
              modifiers,
              modifierHash: modifierHashOf(modifiers),
              quantity,
            });
            setModifierModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default function StoreCatalog({
  storeSlug,
  storeName,
  storeId,
  storeRating,
  storeReviewCount,
  storeCategory,
  storeSince,
  products,
  activeCategory,
  externalSearch,
  onExternalSearchChange,
  externalView,
  onExternalViewChange,
}: StoreCatalogProps) {
  // Tamaño real del catálogo — prueba social honesta (no "unidades vendidas").
  const storeProductCount = products.length;
  // Prueba social compartida que viaja al modal de añadir (vía card o list row).
  const storeTrust = {
    storeRating,
    storeReviewCount,
    storeCategory,
    storeProductCount,
    storeSince,
  } as const;
  const [internalSearch, setInternalSearch] = useState("");
  // Si el padre controla la búsqueda (desde el sticky bar), usar esa.
  // Si no, fallback al estado interno (input local del toolbar).
  const search = externalSearch !== undefined ? externalSearch : internalSearch;
  const setSearch = onExternalSearchChange ?? setInternalSearch;
  const [sort, setSort] = useState<SortKey>("default");
  const [internalView, setInternalView] = useState<"grid" | "list">("grid");
  const view = externalView ?? internalView;
  const setView = onExternalViewChange ?? setInternalView;
  // Si el view se controla afuera, ocultamos el toggle local en el toolbar.
  const showLocalViewToggle = externalView === undefined;

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
    // Preservar insertion order del Map — los productos llegan pre-ordenados
    // desde StoreDetailPage (app/marketplace/[slug]/page.tsx) aplicando
    // category-order + product-order persistidos por el admin. Antes
    // ordenabamos aqui por count desc lo que rompia la intencion del admin.
    return Array.from(map.entries());
  }, [filtered, activeCategory, search]);

  const humanizeCategory = (id: string) =>
    id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <section
      id="catalogo"
      aria-labelledby="store-catalog-heading"
      className="scroll-mt-24 space-y-6"
    >
      {/* Header SR-only — el heading visible vive en cada sección de categoría.
          Brandon mayo 15 v6: quitado "Todos nuestros productos" + contadores.
          La estrategia comercial Rappi-style: que el cliente vea PRODUCTOS,
          no labels burocráticos. */}
      <h2 id="store-catalog-heading" className="sr-only">
        Catálogo de productos
      </h2>

      {/* Toolbar — filtros grandes, cuadrados, visibles */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        {/* Search local — solo se muestra si NO hay search externo del sticky
            bar (el padre la controla). Evita tener dos inputs duplicados. */}
        {externalSearch === undefined && (
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
              className="w-full pl-12 pr-4 h-12 text-base font-medium rounded-2xl max-md:rounded-none border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] transition"
            />
          </div>
        )}

        {/* Sort — select grande con label visible */}
        <label className="relative inline-flex flex-col gap-1">
          <span className="sr-only">Ordenar por</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Ordenar por"
            className="h-12 rounded-2xl max-md:rounded-none border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] px-4 pr-10 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] transition cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* View toggle — quitado el contador "N productos" (ruido visual).
            Brandon mayo 15 v6: facilidad de uso primero, los contadores
            distraen del catálogo. */}
        <div className="flex items-center gap-3 lg:ml-auto">
          {showLocalViewToggle && (
            <div className="flex rounded-2xl max-md:rounded-none border-2 border-[var(--rule-base)] overflow-hidden bg-[var(--surface-raised)]">
              <button
                type="button"
                onClick={() => setView("grid")}
                aria-label="Vista en cuadrícula"
                aria-pressed={view === "grid"}
                className={cn(
                  "h-12 w-12 inline-flex items-center justify-center transition-colors",
                  view === "grid"
                    ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
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
                    ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                )}
              >
                <List className="h-5 w-5" />
              </button>
            </div>
          )}
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
              className="text-base font-semibold text-[var(--text-primary)] underline underline-offset-4 decoration-2 hover:opacity-70 transition-opacity"
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : view === "list" ? (
        <div className="flex flex-col gap-2">
          {filtered.map((p) => (
            <ProductListRow
              key={p.id}
              product={p}
              storeSlug={storeSlug}
              storeId={storeId}
              storeName={storeName}
              {...storeTrust}
            />
          ))}
        </div>
      ) : grouped ? (
        // Vista por secciones: agrupada por categoría, cada sección con su header.
        <div className="space-y-10">
          {grouped.map(([cat, items], catIdx) => {
            // Brandon mayo 15 v6: estrategia comercial Rappi/iFood:
            //   - Primera categoría = "Los más pedidos" (anclaje + social proof)
            //   - Segunda en adelante = nombre real (Combos, Pizzas, etc)
            //   - Quitado el contador "N productos" (ruido)
            //   - Subtítulo con copy de venta + scarcity sutil
            const isFirstCategory = catIdx === 0;
            const subtitleByPosition = isFirstCategory
              ? "Lo que la gente pide más esta semana"
              : catIdx === 1
                ? "Recomendados del chef"
                : items.length > 6
                  ? "Para todos los gustos"
                  : "Selección curada";
            return (
            <section
              key={cat}
              id={`cat-${slugifyCat(cat)}`}
              data-cat-name={cat}
              className="scroll-mt-28"
              aria-labelledby={`cat-h-${slugifyCat(cat)}`}
            >
              <div className="flex items-end justify-between gap-3 mb-5">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 rounded-full bg-[var(--text-primary)] shrink-0 shadow-[0_0_0_4px_var(--surface-sunken)]"
                  />
                  <div className="min-w-0">
                    <h3
                      id={`cat-h-${slugifyCat(cat)}`}
                      className="text-xl sm:text-2xl font-black text-[var(--text-primary)] leading-tight tracking-tight"
                    >
                      {isFirstCategory ? (
                        <span className="inline-flex items-center gap-2">
                          <Flame className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={2.5} aria-hidden />
                          Los más pedidos
                        </span>
                      ) : (
                        humanizeCategory(cat)
                      )}
                    </h3>
                    <p className="text-sm font-medium text-[var(--text-tertiary)] mt-0.5">
                      {subtitleByPosition}
                    </p>
                  </div>
                </div>
                {/* Badge "popular" en la primera categoría — social proof */}
                {isFirstCategory && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] px-3 h-7 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0 border border-[var(--rule-base)]">
                    <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--text-tertiary)] opacity-70 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
                    </span>
                    Trending
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-5 lg:gap-6">
                {items.map((p, idx) => (
                  <UnifiedProductCard
                    key={p.id}
                    index={idx}
                    hideStore
                    href={`/marketplace/${storeSlug}/producto/${p.productId}`}
                    product={{
                      id: p.productId,
                      name: p.productName,
                      price: p.retailPrice,
                      image: p.productImage,
                      unit: p.productUnit,
                      category: p.productCategory,
                      stock: p.stock ?? undefined,
                      storeId,
                      storeName,
                      storeSlug,
                      storeProductId: p.id,
                      modifierGroups: p.modifierGroups,
                      ...storeTrust,
                    }}
                  />
                ))}
              </div>
            </section>
            );
          })}
        </div>
      ) : (
        // Grid plano cuando hay filtro de categoría o búsqueda activa.
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-5 lg:gap-6">
          {filtered.map((p, idx) => (
            <UnifiedProductCard
              key={p.id}
              index={idx}
              hideStore
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
                ...storeTrust,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
