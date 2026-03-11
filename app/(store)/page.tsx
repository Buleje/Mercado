import { Suspense } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import AnnouncementBar from "@/components/AnnouncementBar";
import {
  StatsSkeleton,
  SectionSkeleton,
  CardSkeleton,
  TestimonialSkeleton,
  FAQSkeleton,
} from "@/components/LoadingSkeleton";

// Landing page sections — optimized conversion flow
const StatsCounter       = dynamic(() => import("@/components/StatsCounter"), { ssr: true });
const ProductsPreview    = dynamic(() => import("@/components/ProductsPreview"), { ssr: true });
const HowItWorks         = dynamic(() => import("@/components/HowItWorks"), { ssr: true });
const Benefits           = dynamic(() => import("@/components/Benefits"), { ssr: true });
const CTABanner          = dynamic(() => import("@/components/CTABanner"), { ssr: true });
const Testimonials       = dynamic(() => import("@/components/Testimonials"), { ssr: true });
const BrandStory         = dynamic(() => import("@/components/BrandStory"), { ssr: true });
const FAQ                = dynamic(() => import("@/components/FAQ"), { ssr: true });
const Contact            = dynamic(() => import("@/components/Contact"), { ssr: true });
const Footer             = dynamic(() => import("@/components/Footer"), { ssr: true });

// Essential modals & utilities (client-only, no SSR needed)
const CartSidebar       = dynamic(() => import("@/components/CartSidebar"));
const CustomerModal     = dynamic(() => import("@/components/CustomerModal"));
const AccessibilityBar  = dynamic(() => import("@/components/AccessibilityBar"));
const CookieConsent     = dynamic(() => import("@/components/CookieConsent"));
const MobileBottomNav   = dynamic(() => import("@/components/MobileBottomNav"));
const UserAccountModal  = dynamic(() => import("@/components/UserAccountModal"));
const ExitIntentModal   = dynamic(() => import("@/components/ExitIntentModal"));

export default function Home() {
  return (
    <>
      <AnnouncementBar />
      <Header />
      <main id="main-content">
        {/* Hero — strong first impression with CTA to /tienda */}
        <Hero />

        {/* Social proof stats */}
        <Suspense fallback={<LoadingStats />}>
          <StatsCounter />
        </Suspense>

        {/* Product preview — showcase + CTA to full catalog */}
        <Suspense fallback={<LoadingProducts />}>
          <ProductsPreview />
        </Suspense>

        {/* How it works — 3-step process */}
        <Suspense fallback={<LoadingSection />}>
          <HowItWorks />
        </Suspense>

        {/* Value proposition */}
        <Suspense fallback={<LoadingSection />}>
          <Benefits />
        </Suspense>

        {/* Conversion CTA — urgency + link to /tienda */}
        <Suspense fallback={<LoadingSection />}>
          <CTABanner />
        </Suspense>

        {/* Social proof & brand */}
        <Suspense fallback={<LoadingTestimonials />}>
          <Testimonials />
        </Suspense>
        <Suspense fallback={<LoadingSection />}>
          <BrandStory />
        </Suspense>

        {/* Support */}
        <Suspense fallback={<LoadingFAQ />}>
          <FAQ />
        </Suspense>
        <Suspense fallback={<LoadingSection />}>
          <Contact />
        </Suspense>
      </main>
      <Footer />
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

/* ── Loading States ── */
function LoadingStats() {
  return (
    <section className="py-12 sm:py-16 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <StatsSkeleton />
      </div>
    </section>
  );
}

function LoadingProducts() {
  return (
    <section className="py-20 sm:py-28 bg-white dark:bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionSkeleton />
      </div>
    </section>
  );
}

function LoadingSection() {
  return (
    <section className="py-16 sm:py-20 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </section>
  );
}

function LoadingTestimonials() {
  return (
    <section className="py-20 sm:py-28 bg-white dark:bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-6">
          <TestimonialSkeleton />
          <TestimonialSkeleton />
          <TestimonialSkeleton />
        </div>
      </div>
    </section>
  );
}

function LoadingFAQ() {
  return (
    <section className="py-20 sm:py-28 bg-surface">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <FAQSkeleton />
      </div>
    </section>
  );
}
