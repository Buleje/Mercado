"use client";

/**
 * HomeCatalog — «Todo el mercado» de la home (rediseño «Dosel», 2026-10-10).
 *
 *   1. Una sola fila de control: el orden en píldoras (se desplazan a 400) y,
 *      fijo a la derecha, «Filtros» (panel con los mismos filtros de siempre).
 *   2. Los 3 pasillos (HomeEstantes) — solo en el estado por defecto.
 *   3. La grilla (CatalogView con HomeProductCard): 1.ª tanda de 3 filas y «Ver más»
 *      en vez de scroll infinito, para que las preguntas de abajo se alcancen.
 *
 * Ya no monta CatalogSections («Últimas unidades» pasó a «Se acaban hoy») ni
 * CatalogCategorySections (los 6 carriles → 3 pasillos).
 *
 * Providers auto-contenidos: CatalogFilterProvider (filtro categoría/sort) +
 * FlyToCartProvider (animación "volar al carrito"). El carrito lo da StoreProviders.
 */

import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  CatalogFilterProvider,
  useCatalogFilter,
  type CatalogSort,
} from "@/components/marketplace/catalog-filter-context";
import FlyToCartProvider from "@/components/marketplace/FlyToCart";
import { isValidVertical } from "@/lib/marketplace/verticals";
import { CardTitle } from "@buleje/design-system";
import CatalogView from "@/components/marketplace/CatalogView";
import CatalogSortTabs from "@/components/marketplace/home/CatalogSortTabs";
import HomeEstantes from "@/components/marketplace/home/HomeEstantes";

// Brandon 2026-06-13: el rail IZQUIERDO fijo de filtros se reemplazó por un
// botón "Filtros" → panel (estilo AliExpress/Temu). El catálogo ocupa TODO el
// ancho (más columnas). Los filtros son los mismos (MarketplaceLeftRail dentro
// del sheet), solo que bajo demanda.
const CatalogFiltersSheet = dynamic(
  () => import("@/components/marketplace/home/CatalogFiltersSheet"),
  { loading: () => <div className="h-12 w-[6.75rem] shrink-0" aria-hidden /> },
);

/**
 * CatalogUrlSync — aplica los filtros del URL (?sort / ?cat) al catálogo de la
 * home. Reactivo: los chips del nav apuntan a /?sort=newest#catalogo y, al
 * navegar (soft-nav), este sync actualiza el orden → el grid refetcha. Reemplaza
 * a la /explorar deprecada que botaba el parámetro. Va en <Suspense> (useSearchParams).
 */
const SORT_ALIAS: Record<string, CatalogSort> = {
  popular: "popular",
  "best-sellers": "popular",
  best_sellers: "popular",
  bestsellers: "popular",
  newest: "newest",
  price_asc: "price_asc",
  price_desc: "price_desc",
  rating: "rating",
};

function CatalogUrlSync() {
  const sp = useSearchParams();
  const ctx = useCatalogFilter();
  // Brandon 2026-06-13 FIX: el `ctx` cambia identidad en CADA render (el value
  // del provider no estaba memoizado). Antes estaba en las deps de este effect,
  // así que el effect corría en cada render y RESETEABA la categoría a "todos"
  // (no hay ?cat= en el Inicio) → al clickear una categoría del rail, el
  // re-render la borraba al instante. Ahora el ctx va por REF y el effect solo
  // depende de los params de la URL → sincroniza URL→contexto, sin pisar las
  // selecciones directas del rail lateral.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const sortParam = sp.get("sort");
  const catParam = sp.get("cat") ?? sp.get("category");
  const vParam = sp.get("v");
  useEffect(() => {
    const c = ctxRef.current;
    if (!c) return;
    const mapped = sortParam ? SORT_ALIAS[sortParam.toLowerCase()] : undefined;
    if (mapped) c.setSort(mapped);
    // Categoría: si la URL la trae la aplica; si NO, la limpia (volver a "Todo").
    c.setCategory(catParam ? catParam.toLowerCase() : "todos");
    // Vertical: solo si el ?v= es válido; sino sin filtro (todo el catálogo).
    c.setVertical(isValidVertical(vParam) ? vParam!.toLowerCase() : "");
  }, [sortParam, catParam, vParam]);
  return null;
}

/** Columnas de la grilla en esta pantalla (las de CATALOG_GRID). */
function columnas(): number {
  if (typeof window === "undefined") return 6;
  const mq = (px: number) => window.matchMedia(`(min-width: ${px}px)`).matches;
  return mq(1280) ? 6 : mq(1024) ? 5 : mq(768) ? 4 : mq(640) ? 3 : 2;
}
// 1.ª tanda: 3 filas (4 en celular, donde la fila es de 2) → 18 a 1280, 8 a 400.
// Cada «Ver más»: 6 filas. Filas completas en todos los anchos.
const primeraTanda = () => columnas() * (columnas() === 2 ? 4 : 3);
const tandaSiguiente = () => columnas() * 6;

/** Rótulo de la grilla: solo cuando arriba están los pasillos. */
function TituloGrilla() {
  const f = useCatalogFilter();
  const enReposo =
    !f || (f.category === "todos" && !f.vertical && !f.priceKey && !f.storeSlug && f.sort === "popular");
  if (!enReposo) return null;
  return (
    <CardTitle as="h3" className="mb-3 mt-8 font-bold">
      Todos los productos
    </CardTitle>
  );
}

export default function HomeCatalog() {
  return (
    <FlyToCartProvider>
      <CatalogFilterProvider>
        <Suspense fallback={null}>
          <CatalogUrlSync />
        </Suspense>
        {/* Fila de control: orden (se desplaza) + Filtros (fijo a la derecha). */}
        <div className="mb-5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Suspense fallback={<div className="h-11" />}>
              <CatalogSortTabs />
            </Suspense>
          </div>
          <CatalogFiltersSheet />
        </div>
        <HomeEstantes />
        <TituloGrilla />
        <CatalogView tanda={primeraTanda} tandaSiguiente={tandaSiguiente} cargaManual />
      </CatalogFilterProvider>
    </FlyToCartProvider>
  );
}
