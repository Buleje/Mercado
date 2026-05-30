"use client";

/**
 * ConditionalSecondaryNav — controla la barra secundaria del marketplace:
 *   - "tiendas-only" → null (la página /tiendas maneja sus propios filtros
 *     + hero de búsqueda; sin banner secundario sticky para mayor foco).
 *   - "full" / "minimo" → MarketplaceSecondaryNav (Ofertas, Recetas, etc.)
 */

import dynamic from "next/dynamic";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
import MarketplaceCategoriesBar from "@/components/marketplace/MarketplaceCategoriesBar";

const MarketplaceSecondaryNav = dynamic(
  () => import("@/components/marketplace/MarketplaceSecondaryNav"),
  {},
);

export default function ConditionalSecondaryNav() {
  const mode = useMarketplaceNavMode();
  return (
    <>
      {/* Barra de categorías MOBILE (chips scrollables estilo storefront) —
          SIEMPRE visible. NO depende del modo: el default del marketplace es
          "tiendas-only", que ocultaba el secondary nav entero y dejaba el cel
          sin categorías. Es md:hidden, así que en desktop no compite con el
          mega-menú. */}
      <MarketplaceCategoriesBar />

      {/* Desktop: mega-menú + filtros rápidos. Aparece en full/minimo/custom;
          se oculta en tiendas-only. Esperamos a que `mode` resuelva (≠ null)
          antes de renderizar para evitar el flash "aparece 1 frame y se oculta"
          al hidratar (el hook arranca null en SSR). Brandon 2026-05-30. */}
      {mode !== null && mode !== "tiendas-only" && <MarketplaceSecondaryNav />}
    </>
  );
}
