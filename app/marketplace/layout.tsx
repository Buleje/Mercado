import type { Metadata } from "next";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import StoreProviders from "@/components/StoreProviders";

export const metadata: Metadata = {
  title: {
    default: "Marketplace | Buleje — Todas las bodegas en un solo lugar",
    template: "%s | Marketplace · Buleje",
  },
  description:
    "Encuentra todas las bodegas, minimarkets y distribuidores de Pucallpa en un solo lugar.",
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <MarketplaceNavbar />
        <main id="main-content">{children}</main>
      </div>
    </StoreProviders>
  );
}
