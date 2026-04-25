import { Suspense } from "react";
import MarketplaceStoreProviders from "@/components/MarketplaceStoreProviders";
import MotionProvider from "@/components/MotionProvider";
import MarketplacePromoBar from "@/components/marketplace/MarketplacePromoBar";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import MarketplaceSecondaryNav from "@/components/marketplace/MarketplaceSecondaryNav";
import QuickAddDrawer from "@/components/marketplace/QuickAddDrawer";
import StickyCartBar from "@/components/marketplace/StickyCartBar";
import Footer from "@/components/Footer";
import { QuickAddProvider } from "@/contexts/quick-add-context";
import { AddedToCartDrawerProvider } from "@/components/marketplace/AddedToCartDrawer";
import { SkipLink } from "@/components/ui-system/SkipLink";

/**
 * Layout de `/tiendas` — alineado con `/marketplace/layout.tsx`.
 *
 * Chrome persistente (NO se remonta entre navegaciones):
 *   - Navbar, SecondaryNav, Footer viven aquí.
 *   - Providers: Store + Motion + QuickAdd + AddedToCartDrawer.
 *   - Sólo el `<main>` interior se re-renderiza al cambiar de ruta.
 */
export default function TiendasLayout({
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
              <Footer />
              <Suspense fallback={null}>
                <QuickAddDrawer />
              </Suspense>
              <StickyCartBar />
            </div>
          </AddedToCartDrawerProvider>
        </QuickAddProvider>
      </MotionProvider>
    </MarketplaceStoreProviders>
  );
}
