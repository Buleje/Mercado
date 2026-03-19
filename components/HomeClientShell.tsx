"use client";

import dynamic from "next/dynamic";

const CartSidebar       = dynamic(() => import("@/components/CartSidebar"),       { ssr: false });
const CustomerModal     = dynamic(() => import("@/components/CustomerModal"),     { ssr: false });
const AccessibilityBar  = dynamic(() => import("@/components/AccessibilityBar"),  { ssr: false });
const CookieConsent     = dynamic(() => import("@/components/CookieConsent"),     { ssr: false });
const MobileBottomNav   = dynamic(() => import("@/components/MobileBottomNav"),   { ssr: false });
const UserAccountModal  = dynamic(() => import("@/components/UserAccountModal"),  { ssr: false });
const ExitIntentModal   = dynamic(() => import("@/components/ExitIntentModal"),   { ssr: false });
const FloatingStoreCTA  = dynamic(() => import("@/components/FloatingStoreCTA"),  { ssr: false });

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
    </>
  );
}
