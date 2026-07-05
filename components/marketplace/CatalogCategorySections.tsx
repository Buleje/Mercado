"use client";

/**
 * CatalogCategorySections — Brandon 2026-07-05 (audit comprador #2).
 *
 * Reemplaza la sensación de "una sola lista infinita mezclada" del catálogo del
 * Inicio por BLOQUES CORTOS por categoría (Bebidas, Comida, Abarrotes…), cada uno
 * un carrusel horizontal + un botón "Ver más" que filtra el catálogo a esa
 * categoría (setea ?cat=, que CatalogUrlSync ya consume, y baja a #catalogo).
 *
 * Solo aparece en modo "explorar todo" (sin categoría/vertical/búsqueda activa).
 * Al elegir una categoría (chip o "Ver más"), este bloque se oculta y el grid
 * plano (CatalogView) muestra esa categoría completa → cero duplicación.
 *
 * Reusa los primitivos canónicos (MarketplaceSection + HorizontalCarousel +
 * UnifiedProductCard) y el MISMO mapeo de card que CatalogView.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import { useCatalogFilter } from "@/components/marketplace/catalog-filter-context";
import { cachedJson } from "@/lib/client-cache-fetch";

// Cuántas categorías mostrar como sección + productos por fila.
const MAX_SECTIONS = 6;
const PER_SECTION = 12;

interface CatalogProductLite {
  storeProductId: string;
  productId: number;
  name: string;
  description?: string | null;
  price: number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo: string | null;
  storeRating: number;
}

interface CategorySection {
  id: string;
  label: string;
  products: CatalogProductLite[];
}

/** "pollo-brasa" → "Pollo brasa" · "bebidas" → "Bebidas" */
function prettyLabel(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Mismo adapter que CatalogView.toCatalogCardProduct (single source de forma). */
function toCard(p: CatalogProductLite) {
  return {
    id: p.productId,
    name: p.name,
    description: p.description ?? null,
    price: p.price,
    image: p.image,
    storeName: p.storeName,
    storeSlug: p.storeSlug,
    storeId: p.storeId,
    storeProductId: p.storeProductId,
    storeRating: p.storeRating,
    storeLogo: p.storeLogo,
    unit: p.unit,
    category: p.category ?? undefined,
    stock: p.stock,
  };
}

export default function CatalogCategorySections() {
  const filterCtx = useCatalogFilter();
  // Deps PRIMITIVAS (no el objeto filterCtx, cuya identidad cambia cada render)
  // para no disparar refetch en loop.
  const category = filterCtx?.category ?? "todos";
  const vertical = filterCtx?.vertical ?? "";
  // Solo en "explorar todo": con una categoría/vertical elegida el grid plano ya
  // muestra ese filtro → estas secciones se ocultan (cero duplicación).
  const active = category !== "todos" || vertical !== "";

  const [sections, setSections] = useState<CategorySection[] | null>(null);

  useEffect(() => {
    if (active) return;
    let cancelled = false;
    (async () => {
      try {
        const catRes = await cachedJson<{ categories?: { id: string; count: number }[] }>(
          "/api/marketplace/product-categories",
          300_000,
        );
        const cats = (catRes?.categories ?? [])
          .filter((c) => c.id && c.count > 0)
          .slice(0, MAX_SECTIONS);
        if (cats.length === 0) {
          if (!cancelled) setSections([]);
          return;
        }
        // allSettled: si una categoría falla, las demás igual se muestran.
        const settled = await Promise.allSettled(
          cats.map((c) =>
            cachedJson<{ data?: CatalogProductLite[] }>(
              `/api/marketplace/catalog?category=${encodeURIComponent(c.id)}&sort=popular&limit=${PER_SECTION}`,
              120_000,
            ).then(
              (r): CategorySection => ({
                id: c.id,
                label: prettyLabel(c.id),
                products: r?.data ?? [],
              }),
            ),
          ),
        );
        const results = settled
          .filter((s): s is PromiseFulfilledResult<CategorySection> => s.status === "fulfilled")
          .map((s) => s.value)
          .filter((s) => s.products.length > 0);
        if (!cancelled) setSections(results);
      } catch {
        // Secciones no críticas: si falla el listado de categorías, no mostramos
        // nada (el grid plano de abajo sigue funcionando).
        if (!cancelled) setSections([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (active) return null;
  if (!sections || sections.length === 0) return null;

  // Brandon 2026-07-05: sin MarketplaceSection (que imponía max-w-[1600px] + px
  // propio + py-16 gigante). Estas secciones HEREDAN el contenedor del catálogo
  // (max-w-[1760px]) → mismo ancho que el grid "Todos los productos", separación
  // vertical mínima y pareja, y `edgeBleed={false}` para que las cards se alineen
  // al borde del grid.
  return (
    <div className="space-y-6 sm:space-y-7">
      {sections.map((sec) => (
        <section key={sec.id} id={`cat-${sec.id}`} aria-labelledby={`${sec.id}-h`}>
          <div className="mb-2.5 flex items-end justify-between gap-3 sm:mb-3">
            <div className="min-w-0">
              <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                Categoría
              </p>
              <h3
                id={`${sec.id}-h`}
                className="text-lg font-black leading-tight tracking-tight text-[var(--text-primary)] sm:text-2xl"
              >
                {sec.label}
              </h3>
            </div>
            <Link
              href={`/?cat=${encodeURIComponent(sec.id)}#catalogo`}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-extrabold text-[var(--accent)] transition-all hover:gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Ver más
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </Link>
          </div>
          <HorizontalCarousel ariaLabel={`Productos de ${sec.label}`} edgeBleed={false}>
            {sec.products.map((p, i) => (
              <UnifiedProductCard
                key={p.storeProductId}
                product={toCard(p)}
                layout="compact"
                index={i}
              />
            ))}
          </HorizontalCarousel>
        </section>
      ))}
    </div>
  );
}
