"use client";

/**
 * StoreProviders
 * Wraps all 9 store-level context providers in a single composable component,
 * eliminating the 9-level nest in (store)/layout.tsx and improving readability.
 */
import { CartProvider } from "@/contexts/cart-context";
import { CustomerProvider } from "@/contexts/customer-context";
import { ToastProvider } from "@/contexts/toast-context";
import { ReviewsProvider } from "@/contexts/reviews-context";
import { SettingsProvider } from "@/contexts/settings-context";
import { PromotionsProvider } from "@/contexts/promotions-context";
import { FavoritesProvider } from "@/contexts/favorites-context";
import { CompareProvider } from "@/contexts/compare-context";
import { TenantSlugProvider } from "@/contexts/tenant-context";
import { WishlistProvider } from "@/contexts/wishlist-context";
import { SocioBulejeProvider } from "@/contexts/socio-buleje-context";
import { SubscriptionProvider } from "@/contexts/subscription-context";
import { LastOrderProvider } from "@/contexts/last-order-context";
import ThemeInjector from "@/components/store/ThemeInjector";

export default function StoreProviders({
  children,
  tenantSlug = "main",
}: {
  children: React.ReactNode;
  tenantSlug?: string;
}) {
  return (
    <TenantSlugProvider slug={tenantSlug}>
      <ToastProvider>
        <ReviewsProvider>
          <SettingsProvider>
            <ThemeInjector />
            <PromotionsProvider>
              <CartProvider tenantSlug={tenantSlug}>
                <FavoritesProvider>
                  <WishlistProvider>
                    <CompareProvider>
                      <SocioBulejeProvider>
                        <SubscriptionProvider>
                          <CustomerProvider>
                            {/* LastOrderProvider — tracking de "tu último
                                pedido" (badge en nav + OrderSuccessModal).
                                Añadido al superset 2026-06-07 al unificar
                                marketplace/tiendas bajo el (store) layout:
                                MarketplaceStoresView y OrderTrackerNavBadge lo
                                consumen y sin él quedaban en NOOP silencioso. */}
                            <LastOrderProvider>{children}</LastOrderProvider>
                          </CustomerProvider>
                        </SubscriptionProvider>
                      </SocioBulejeProvider>
                    </CompareProvider>
                  </WishlistProvider>
                </FavoritesProvider>
              </CartProvider>
            </PromotionsProvider>
          </SettingsProvider>
        </ReviewsProvider>
      </ToastProvider>
    </TenantSlugProvider>
  );
}
