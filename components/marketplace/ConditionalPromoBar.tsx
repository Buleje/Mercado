"use client";

/**
 * ConditionalPromoBar — wrapper que oculta MarketplacePromoBar cuando el
 * modo activo es "tiendas-only". En "full" o "minimo" lo renderiza normal.
 */

import dynamic from "next/dynamic";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";

const MarketplacePromoBar = dynamic(
  () => import("@/components/marketplace/MarketplacePromoBar"),
  {},
);

export default function ConditionalPromoBar() {
  const mode = useMarketplaceNavMode();
  // Mientras se hidrata (mode === null) renderizamos para evitar flash.
  // En "tiendas-only" lo escondemos completamente.
  if (mode === "tiendas-only") return null;
  return <MarketplacePromoBar />;
}
