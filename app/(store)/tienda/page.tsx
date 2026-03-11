import { Suspense } from "react";
import dynamic from "next/dynamic";
import type { Metadata } from "next";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import FreeDeliveryProgress from "@/components/FreeDeliveryProgress";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import {
  ProductGridSkeleton,
  CategorySectionSkeleton,
  SectionSkeleton,
} from "@/components/LoadingSkeleton";

export const metadata: Metadata = {
  title: "Tienda — Todos los productos",
  description:
    "Explora nuestro catálogo completo de abarrotes, bebidas, carnes, snacks, limpieza y más. Delivery rápido en Pucallpa. Paga con Yape o efectivo.",
};

// Above-the-fold
const CategoryBubbles   = dynamic(() => import("@/components/CategoryBubbles"));
const DailySpecial      = dynamic(() => import("@/components/DailySpecial"));
const CountdownBanner   = dynamic(() => import("@/components/CountdownBanner"));
const FlashDeals        = dynamic(() => import("@/components/FlashDeals"));
const SeasonalPromo     = dynamic(() => import("@/components/SeasonalPromo"));

// Main catalog & sections
const PopularProducts   = dynamic(() => import("@/components/PopularProducts"));
const FeaturedCarousel  = dynamic(() => import("@/components/FeaturedCarousel"));
const CombosSection     = dynamic(() => import("@/components/CombosSection"));
const ProductCatalog    = dynamic(() => import("@/components/ProductCatalog"));
const RecentlyViewed    = dynamic(() => import("@/components/RecentlyViewed"));
const FavoritesSection  = dynamic(() => import("@/components/FavoritesSection"));
const RecipeSuggestions = dynamic(() => import("@/components/RecipeSuggestions"));
const ReferralBanner    = dynamic(() => import("@/components/ReferralBanner"));
const LastOrderBanner   = dynamic(() => import("@/components/LastOrderBanner"));
const VolumeDiscount    = dynamic(() => import("@/components/VolumeDiscount"));
const BackInStock       = dynamic(() => import("@/components/BackInStock"));
const Footer            = dynamic(() => import("@/components/Footer"));

// Interactive
const CartSidebar       = dynamic(() => import("@/components/CartSidebar"));
const CustomerModal     = dynamic(() => import("@/components/CustomerModal"));
const ReviewModal       = dynamic(() => import("@/components/ReviewModal"));
const CookieConsent     = dynamic(() => import("@/components/CookieConsent"));
const SocialProofToast  = dynamic(() => import("@/components/SocialProofToast"));
const SpinWheel         = dynamic(() => import("@/components/SpinWheel"));
const MobileBottomNav   = dynamic(() => import("@/components/MobileBottomNav"));
const UserAccountModal  = dynamic(() => import("@/components/UserAccountModal"));
const StickyCartBar     = dynamic(() => import("@/components/StickyCartBar"));

export default function TiendaPage() {
  return (
    <>
      {/* SEO: Breadcrumb navigation */}
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.bodegasanmartin.pe/" },
          { name: "Tienda", url: "https://www.bodegasanmartin.pe/tienda" },
        ]}
      />
      
      <AnnouncementBar />
      <Header />
      <main id="main-content">
        {/* Shop hero banner */}
        <ShopHero />
        <FreeDeliveryProgress />
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <LastOrderBanner />
        </Suspense>
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <DailySpecial />
        </Suspense>
        <SeasonalPromo />
        <CountdownBanner />
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <FlashDeals />
        </Suspense>
        <CategoryBubbles />
        <Suspense fallback={<ProductsLoadingSkeleton />}>
          <PopularProducts />
        </Suspense>
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <FeaturedCarousel />
        </Suspense>
        <Suspense fallback={<ProductsLoadingSkeleton />}>
          <CombosSection />
        </Suspense>
        <Suspense fallback={<CatalogLoadingSkeleton />}>
          <ProductCatalog />
        </Suspense>
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <RecentlyViewed />
        </Suspense>
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <FavoritesSection />
        </Suspense>
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <RecipeSuggestions />
        </Suspense>
        <ReferralBanner />
      </main>
      <Footer />
      <CartSidebar />
      <CustomerModal />
      <ReviewModal />
      <CookieConsent />
      <SocialProofToast />
      <VolumeDiscount />
      <BackInStock />
      <SpinWheel />
      <StickyCartBar />
      <UserAccountModal />
      <MobileBottomNav />
    </>
  );
}

/* ── Compact hero for the shop page ── */
function ShopHero() {
  return (
    <section className="relative bg-linear-to-br from-[#312e81] via-primary-dark to-[#1e1b4b] pt-32 pb-14 sm:pt-36 sm:pb-16 overflow-hidden">
      {/* Decorative glow */}
      <div className="absolute top-0 right-0 w-[40vw] h-[40vw] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[25vw] h-[25vw] bg-secondary/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-300/80 mb-4 bg-blue-400/10 rounded-full px-4 py-1.5 border border-blue-400/15">
          🛒 Catálogo completo
        </span>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight mb-4">
          Todos nuestros{" "}
          <span className="bg-linear-to-r from-emerald-300 via-cyan-300 to-amber-300 bg-clip-text text-transparent">
            productos
          </span>
        </h1>
        <p className="text-white/50 text-base sm:text-lg max-w-xl mx-auto mb-6">
          Abarrotes, carnes, bebidas, limpieza y mucho más. Encuentra todo lo que necesitas para tu hogar.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-full px-3 py-1.5 text-white/70">
            🚚 Delivery gratis +S/50
          </span>
          <span className="inline-flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-full px-3 py-1.5 text-white/70">
            💳 Yape o efectivo
          </span>
          <span className="inline-flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-full px-3 py-1.5 text-white/70">
            ⏱ ~30 min delivery
          </span>
        </div>
      </div>

      {/* Wave */}
      <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
        <svg viewBox="0 0 1440 60" xmlns="http://www.w3.org/2000/svg" className="block w-full" preserveAspectRatio="none">
          <path d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z" fill="var(--color-background)" />
        </svg>
      </div>
    </section>
  );
}

/* ── Loading States ── */
function SectionLoadingSkeleton() {
  return (
    <section className="py-12 sm:py-16 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionSkeleton />
      </div>
    </section>
  );
}

function ProductsLoadingSkeleton() {
  return (
    <section className="py-16 sm:py-20 bg-white dark:bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <CategorySectionSkeleton />
      </div>
    </section>
  );
}

function CatalogLoadingSkeleton() {
  return (
    <section className="py-20 sm:py-28 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Filters skeleton */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="h-12 w-full sm:w-64 bg-gray-200 dark:bg-surface rounded-xl animate-pulse" />
          <div className="h-12 w-full sm:w-48 bg-gray-200 dark:bg-surface rounded-xl animate-pulse" />
        </div>
        {/* Products grid */}
        <ProductGridSkeleton count={12} />
      </div>
    </section>
  );
}
