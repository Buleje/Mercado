"use client";

import dynamic from "next/dynamic";

const CartSidebar       = dynamic(() => import("@/components/CartSidebar"),       {});
const CustomerModal     = dynamic(() => import("@/components/CustomerModal"),     {});
const AccessibilityBar  = dynamic(() => import("@/components/AccessibilityBar"),  {});
const CookieConsent     = dynamic(() => import("@/components/CookieConsent"),     {});
const MobileBottomNav   = dynamic(() => import("@/components/MobileBottomNav"),   {});
const UserAccountModal  = dynamic(() => import("@/components/UserAccountModal"),  {});
const ExitIntentModal   = dynamic(() => import("@/components/ExitIntentModal"),   {});
const FloatingStoreCTA  = dynamic(() => import("@/components/FloatingStoreCTA"),  {});
// #24 Auto-reorder banner — solo si hay cliente autenticado
const LastOrderBanner   = dynamic(() => import("@/components/LastOrderBanner"),   {});
// #31 Abandoned cart recovery toast
const CartRecoveryToast = dynamic(() => import("@/components/CartRecoveryToast"), {});

/**
 * Client-only shell for the homepage — modals and overlays that need `ssr: false`.
 */
export default function HomeClientShell() {
  return (
    <>
      <FloatingStoreCTA />
      <CartSidebar />
      <CustomerModal />
      <CookieConsent />
      <AccessibilityBar />
      <UserAccountModal />
      <MobileBottomNav />
      <ExitIntentModal />
      {/* #24 Auto-reorder: banner fijo bajo el hero si hay cliente */}
      <LastOrderBanner />
      {/* #31 Cart recovery toast: aparece si hay carrito abandonado > 30min */}
      <CartRecoveryToast />
    </>
  );
}
