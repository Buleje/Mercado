"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const CheckoutModal = dynamic(() => import("@/components/CheckoutModal"), {});
const CompareBar = dynamic(() => import("@/components/CompareBar"), {});
const NotificationPrompt = dynamic(() => import("@/components/NotificationPrompt"), {});
const OrderStatusModalWrapper = dynamic(() => import("@/components/OrderStatusModalWrapper"), {});
const OrderConfirmModal = dynamic(() => import("@/components/OrderConfirmModal"), {});
const LiveChatWidget = dynamic(() => import("@/components/LiveChatWidget"), {});
const WebVitalsReporter = dynamic(() => import("@/components/WebVitalsReporter"), {});
const FirstVisitCouponModal = dynamic(() => import("@/components/store/FirstVisitCouponModal"), {});

/** Defer modal mounting until the browser is idle + delay after hydration */
function useDeferredMount(delay = 2500) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mount = () => setMounted(true);
    const timer = setTimeout(() => {
      if ("requestIdleCallback" in window) {
        (window as Window).requestIdleCallback(mount, { timeout: 4000 });
      } else {
        mount();
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return mounted;
}

/**
 * Client-only utility shell — wraps modals, widgets, and tools that
 * require `ssr: false`. Deferred until idle to reduce initial TBT.
 */
export default function StoreClientShell({ liveChat = true }: { liveChat?: boolean } = {}) {
  const ready = useDeferredMount(2500);

  if (!ready) return null;

  return (
    <>
      <CheckoutModal />
      <OrderConfirmModal />
      <OrderStatusModalWrapper />
      <CompareBar />
      <NotificationPrompt />
      {/* Brandon 2026-06-12: LiveChatWidget ("chat con el negocio") queda SOLO
          en tiendas white-label tenant. En el MARKETPLACE el FAB flotante se
          quitó (molesto) → ayuda general por "Ayuda" (IA, nav) + chat por tienda
          en el "Mensaje" del storefront. */}
      {liveChat && <LiveChatWidget />}
      <WebVitalsReporter />
      <FirstVisitCouponModal />
    </>
  );
}
