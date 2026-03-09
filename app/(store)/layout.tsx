import dynamic from "next/dynamic";
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

const CheckoutModal = dynamic(() => import("@/components/CheckoutModal"));
const ScrollToTop = dynamic(() => import("@/components/ScrollToTop"));
const WhatsAppButton = dynamic(() => import("@/components/WhatsAppButton"));
const CompareBar = dynamic(() => import("@/components/CompareBar"));
const NotificationPrompt = dynamic(() => import("@/components/NotificationPrompt"));
const AbandonedCartRecovery = dynamic(() => import("@/components/AbandonedCartRecovery"));

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check maintenance mode
  try {
    const settings = await SettingsDB.get();
    if (settings.maintenanceMode) {
      return <MaintenancePage message={settings.maintenanceMessage} />;
    }
  } catch { /* continue normally */ }

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
                    <CompareBar />
                    <ScrollToTop />
                    <WhatsAppButton />
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
