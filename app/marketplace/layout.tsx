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
import ConditionalGlobalChrome from "@/components/marketplace/ConditionalGlobalChrome";
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
                  del marketplace. Sólo el `<main>` interior se re-renderiza.
                  Brandon mayo 15 v2: en mobile dentro de /marketplace/[slug]
                  (storefront), el chrome global se oculta porque el
                  StoreDetailClient tiene su propio top fixed nav Rappi-style. */}
              {/* Audit P13 (Next 16) + Brandon mayo 15 v3:
                  ConditionalGlobalChrome usa usePathname() — debe estar en
                  su propio Suspense para no bloquear el resto del layout
                  (warning "Uncached data... outside of <Suspense>"). */}
              <Suspense fallback={null}>
                <ConditionalGlobalChrome>
                  <ConditionalPromoBar />
                  <Suspense fallback={null}>
                    <MarketplaceNavbar />
                  </Suspense>
                  <Suspense fallback={null}>
                    <ConditionalSecondaryNav />
                  </Suspense>
                </ConditionalGlobalChrome>
              </Suspense>
              {/*
                MainWithBackKey: re-monta el subárbol al volver de /marketplace/[slug]
                a /marketplace o /tiendas (detecta el back-nav vía sessionStorage
                marker + usePathname). Reemplaza al BackNavRefresh global que
                hacía window.location.reload() poco confiable.

                Audit P13 (Next 16): cada child que accede uncached data
                (cookies/headers/connection) debe estar en su propio Suspense
                boundary para que el streaming no bloquee el resto del layout.
              */}
              <Suspense fallback={null}>
                <MainWithBackKey>{children}</MainWithBackKey>
              </Suspense>
              {/* Footer persistente — evita flash / remount al navegar. */}
              <Suspense fallback={null}>
                <Footer />
              </Suspense>
              {/* Widgets de compra — ocultos en rutas de inscripción/onboarding. */}
              <Suspense fallback={null}>
                <ConditionalShoppingChrome>
                  <MarketplaceFloatingWidgets />
                  {/* Brandon 2026-05-27: StickyCartBar flotante removida — el
                      CTA de carrito ahora vive integrado en BottomNav (un solo
                      nav abajo: franja de carrito + tabs). */}
                  <BottomNav />
                </ConditionalShoppingChrome>
              </Suspense>
              {/* Toast de cambio de modo nav — solo aparece al detectar cambio */}
              <Suspense fallback={null}>
                <NavModeToast />
              </Suspense>
            </div>
          </AddedToCartDrawerProvider>
        </QuickAddProvider>
      </MotionProvider>
    </MarketplaceStoreProviders>
  );
}
