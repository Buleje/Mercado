import { Suspense } from "react";
import MarketplaceStoreProviders from "@/components/MarketplaceStoreProviders";
import MotionProvider from "@/components/MotionProvider";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import ConditionalPromoBar from "@/components/marketplace/ConditionalPromoBar";
import ConditionalSecondaryNav from "@/components/marketplace/ConditionalSecondaryNav";
import QuickAddDrawer from "@/components/marketplace/QuickAddDrawer";
import StickyCartBar from "@/components/marketplace/StickyCartBar";
import BottomNav from "@/components/marketplace/BottomNav";
import Footer from "@/components/Footer";
import { QuickAddProvider } from "@/contexts/quick-add-context";
import { AddedToCartDrawerProvider } from "@/components/marketplace/AddedToCartDrawer";
import { SkipLink } from "@/components/ui-system/SkipLink";
import NavModeToast from "@/components/marketplace/NavModeToast";
import BackNavRefresh from "@/components/marketplace/BackNavRefresh";

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
              <ConditionalPromoBar />
              <Suspense fallback={null}>
                <MarketplaceNavbar />
              </Suspense>
              <Suspense fallback={null}>
                <ConditionalSecondaryNav />
              </Suspense>
              {/*
                NO envolver children en <Suspense fallback={null}> — al hacer
                back, Next 16 re-suspende el segmento y este Suspense devolvía
                `null`, dejando la página estática hasta refresh manual.
                BackNavRefresh garantiza re-fetch del RSC al detectar popstate.
              */}
              <BackNavRefresh />
              <main id="main-content">{children}</main>
              <Footer />
              <Suspense fallback={null}>
                <QuickAddDrawer />
              </Suspense>
              <StickyCartBar />
              <BottomNav />
              <NavModeToast />
            </div>
          </AddedToCartDrawerProvider>
        </QuickAddProvider>
      </MotionProvider>
    </MarketplaceStoreProviders>
  );
}
