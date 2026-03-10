import { Suspense } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import AnnouncementBar from "@/components/AnnouncementBar";
import FreeDeliveryProgress from "@/components/FreeDeliveryProgress";

// Above-the-fold components - keep SSR for LCP
const DailySpecial      = dynamic(() => import("@/components/DailySpecial"));
const CountdownBanner   = dynamic(() => import("@/components/CountdownBanner"));
const SeasonalPromo     = dynamic(() => import("@/components/SeasonalPromo"));
const StatsCounter      = dynamic(() => import("@/components/StatsCounter"));
const TrustBar          = dynamic(() => import("@/components/TrustBar"));
const FlashDeals        = dynamic(() => import("@/components/FlashDeals"));
const CategoryBubbles   = dynamic(() => import("@/components/CategoryBubbles"));

// Below-the-fold components - disable SSR for better TBT
const RecipeSuggestions = dynamic(() => import("@/components/RecipeSuggestions"));
const PopularProducts   = dynamic(() => import("@/components/PopularProducts"));
const FeaturedCarousel  = dynamic(() => import("@/components/FeaturedCarousel"));
const CombosSection     = dynamic(() => import("@/components/CombosSection"));
const ProductCatalog    = dynamic(() => import("@/components/ProductCatalog"));
const RecentlyViewed    = dynamic(() => import("@/components/RecentlyViewed"));
const FavoritesSection  = dynamic(() => import("@/components/FavoritesSection"));
const ReferralBanner    = dynamic(() => import("@/components/ReferralBanner"));
const BrandStory        = dynamic(() => import("@/components/BrandStory"));
const SpinWheel         = dynamic(() => import("@/components/SpinWheel"));
const Benefits          = dynamic(() => import("@/components/Benefits"));
const Testimonials      = dynamic(() => import("@/components/Testimonials"));
const StoreStats        = dynamic(() => import("@/components/StoreStats"));
const DeliveryZoneMap   = dynamic(() => import("@/components/DeliveryZoneMap"));
const StoreHours        = dynamic(() => import("@/components/StoreHours"));
const PaymentMethods    = dynamic(() => import("@/components/PaymentMethods"));
const FAQ               = dynamic(() => import("@/components/FAQ"));
const NewsletterWhatsApp= dynamic(() => import("@/components/NewsletterWhatsApp"));
const Contact           = dynamic(() => import("@/components/Contact"));
const Footer            = dynamic(() => import("@/components/Footer"));
const BackInStock       = dynamic(() => import("@/components/BackInStock"));
const VolumeDiscount    = dynamic(() => import("@/components/VolumeDiscount"));
const LastOrderBanner   = dynamic(() => import("@/components/LastOrderBanner"));

// Modals and interactive elements - disable SSR
const CartSidebar       = dynamic(() => import("@/components/CartSidebar"));
const CustomerModal     = dynamic(() => import("@/components/CustomerModal"));
const ReviewModal       = dynamic(() => import("@/components/ReviewModal"));
const AccessibilityBar  = dynamic(() => import("@/components/AccessibilityBar"));
const CookieConsent     = dynamic(() => import("@/components/CookieConsent"));
const SocialProofToast  = dynamic(() => import("@/components/SocialProofToast"));
const MobileBottomNav   = dynamic(() => import("@/components/MobileBottomNav"));
const UserAccountModal  = dynamic(() => import("@/components/UserAccountModal"));
const OrderStatusModalWrapper = dynamic(() => import("@/components/OrderStatusModalWrapper"));

export default function Home() {
  return (
    <>
      <AnnouncementBar />
      <Header />
      <main id="main-content">
        <Hero />
        <FreeDeliveryProgress />
        <LastOrderBanner />
        <DailySpecial />
        <SeasonalPromo />
        <StatsCounter />
        <TrustBar />
        <CountdownBanner />
        <FlashDeals />
        <CategoryBubbles />
        <PopularProducts />
        <FeaturedCarousel />
        <CombosSection />
        <Suspense fallback={<ProductCatalogSkeleton />}>
          <ProductCatalog />
        </Suspense>
        <RecentlyViewed />
        <FavoritesSection />
        <RecipeSuggestions />
        <ReferralBanner />
        <Benefits />
        <BrandStory />
        <Testimonials />
        <StoreStats />
        <DeliveryZoneMap />
        <PaymentMethods />
        <FAQ />
        <NewsletterWhatsApp />
        <StoreHours />
        <Contact />
      </main>
      <Footer />
      <CartSidebar />
      <CustomerModal />
      <ReviewModal />
      <CookieConsent />
      <SocialProofToast />
      <VolumeDiscount />
      <AccessibilityBar />
      <BackInStock />
      <SpinWheel />
      <UserAccountModal />
      <OrderStatusModalWrapper />
      <MobileBottomNav />
    </>
  );
}

function ProductCatalogSkeleton() {
  return (
    <section className="py-20 sm:py-28 bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="h-10 w-64 bg-gray-200 rounded-lg mx-auto animate-pulse" />
          <div className="h-5 w-96 max-w-full bg-gray-100 rounded-lg mx-auto mt-4 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="aspect-square bg-gray-100 animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                <div className="h-5 bg-gray-200 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
