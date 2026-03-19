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

export default function StoreProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ReviewsProvider>
        <SettingsProvider>
          <PromotionsProvider>
            <CartProvider>
              <FavoritesProvider>
                <CompareProvider>
                  <CustomerProvider>{children}</CustomerProvider>
                </CompareProvider>
              </FavoritesProvider>
            </CartProvider>
          </PromotionsProvider>
        </SettingsProvider>
      </ReviewsProvider>
    </ToastProvider>
  );
}
