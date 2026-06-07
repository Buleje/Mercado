"use client";

/**
 * MarketplaceFloatingWidgets — Client wrapper que lazy-loadea los widgets
 * floating del marketplace.
 *
 * Widgets originales (pre-ronda4):
 *   - CompareFloatingBadge
 *   - ProductCompareDrawer
 *   - QuickAddDrawer
 *   - LocalStorageDoctor
 *
 * Ronda 4 UX additions (todos controlados por el FloatingDockController):
 *   - QuickActionsDock: dock flotante (scroll top, historial, ayuda)
 *   - RecentlyViewedDrawer: drawer con productos vistos recientemente
 *   - ShortcutHelpModal: modal con ? para ver atajos
 *
 * Al ser dynamic() con se descargan DESPUES del primer paint,
 * cuando el browser esta idle — no inflan el bundle inicial.
 */

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const CompareFloatingBadge = dynamic(
  () => import("@/components/marketplace/CompareFloatingBadge"),
  {},
);

const ProductCompareDrawer = dynamic(
  () => import("@/components/marketplace/ProductCompareDrawer"),
  {},
);

// NOTA 2026-06-07: el <QuickAddModal/> ya NO se monta aquí. Al unificar
// marketplace/tiendas bajo el (store) layout, ese layout monta UN solo
// <QuickAddModal/> global (cubre home + marketplace + tiendas). Si lo
// montáramos también acá quedaría DOBLE (dos modales sobre el mismo
// QuickAddProvider context → se abren dos a la vez). Dedupe → uno solo en el layout.

const LocalStorageDoctor = dynamic(
  () => import("@/components/LocalStorageDoctor"),
  {},
);

const FloatingDockController = dynamic(
  () => import("@/components/marketplace/FloatingDockController"),
  { ssr: false, loading: () => null },
);

const MarketplaceFirstVisitTour = dynamic(
  () => import("@/components/marketplace/MarketplaceFirstVisitTour"),
  { ssr: false, loading: () => null },
);

const DockFeatureSpotlight = dynamic(
  () => import("@/components/marketplace/DockFeatureSpotlight"),
  { ssr: false, loading: () => null },
);

// Auto-gate por ruta (2026-06-07): al vivir ahora en el (store) layout
// persistente (que cubre home, /negocios, etc.), estos widgets de compra
// (compare badge/drawer, dock, recently-viewed, tour) solo tienen sentido en
// las superficies de catálogo del marketplace. Fuera de ahí son ruido visual.
// Mismo criterio que ConditionalShoppingChrome para los flujos de inscripción.
const SHOW_PREFIXES = ["/marketplace", "/tiendas"];
const HIDE_PREFIXES = [
  "/marketplace/repartidor",
  "/marketplace/aplicar",
  "/marketplace/onboarding",
  "/marketplace/vender",
];

export default function MarketplaceFloatingWidgets() {
  const pathname = usePathname() ?? "";
  const show =
    SHOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !HIDE_PREFIXES.some((p) => pathname.startsWith(p));
  if (!show) return null;

  return (
    <>
      <LocalStorageDoctor />
      <CompareFloatingBadge />
      <ProductCompareDrawer />
      <FloatingDockController />
      <MarketplaceFirstVisitTour />
      <DockFeatureSpotlight />
    </>
  );
}
