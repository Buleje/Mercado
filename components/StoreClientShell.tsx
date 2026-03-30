"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const CheckoutModal = dynamic(() => import("@/components/CheckoutModal"), { ssr: false });
const CompareBar = dynamic(() => import("@/components/CompareBar"), { ssr: false });
const NotificationPrompt = dynamic(() => import("@/components/NotificationPrompt"), { ssr: false });
const OrderStatusModalWrapper = dynamic(() => import("@/components/OrderStatusModalWrapper"), { ssr: false });
const OrderConfirmModal = dynamic(() => import("@/components/OrderConfirmModal"), { ssr: false });
const LiveChatWidget = dynamic(() => import("@/components/LiveChatWidget"), { ssr: false });
const WebVitalsReporter = dynamic(() => import("@/components/WebVitalsReporter"), { ssr: false });
const FirstVisitCouponModal = dynamic(() => import("@/components/store/FirstVisitCouponModal"), { ssr: false });

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
export default function StoreClientShell() {
  const ready = useDeferredMount(2500);

  if (!ready) return null;

  return (
    <>
      <CheckoutModal />
      <OrderConfirmModal />
      <OrderStatusModalWrapper />
      <CompareBar />
      <NotificationPrompt />
      <LiveChatWidget />
      <WebVitalsReporter />
      <FirstVisitCouponModal />
    </>
  );
}
