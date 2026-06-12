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
        <div className="md:hidden sticky top-[52px] z-40 bg-[var(--surface-canvas)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-canvas)]/80">
          <Suspense fallback={<div className="h-[57px]" />}>
            <div className="border-b border-[var(--rule-soft)] py-2.5">
              <MarketplaceVerticalChips />
            </div>
          </Suspense>
          {showSubNav && <MarketplaceCategoriesBar embedded />}
        </div>
      )}

      {/* Fuera de la home: barra de categorías de PRODUCTO mobile con su propio
          sticky. md:hidden — en desktop manda el mega-menú. Oculta en /tiendas. */}
      {!onHome && showSubNav && !onTiendas && <MarketplaceCategoriesBar />}

      {/* Desktop: mega-menú + filtros rápidos. Solo full/minimo/custom. */}
      {showSubNav && <MarketplaceSecondaryNav />}
    </>
  );
}
