import { Suspense } from "react";
import MarketplaceStoreProviders from "@/components/MarketplaceStoreProviders";
import MotionProvider from "@/components/MotionProvider";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import QuickAddDrawer from "@/components/marketplace/QuickAddDrawer";
import BottomNav from "@/components/marketplace/BottomNav";
import Footer from "@/components/Footer";
import { QuickAddProvider } from "@/contexts/quick-add-context";
import { AddedToCartDrawerProvider } from "@/components/marketplace/AddedToCartDrawer";
import { SkipLink } from "@/components/ui-system/SkipLink";
import NavModeToast from "@/components/marketplace/NavModeToast";
import MainWithBackKey from "@/components/marketplace/MainWithBackKey";

/**
 * Layout de `/tiendas` — alineado con `/marketplace/layout.tsx`.
 *
 * Chrome persistente (NO se remonta entre navegaciones):
 *   - Navbar, Footer viven aquí.
 *   - Providers: Store + Motion + QuickAdd + AddedToCartDrawer.
 *   - Sólo el `<main>` interior se re-renderiza al cambiar de ruta.
 *
 * Anti-flash 2026-05-21 (Brandon):
 *   · ConditionalPromoBar y ConditionalSecondaryNav fueron removidos del
 *     árbol: ambos dependen del hook client `useMarketplaceNavMode()` que
 *     arranca `null` en SSR y resuelve después → producía un swap visible
 *     (PromoBar y SecondaryNav aparecían 1 frame y luego se ocultaban).
 *     En `/tiendas` la decisión es estática: nunca se muestran.
 *   · `MarketplaceNavbar` recibe `modeOverride="tiendas-only"` para evitar
 *     el flash de links (sin el prop, el hook recortaba "Bodegas" post-
 *     hidratación → reflow del navbar visible).
 *   · El Suspense del navbar se removió: no había async hijo que lo
 *     justificara y producía 1 frame sin chrome.
 */
/**
 * NavbarSkeleton — fallback del Suspense del MarketplaceNavbar.
 *
 * Brandon 2026-05-21 fix Next 16: el navbar accede uncached data (cookies
 * vía useCustomer, platform brand fetch) → sin Suspense bloqueaba el
 * render entero del /tiendas con error
 *   "Uncached data or connection() was accessed outside of <Suspense>"
 *
 * Mantenemos la altura exacta del navbar (h-16 desktop, h-14 mobile) +
 * background sólido para que NO haya CLS cuando el navbar real hidrate.
 */
function NavbarSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-40 h-14 sm:h-16 w-full bg-[var(--surface-raised)] border-b border-[var(--rule-soft)]"
    />
  );
}

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
              {/* Brandon 2026-05-21 fix Next 16 Cache Components: el navbar
                  accede uncached data (cookies/brand). Wrappear en Suspense
                  permite que el resto del layout streame mientras el navbar
                  resuelve. Fallback con la altura exacta para evitar CLS. */}
              <Suspense fallback={<NavbarSkeleton />}>
                <MarketplaceNavbar modeOverride="tiendas-only" />
              </Suspense>
              {/*
                MainWithBackKey: detecta back-nav desde /marketplace/[slug] y
                re-monta el subárbol del listado para que useEffect/fetch
                vuelvan a correr (evita skeletons eternos en /tiendas tras
                volver de un detail).
              */}
              <Suspense fallback={null}>
                <MainWithBackKey>{children}</MainWithBackKey>
              </Suspense>
              <Suspense fallback={null}>
                <Footer modeOverride="tiendas-only" />
              </Suspense>
              <Suspense fallback={null}>
                <QuickAddDrawer />
              </Suspense>
              {/* StickyCartBar removido del directorio /tiendas (Brandon, mayo 14 2026):
                  el carrito flotante solo aparece dentro de una tienda concreta
                  (/marketplace/[slug]). En el directorio /tiendas el cliente esta
                  navegando entre tiendas, no comprando, asi que el bar flotante
                  era ruido visual. */}
              <Suspense fallback={null}>
                <BottomNav />
              </Suspense>
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
