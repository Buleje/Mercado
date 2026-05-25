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

      {/* Desktop: mega-menú + accesos rápidos. En tiendas-only se oculta —
          /tiendas tiene su propio bloque de filtros + hero de búsqueda. */}
      {mode !== "tiendas-only" && <MarketplaceSecondaryNav />}
    </>
  );
}
