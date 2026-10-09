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
  // ADR-460 · con el marco de una página propia, la paleta y la fuente las
  // pone la página: sin el tema del editor (no baja la fuente de Google ni
  // pinta el color de marca encima).
  temaDelEditor = true,
  // ADR-460 · la portada de una página propia ya trae el carrito de su bolsa;
  // el checkout que monta ahí usa ESE (nunca un segundo CartProvider: el
  // carrito ya se sincroniza entre pestañas por BroadcastChannel).
  sinCarrito = false,
}: {
  children: React.ReactNode;
  tenantSlug?: string;
  initialCustomer?: Customer | null;
  temaDelEditor?: boolean;
  sinCarrito?: boolean;
}) {
  return (
    <TenantSlugProvider slug={tenantSlug}>
      <ToastProvider>
        <ReviewsProvider>
          <SettingsProvider>
            {temaDelEditor && <ThemeInjector />}
            <PromotionsProvider>
              <ConCarrito activo={!sinCarrito} tenantSlug={tenantSlug}>
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
              </ConCarrito>
            </PromotionsProvider>
          </SettingsProvider>
        </ReviewsProvider>
      </ToastProvider>
    </TenantSlugProvider>
  );
}

/** El `CartProvider` de la tienda, salvo que el carrito ya venga de afuera (`sinCarrito`). */
function ConCarrito({ activo, tenantSlug, children }: { activo: boolean; tenantSlug: string; children: React.ReactNode }) {
  if (!activo) return <>{children}</>;
  return <CartProvider tenantSlug={tenantSlug}>{children}</CartProvider>;
}
