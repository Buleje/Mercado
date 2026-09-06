"use client";

/**
 * StoreProviders
 * Wraps all 9 store-level context providers in a single composable component,
 * eliminating the 9-level nest in (store)/layout.tsx and improving readability.
 */
import { CartProvider } from "@/contexts/cart-context";
import { CustomerProvider, type Customer } from "@/contexts/customer-context";
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
import { CheckoutFlowProvider } from "@/components/checkout/checkout-flow-context";
import ThemeInjector from "@/components/store/ThemeInjector";

export default function StoreProviders({
  children,
  tenantSlug = "main",
  // Audit #9 (SSR-auth): estado de cliente resuelto server-side (cookie) para
  // que el navbar pinte el estado real sin skeleton. Se pasa a CustomerProvider.
  initialCustomer,
}: {
  children: React.ReactNode;
  tenantSlug?: string;
  initialCustomer?: Customer | null;
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
                          <CustomerProvider initialCustomer={initialCustomer}>
                            {/* LastOrderProvider — tracking de "tu último
                                pedido" (badge en nav + OrderSuccessModal).
                                Añadido al superset 2026-06-07 al unificar
                                marketplace/tiendas bajo el (store) layout:
                                MarketplaceStoresView y OrderTrackerNavBadge lo
                                consumen y sin él quedaban en NOOP silencioso. */}
                            <LastOrderProvider>
                              {/* CheckoutFlowProvider — estado del checkout
                                  elevado (Paso 1 refactor modal→páginas). */}
                              <CheckoutFlowProvider>{children}</CheckoutFlowProvider>
                            </LastOrderProvider>
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
