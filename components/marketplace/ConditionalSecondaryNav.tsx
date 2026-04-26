"use client";

/**
 * ConditionalSecondaryNav — controla la barra secundaria del marketplace:
 *   - "tiendas-only" → null (la página /tiendas maneja sus propios filtros
 *     + hero de búsqueda; sin banner secundario sticky para mayor foco).
 *   - "full" / "minimo" → MarketplaceSecondaryNav (Ofertas, Recetas, etc.)
 */

import dynamic from "next/dynamic";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";

const MarketplaceSecondaryNav = dynamic(
  () => import("@/components/marketplace/MarketplaceSecondaryNav"),
  { ssr: false },
);

export default function ConditionalSecondaryNav() {
  const mode = useMarketplaceNavMode();
  // En tiendas-only el banner secundario se oculta — la página /tiendas
  // expone su propio bloque de filtros y un hero de búsqueda cuando hay query.
  if (mode === "tiendas-only") return null;
  return <MarketplaceSecondaryNav />;
}
