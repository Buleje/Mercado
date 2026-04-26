"use client";

import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import LazyLoad from "@/components/LazyLoad";
import { SectionSkeleton } from "@/components/LoadingSkeleton";

const RecentlyViewed    = dynamic(() => import("@/components/RecentlyViewedSingleTenant"),    {});
const FavoritesSection  = dynamic(() => import("@/components/FavoritesSection"),  {});
const RecipeSuggestions = dynamic(() => import("@/components/RecipeSuggestions"), {});


// Modals/overlays — deferred until after main-thread idle
const CartSidebar       = dynamic(() => import("@/components/CartSidebar"),       {});
const CustomerModal     = dynamic(() => import("@/components/CustomerModal"),     {});
const ReviewModal       = dynamic(() => import("@/components/ReviewModal"),       {});
const CookieConsent     = dynamic(() => import("@/components/CookieConsent"),     {});
// SocialProofToast removed — fake notifications disabled
const SpinWheel         = dynamic(() => import("@/components/SpinWheel"),         {});
const MobileBottomNav   = dynamic(() => import("@/components/MobileBottomNav"),   {});
const UserAccountModal  = dynamic(() => import("@/components/UserAccountModal"),  {});
const StickyCartBar     = dynamic(() => import("@/components/StickyCartBar"),     {});
const VolumeDiscount    = dynamic(() => import("@/components/VolumeDiscount"),    {});
const BackInStock       = dynamic(() => import("@/components/BackInStock"),       {});

function SectionLoadingSkeleton() {
  return (
    <section className="py-12 sm:py-16 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionSkeleton />
      </div>
    </section>
  );
}

/** Defer modal mounting until the browser is idle + 2s after hydration */
function useDeferredMount(delay = 2000) {
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
 * Client-only shell for /tienda — below-fold sections + modals/overlays.
 * Modals are deferred until after hydration + idle to reduce TBT.
 */
export default function TiendaClientShell({
  showRecipes = true,
  showFavorites = true,
  showRecentlyViewed = true,
}: {
  showRecipes?: boolean;
  showFavorites?: boolean;
  showRecentlyViewed?: boolean;
}) {
  const modalsReady = useDeferredMount(2000);

  return (
    <>
      {/* Below-fold: deferred until scrolled near */}
      {showRecentlyViewed && (
        <LazyLoad fallback={null}>
          <Suspense fallback={null}>
            <RecentlyViewed />
          </Suspense>
        </LazyLoad>
      )}
      {showFavorites && (
        <LazyLoad fallback={null}>
          <Suspense fallback={null}>
            <FavoritesSection />
          </Suspense>
        </LazyLoad>
      )}
      {showRecipes && (
        <LazyLoad fallback={null}>
          <Suspense fallback={null}>
            <RecipeSuggestions />
          </Suspense>
        </LazyLoad>
      )}


      {/* Modals & overlays — deferred until idle to reduce initial TBT */}
      {modalsReady && (
        <>
          <CartSidebar />
          <CustomerModal />
          <ReviewModal />
          <CookieConsent />
          <VolumeDiscount />
          <BackInStock />
          <SpinWheel />
          <StickyCartBar />
          <UserAccountModal />
          <MobileBottomNav />
        </>
      )}
    </>
  );
}
