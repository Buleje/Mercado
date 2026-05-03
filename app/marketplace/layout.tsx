import { Suspense } from "react";
import type { Metadata } from "next";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import MarketplaceStoreProviders from "@/components/MarketplaceStoreProviders";
import MotionProvider from "@/components/MotionProvider";
// Widgets floating lazy-loaded (dynamic ssr:false) — reducen el bundle
// initial del layout en ~300-500kb de framer-motion.
import MarketplaceFloatingWidgets from "@/components/marketplace/MarketplaceFloatingWidgets";
import ConditionalSecondaryNav from "@/components/marketplace/ConditionalSecondaryNav";
import ConditionalPromoBar from "@/components/marketplace/ConditionalPromoBar";
import StickyCartBar from "@/components/marketplace/StickyCartBar";
import BottomNav from "@/components/marketplace/BottomNav";
import ConditionalShoppingChrome from "@/components/marketplace/ConditionalShoppingChrome";
import Footer from "@/components/Footer";
import { QuickAddProvider } from "@/contexts/quick-add-context";
import { AddedToCartDrawerProvider } from "@/components/marketplace/AddedToCartDrawer";
import { SkipLink } from "@/components/ui-system/SkipLink";
import NavModeToast from "@/components/marketplace/NavModeToast";
import MainWithBackKey from "@/components/marketplace/MainWithBackKey";

// Designer audit P0: el template anterior "%s | Marketplace · Buleje"
// generaba duplicaciones tipo "Marketplace — Bodegas... | Marketplace · Buleje"
// y triple "Tienda | Marketplace Buleje | Marketplace · Buleje". Removido —
// se hereda el template root "%s | Buleje" para todas las rutas marketplace.
export const metadata: Metadata = {
  title: {
    default: "Marketplace — Bodegas y Tiendas del Perú",
    template: "%s | Buleje",
  },
  description:
    "Encuentra bodegas, minimarkets y tiendas del Perú en un solo lugar. Delivery rápido, pago con Yape o efectivo.",
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
              <ConditionalPromoBar />
              <Suspense fallback={null}>
                <MarketplaceNavbar />
              </Suspense>
              <Suspense fallback={null}>
                <ConditionalSecondaryNav />
              </Suspense>
              {/*
                MainWithBackKey: re-monta el subárbol al volver de /marketplace/[slug]
                a /marketplace o /tiendas (detecta el back-nav vía sessionStorage
                marker + usePathname). Reemplaza al BackNavRefresh global que
                hacía window.location.reload() poco confiable.
              */}
              <MainWithBackKey>{children}</MainWithBackKey>
              {/* Footer persistente — evita flash / remount al navegar. */}
              <Footer />
              {/* Widgets de compra — ocultos en rutas de inscripción/onboarding. */}
              <ConditionalShoppingChrome>
                <MarketplaceFloatingWidgets />
                <StickyCartBar />
                <BottomNav />
              </ConditionalShoppingChrome>
              {/* Toast de cambio de modo nav — solo aparece al detectar cambio */}
              <NavModeToast />
            </div>
          </AddedToCartDrawerProvider>
        </QuickAddProvider>
      </MotionProvider>
    </MarketplaceStoreProviders>
  );
}
