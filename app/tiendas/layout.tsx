import { Suspense } from "react";
import MarketplaceStoreProviders from "@/components/MarketplaceStoreProviders";
import MotionProvider from "@/components/MotionProvider";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import ConditionalSecondaryNav from "@/components/marketplace/ConditionalSecondaryNav";
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
 * Unificación nav/sub-nav 2026-05-30 (Brandon):
 *   · `/tiendas` ya NO fuerza `modeOverride="tiendas-only"`. El modo lo decide
 *     el superadmin (/superadmin/stores → Navegación). Así el nav + sub-nav
 *     son IDÉNTICOS en todas las páginas marketplace (/marketplace, /explorar,
 *     /tienda, /negocios, /vender, /tiendas) y "Marketplace completo" se
 *     refleja en todas a la vez.
 *   · `ConditionalSecondaryNav` montado de nuevo: internamente decide según el
 *     modo (full/minimo → muestra; tiendas-only → oculta). El sub-nav es la
 *     barra de Categorías + filtros rápidos (sin repetir links del nav).
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
                <MarketplaceNavbar />
              </Suspense>
              {/* Sub-nav unificado — Categorías + filtros rápidos. Aparece solo
                  cuando el superadmin tiene "Marketplace completo" (o "Mínimo");
                  en "Solo Tiendas" se auto-oculta. Mismo componente que el resto
                  del marketplace → 100% consistente. */}
              <Suspense fallback={null}>
                <ConditionalSecondaryNav />
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
                <Footer />
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
