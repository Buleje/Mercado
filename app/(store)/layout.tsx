import nextDynamic from "next/dynamic";
import MotionProvider from "@/components/MotionProvider";
import MaintenancePage from "@/components/MaintenancePage";
import { CartProvider } from "@/contexts/cart-context";
import { CustomerProvider } from "@/contexts/customer-context";
import { ToastProvider } from "@/contexts/toast-context";
import { ReviewsProvider } from "@/contexts/reviews-context";
import { SettingsProvider } from "@/contexts/settings-context";
import { PromotionsProvider } from "@/contexts/promotions-context";
import { FavoritesProvider } from "@/contexts/favorites-context";
import { CompareProvider } from "@/contexts/compare-context";
import { SettingsDB } from "@/lib/jsondb";
import {
  GoogleAnalytics,
  GoogleTagManager,
  GTMNoScript,
  MicrosoftClarity,
} from "@/components/Analytics";

// Utility components - disable SSR for better performance
const CheckoutModal = nextDynamic(() => import("@/components/CheckoutModal"));
const ScrollToTop = nextDynamic(() => import("@/components/ScrollToTop"));
const CompareBar = nextDynamic(() => import("@/components/CompareBar"));
const NotificationPrompt = nextDynamic(() => import("@/components/NotificationPrompt"));
const AbandonedCartRecovery = nextDynamic(() => import("@/components/AbandonedCartRecovery"));
const OrderStatusModalWrapper = nextDynamic(() => import("@/components/OrderStatusModalWrapper"));

export const dynamic = "force-dynamic";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check maintenance mode
  let maintenanceMode = false;
  let maintenanceMessage: string | undefined;
  try {
    const settings = await SettingsDB.get();
    maintenanceMode = !!settings.maintenanceMode;
    maintenanceMessage = settings.maintenanceMessage;
  } catch { /* continue normally */ }
  if (maintenanceMode) return <MaintenancePage message={maintenanceMessage} />;

  return (
    <>
      <GTMNoScript />
      <GoogleAnalytics />
      <GoogleTagManager />
      <MicrosoftClarity />
      <ToastProvider>
        <ReviewsProvider>
          <SettingsProvider>
            <PromotionsProvider>
              <CartProvider>
                <FavoritesProvider>
                <CompareProvider>
                <CustomerProvider>
                  <MotionProvider>
                    {children}
                    <CheckoutModal />
                    <OrderStatusModalWrapper />
                    <CompareBar />
                    <ScrollToTop />
                    <NotificationPrompt />
                    <AbandonedCartRecovery />
                  </MotionProvider>
                </CustomerProvider>
                </CompareProvider>
                </FavoritesProvider>
              </CartProvider>
            </PromotionsProvider>
          </SettingsProvider>
        </ReviewsProvider>
      </ToastProvider>
    </>
  );
}
