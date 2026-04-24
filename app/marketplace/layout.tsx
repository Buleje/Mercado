import { Suspense } from "react";
import type { Metadata } from "next";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import MarketplacePromoBar from "@/components/marketplace/MarketplacePromoBar";
import MarketplaceStoreProviders from "@/components/MarketplaceStoreProviders";
import MotionProvider from "@/components/MotionProvider";
// Widgets floating lazy-loaded (dynamic ssr:false) — reducen el bundle
// initial del layout en ~300-500kb de framer-motion.
import MarketplaceFloatingWidgets from "@/components/marketplace/MarketplaceFloatingWidgets";
import MarketplaceSecondaryNav from "@/components/marketplace/MarketplaceSecondaryNav";
import Footer from "@/components/Footer";
import { QuickAddProvider } from "@/contexts/quick-add-context";
import { AddedToCartDrawerProvider } from "@/components/marketplace/AddedToCartDrawer";
import { SkipLink } from "@/components/ui-system/SkipLink";

export const metadata: Metadata = {
  title: {
    default: "Marketplace Buleje — Bodegas y Tiendas de Todo el Perú",
    template: "%s | Marketplace · Buleje",
  },
  description:
    "Encuentra bodegas, minimarkets y tiendas de todo el Perú en un solo lugar. Compra con delivery rápido. Yape y efectivo.",
};

/**
 * Marketplace layout — usa MarketplaceStoreProviders con tenantSlug="main" porque
 * el marketplace es global (no tiene tenant específico). Los providers
 * (CartProvider, CustomerProvider, FavoritesProvider, etc.) son necesarios
 * para componentes como PersonalizedRecommendations que llaman useCustomer().
 *
 * Fix 2026-04-09: sin este wrapper, PersonalizedRecommendations rompía
 * con "useCustomer must be inside CustomerProvider" al entrar a /marketplace.
 */
export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketplaceStoreProviders tenantSlug="main">
      <MotionProvider>
        <QuickAddProvider>
          <AddedToCartDrawerProvider>
            <div className="relative min-h-screen bg-[var(--surface-canvas)]">
              <SkipLink />
              {/* Chrome persistente — NO se remonta al navegar entre páginas
                  del marketplace. Sólo el `<main>` interior se re-renderiza. */}
              <MarketplacePromoBar />
              <Suspense fallback={null}>
                <MarketplaceNavbar />
              </Suspense>
              <Suspense fallback={null}>
                <MarketplaceSecondaryNav />
              </Suspense>
              <Suspense fallback={null}>
                <main id="main-content">{children}</main>
              </Suspense>
              {/* Footer persistente — evita flash / remount al navegar. */}
              <Footer />
              {/* 4 widgets floating (compare, quick-add, storage doctor)
                  lazy-loadeados — descarga diferida post-FCP. */}
              <MarketplaceFloatingWidgets />
            </div>
          </AddedToCartDrawerProvider>
        </QuickAddProvider>
      </MotionProvider>
    </MarketplaceStoreProviders>
  );
}
