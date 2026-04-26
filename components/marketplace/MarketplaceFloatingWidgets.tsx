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
 * Al ser dynamic() con ssr: false, se descargan DESPUES del primer paint,
 * cuando el browser esta idle — no inflan el bundle inicial.
 */

import dynamic from "next/dynamic";

const CompareFloatingBadge = dynamic(
  () => import("@/components/marketplace/CompareFloatingBadge"),
  { ssr: false },
);

const ProductCompareDrawer = dynamic(
  () => import("@/components/marketplace/ProductCompareDrawer"),
  { ssr: false },
);

// Reemplazado por QuickAddModal (centrado, soporta modifiers).
// El modal usa el mismo QuickAddProvider context que el drawer, así que
// los call-sites no cambian.
const QuickAddModal = dynamic(
  () => import("@/components/store/QuickAddModal"),
  { ssr: false },
);

const LocalStorageDoctor = dynamic(
  () => import("@/components/LocalStorageDoctor"),
  { ssr: false },
);

const FloatingDockController = dynamic(
  () => import("@/components/marketplace/FloatingDockController"),
  { ssr: false },
);

const MarketplaceFirstVisitTour = dynamic(
  () => import("@/components/marketplace/MarketplaceFirstVisitTour"),
  { ssr: false },
);

const DockFeatureSpotlight = dynamic(
  () => import("@/components/marketplace/DockFeatureSpotlight"),
  { ssr: false },
);

export default function MarketplaceFloatingWidgets() {
  return (
    <>
      <LocalStorageDoctor />
      <CompareFloatingBadge />
      <ProductCompareDrawer />
      <QuickAddModal />
      <FloatingDockController />
      <MarketplaceFirstVisitTour />
      <DockFeatureSpotlight />
    </>
  );
}
