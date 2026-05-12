"use client";

/**
 * MarketplaceStoreProviders — versión ligera de StoreProviders para el
 * marketplace (ruta /marketplace/*).
 *
 * Skippea providers que el marketplace NO usa:
 *   - ReviewsProvider    → solo usado en tienda single-tenant
 *   - PromotionsProvider → solo usado en tienda single-tenant
 *
 * Resultado: ~2 providers menos en el árbol + el JS de esos contexts no
 * se descarga en el bundle inicial del marketplace. Cross-check:
 *   grep "useReviews|usePromotions" app/marketplace components/marketplace
 *   → 0 hits (auditado 2026-04-19).
 *
 * Si en el futuro el marketplace necesita esos providers, cambia este import
 * en app/marketplace/layout.tsx por StoreProviders (el original).
 */

import { Suspense } from "react";
import { CartProvider } from "@/contexts/cart-context";
import { CustomerProvider } from "@/contexts/customer-context";
import { ToastProvider } from "@/contexts/toast-context";
import { SettingsProvider } from "@/contexts/settings-context";
import { FavoritesProvider } from "@/contexts/favorites-context";
import { CompareProvider } from "@/contexts/compare-context";
import { TenantSlugProvider } from "@/contexts/tenant-context";
import { WishlistProvider } from "@/contexts/wishlist-context";
import { SocioBulejeProvider } from "@/contexts/socio-buleje-context";
import { SubscriptionProvider } from "@/contexts/subscription-context";
import { LastOrderProvider } from "@/contexts/last-order-context";
import ThemeInjector from "@/components/store/ThemeInjector";
import OrderSuccessModal from "@/components/marketplace/order-success/OrderSuccessModal";

export default function MarketplaceStoreProviders({
  children,
  tenantSlug = "main",
}: {
  children: React.ReactNode;
  tenantSlug?: string;
}) {
  return (
    <TenantSlugProvider slug={tenantSlug}>
      <ToastProvider>
        <SettingsProvider>
          {/* ThemeInjector usa usePathname() que dispara connection() en SSR.
              Next 16 Cache Components exige que cualquier acceso a uncached
              data esté dentro de <Suspense>, o reporta "blocking-route" y
              retrasa el render completo. Wrap surgical → desbloquea el shell. */}
          <Suspense fallback={null}>
            <ThemeInjector />
          </Suspense>
          <CartProvider tenantSlug={tenantSlug}>
            <FavoritesProvider>
              <WishlistProvider>
                <CompareProvider>
                  <SocioBulejeProvider>
                    <SubscriptionProvider>
                      <CustomerProvider>
                        <LastOrderProvider>
                          {children}
                          {/* Modal global de éxito post-pedido. Se monta una
                              sola vez aquí (raíz del marketplace + tiendas +
                              checkout) para que sobreviva a navegaciones. */}
                          <OrderSuccessModal />
                        </LastOrderProvider>
                      </CustomerProvider>
                    </SubscriptionProvider>
                  </SocioBulejeProvider>
                </CompareProvider>
              </WishlistProvider>
            </FavoritesProvider>
          </CartProvider>
        </SettingsProvider>
      </ToastProvider>
    </TenantSlugProvider>
  );
}
