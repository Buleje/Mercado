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
import ThemeInjector from "@/components/store/ThemeInjector";

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
          <ThemeInjector />
          <CartProvider tenantSlug={tenantSlug}>
            <FavoritesProvider>
              <WishlistProvider>
                <CompareProvider>
                  <SocioBulejeProvider>
                    <SubscriptionProvider>
                      <CustomerProvider>{children}</CustomerProvider>
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
