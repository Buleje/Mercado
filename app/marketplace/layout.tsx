import type { Metadata } from "next";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import StoreProviders from "@/components/StoreProviders";
import MotionProvider from "@/components/MotionProvider";

export const metadata: Metadata = {
  title: {
    default: "Marketplace Buleje — Bodegas y Tiendas de Todo el Peru",
    template: "%s | Marketplace · Buleje",
  },
  description:
    "Encuentra bodegas, minimarkets y tiendas de todo el Peru en un solo lugar. Compra con delivery rapido. Yape y efectivo.",
};

/**
 * Marketplace layout — usa StoreProviders con tenantSlug="main" porque
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
    <StoreProviders tenantSlug="main">
      {/* LazyMotion boundary — sin esto los `m.*` de framer-motion
          (usados por MarketplaceContent y otros) quedan en opacity: 0
          porque no hay features cargadas. Fix 2026-04-16 — el hero y
          la stats row aparecían en blanco sin esto. */}
      <MotionProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <MarketplaceNavbar />
          <main id="main-content">{children}</main>
        </div>
      </MotionProvider>
    </StoreProviders>
  );
}
