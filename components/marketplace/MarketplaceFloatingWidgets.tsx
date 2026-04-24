"use client";

/**
 * MarketplaceFloatingWidgets — Client wrapper que lazy-loadea los 4 widgets
 * floating del marketplace (CompareFloatingBadge, ProductCompareDrawer,
 * QuickAddDrawer, LocalStorageDoctor).
 *
 * Estos widgets:
 *   - Solo aparecen visualmente si hay estado (items en compare, quick-add
 *     trigger, localStorage issues)
 *   - Suman ~300-500kb de framer-motion al bundle inicial del layout
 *
 * Al ser dynamic() con ssr: false, se descargan DESPUES del primer paint,
 * cuando el browser esta idle.
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

const QuickAddDrawer = dynamic(
  () => import("@/components/marketplace/QuickAddDrawer"),
  { ssr: false },
);

const LocalStorageDoctor = dynamic(
  () => import("@/components/LocalStorageDoctor"),
  { ssr: false },
);

export default function MarketplaceFloatingWidgets() {
  return (
    <>
      <LocalStorageDoctor />
      <CompareFloatingBadge />
      <ProductCompareDrawer />
      <QuickAddDrawer />
    </>
  );
}
