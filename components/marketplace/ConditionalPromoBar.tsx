"use client";

/**
 * ConditionalPromoBar — wrapper que oculta MarketplacePromoBar cuando el
 * modo activo es "tiendas-only". En "full" o "minimo" lo renderiza normal.
 */

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";

const MarketplacePromoBar = dynamic(
  () => import("@/components/marketplace/MarketplacePromoBar"),
  {},
);

export default function ConditionalPromoBar() {
  const mode = useMarketplaceNavMode();
  const pathname = usePathname();
  // Mientras se hidrata (mode === null) renderizamos para evitar flash.
  // En "tiendas-only" lo escondemos completamente.
  if (mode === "tiendas-only") return null;
  /**
   * Tampoco en `/tiendas` (Brandon 2026-08-03): es el directorio donde se viene
   * a BUSCAR un negocio, y la franja empujaba la lista hacia abajo. Sigue en la
   * home y en el resto del marketplace.
   *
   * Va por `pathname` y no por el modo de navegación porque
   * `useMarketplaceNavMode` hoy devuelve "full" constante — quedó así para
   * evitar el FOUC de hidratación, así que "tiendas-only" ya no lo apaga nadie.
   */
  if ((pathname ?? "").startsWith("/tiendas")) return null;
  return <MarketplacePromoBar />;
}
