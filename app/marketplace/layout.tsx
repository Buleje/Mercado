import { Suspense } from "react";
import type { Metadata } from "next";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import MarketplaceStoreProviders from "@/components/MarketplaceStoreProviders";
import MotionProvider from "@/components/MotionProvider";
import CompareFloatingBadge from "@/components/marketplace/CompareFloatingBadge";
import ProductCompareDrawer from "@/components/marketplace/ProductCompareDrawer";
import QuickAddDrawer from "@/components/marketplace/QuickAddDrawer";
import ContextualHintBar from "@/components/marketplace/home/ContextualHintBar";
import MarketplaceSecondaryNav from "@/components/marketplace/MarketplaceSecondaryNav";
import LocalStorageDoctor from "@/components/LocalStorageDoctor";
import { QuickAddProvider } from "@/contexts/quick-add-context";
import { SkipLink } from "@/components/ui-system/SkipLink";

export const metadata: Metadata = {
  title: {
    default: "Marketplace Buleje — Bodegas y Tiendas de Todo el Peru",
    template: "%s | Marketplace · Buleje",
  },
  description:
    "Encuentra bodegas, minimarkets y tiendas de todo el Peru en un solo lugar. Compra con delivery rapido. Yape y efectivo.",
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
      {/* LazyMotion boundary — sin esto los `m.*` de framer-motion
          (usados por MarketplaceContent y otros) quedan en opacity: 0
          porque no hay features cargadas. Fix 2026-04-16 — el hero y
          la stats row aparecían en blanco sin esto. */}
      <MotionProvider>
        <QuickAddProvider>
          {/* Doctor en su propio Suspense — no contamina el render tree server.
              Solo hace side effects en el cliente (sanitización de localStorage). */}
          <Suspense fallback={null}>
            <LocalStorageDoctor />
          </Suspense>
          <div className="relative min-h-screen bg-gray-50 dark:bg-gray-950">
            {/* Skip-link WCAG 2.4.1 — antes del navbar para que sea el primer
                tabulable del scope marketplace. */}
            <SkipLink />
            {/* Cada componente dinámico en su propio Suspense para cumplir con
                Next 16 Cache Components (ADR-019). Sin esto, cualquier acceso
                a cookies/connection() dentro del árbol bloquea TODA la route
                y la vuelve lenta (warning "blocking-route"). */}
            <Suspense fallback={null}>
              <MarketplaceNavbar />
            </Suspense>
            {/* Barra secundaria — sticky top-16 debajo del navbar principal.
                Es un Client Component puro (sin Suspense necesario porque no
                hace fetch ni accede a cookies — solo estado local + router). */}
            <MarketplaceSecondaryNav />
            <Suspense fallback={null}>
              <ContextualHintBar />
            </Suspense>
            <Suspense fallback={null}>
              <main id="main-content">{children}</main>
            </Suspense>
            <Suspense fallback={null}>
              <CompareFloatingBadge />
              <ProductCompareDrawer />
              <QuickAddDrawer />
            </Suspense>
          </div>
        </QuickAddProvider>
      </MotionProvider>
    </MarketplaceStoreProviders>
  );
}
