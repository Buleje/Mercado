"use client";

/**
 * ConditionalSecondaryNav — controla la barra secundaria del marketplace:
 *   - "tiendas-only" → null (la página /tiendas maneja sus propios filtros
 *     + hero de búsqueda; sin banner secundario sticky para mayor foco).
 *   - "full" / "minimo" → MarketplaceSecondaryNav (Ofertas, Recetas, etc.)
 */

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
import MarketplaceCategoriesBar from "@/components/marketplace/MarketplaceCategoriesBar";
import MarketplaceVerticalChips from "@/components/marketplace/home/MarketplaceVerticalChips";

const MarketplaceSecondaryNav = dynamic(
  () => import("@/components/marketplace/MarketplaceSecondaryNav"),
  {},
);

export default function ConditionalSecondaryNav() {
  const mode = useMarketplaceNavMode();
  // Brandon 2026-05-30 v2: en "modo tienda" (tiendas-only, el default) NO se
  // muestra NINGUNA sub-nav — ni la barra de categorías de producto mobile
  // (Frutas, Snacks…) ni el mega-menú desktop. El foco es el listado de
  // tiendas; la página /tiendas ya trae sus propios filtros + buscador. Las
  // categorías de producto vuelven solo en full/minimo/custom. Esperamos a que
  // `mode` resuelva (≠ null) para evitar el flash "aparece 1 frame" al hidratar.
  const showSubNav = mode !== null && mode !== "tiendas-only";
  // Brandon 2026-06-07: en /tiendas NO mostramos la barra de chips de categoría
  // de producto (Bebidas, Guarniciones…) — /tiendas mobile más minimalista.
  const pathname = usePathname() ?? "";
  const onTiendas = pathname.startsWith("/tiendas");
  const onHome = pathname === "/";
  return (
    <>
      {/* HOME mobile (Brandon 2026-06-11): chips de vertical (SIEMPRE — son la
          nav principal del Inicio, no dependen del nav-mode) + la barra de
          categorías de producto (si subnav) apilados en UN solo bloque sticky
          (top-52). Stacking sin matemática de offsets: la barra de categorías
          va `embedded` (sin su propio sticky). md:hidden — en desktop los chips
          viven en la página (sticky top-112). */}
      {onHome && (
        // Brandon 2026-06-18 (perf/CLS): `min-h-[81px]` reserva la altura de las
        // dos barras (chips 43px + subcats 39px — medido con
        // scripts/dev-helpers/_measure-nav-heights.mjs). Cada barra renderiza
        // `null` mientras hace su fetch en useEffect (active-verticals / subcats)
        // y recién entonces crece → sin reserva, ese crecimiento empujaba el
        // contenido 81px hacia abajo (era el shift dominante de la home móvil,
        // CLS 0.083). En la home del marketplace (cross-store) SIEMPRE hay varios
        // verticales, así que las barras llenan exactamente esos 81px.
        <div className="md:hidden sticky top-[52px] z-40 min-h-[81px] bg-[var(--surface-canvas)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-canvas)]/80">
          {/* Brandon 2026-06-11: cada barra es dueña de su borde/padding y se
              auto-oculta (verticales si ≤1 categoría; subcats si no hay). Así el
              contenedor no deja una franja vacía cuando no hay nada que mostrar. */}
          <Suspense fallback={null}>
            <MarketplaceVerticalChips />
          </Suspense>
          {/* Brandon 2026-06-11: en la home las subcategorías de producto van
              SIEMPRE (no dependen del nav-mode) — son la navegación directa que
              pidió Brandon. Se acotan al vertical de arriba y se auto-ocultan si
              ese vertical no tiene subcategorías. */}
          <Suspense fallback={null}>
            <MarketplaceCategoriesBar embedded />
          </Suspense>
        </div>
      )}

      {/* Fuera de la home: barra de categorías de PRODUCTO mobile con su propio
          sticky. md:hidden — en desktop manda el mega-menú. Oculta en /tiendas. */}
      {!onHome && showSubNav && !onTiendas && <MarketplaceCategoriesBar />}

      {/* Desktop: mega-menú + filtros rápidos. Solo full/minimo/custom.
          Brandon 2026-06-18 (perf/CLS): Suspense PROPIA. Sin ella, el chunk
          dynamic de este mega-menú suspendía y burbujeaba a la Suspense externa
          del layout, dejando TODO el secondary nav (incluidos los chips+subcats
          de la home móvil) en null hasta que cargaba → aparecían de golpe y
          empujaban el contenido 81px. Aislado, los chips de la home renderizan ya. */}
      {showSubNav && (
        <Suspense fallback={null}>
          <MarketplaceSecondaryNav />
        </Suspense>
      )}
    </>
  );
}
