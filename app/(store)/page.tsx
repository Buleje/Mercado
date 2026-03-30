import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import { AnnouncementBar, StatsCounter, Benefits, CTABanner, RecommendedProducts } from "@/components/ClientSections";

export const metadata: Metadata = {
  title: "Buleje — Abarrotes con Delivery en Pucallpa | Yape y Efectivo",
  description:
    "Compra abarrotes, bebidas, carnes, pollo, golosinas y productos de limpieza online en Pucallpa. Delivery rápido a domicilio. Paga con Yape o efectivo. +500 productos, precios de bodega.",
  alternates: {
    canonical: "https://www.buleje.pe",
  },
  openGraph: {
    title: "Buleje — Abarrotes con Delivery en Pucallpa",
    description:
      "Tu bodega online en Pucallpa. +500 productos frescos con delivery rápido. Paga con Yape o efectivo.",
    url: "https://www.buleje.pe",
    type: "website",
    locale: "es_PE",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Buleje — Tienda de Abarrotes en Pucallpa con delivery a domicilio",
      },
    ],
  },
};
import {
  StatsSkeleton,
  SectionSkeleton,
  CardSkeleton,
  TestimonialSkeleton,
  FAQSkeleton,
} from "@/components/LoadingSkeleton";

// Landing page sections — optimized conversion flow
const ProductsPreview     = dynamic(() => import("@/components/ProductsPreview"),    { ssr: true });
const PopularCategories  = dynamic(() => import("@/components/PopularCategories"));
const DailyDeal          = dynamic(() => import("@/components/DailyDeal"));
const HowItWorks         = dynamic(() => import("@/components/HowItWorks"),         { ssr: true });
const Testimonials       = dynamic(() => import("@/components/Testimonials"),       { ssr: true });
const BrandStory         = dynamic(() => import("@/components/BrandStory"),         { ssr: true });
const StoreHours         = dynamic(() => import("@/components/StoreHours"),         { ssr: true });
const FAQ                = dynamic(() => import("@/components/FAQ"),                { ssr: true });
const ReferralBanner     = dynamic(() => import("@/components/ReferralBanner"));
const PWAInstallBanner   = dynamic(() => import("@/components/PWAInstallBanner"));
const DeliveryZoneMap    = dynamic(() => import("@/components/DeliveryZoneMap"));
const Contact            = dynamic(() => import("@/components/Contact"),            { ssr: true });
const Footer             = dynamic(() => import("@/components/Footer"),             { ssr: true });

import HomeClientShell from "@/components/HomeClientShell";

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

        {/* Mejora 11: Popular categories grid */}
        <Suspense fallback={<LoadingSection />}>
          <PopularCategories />
        </Suspense>

        {/* Product preview — showcase + CTA to full catalog */}
        <Suspense fallback={<LoadingProducts />}>
          <ProductsPreview />
        </Suspense>

        {/* Mejora 13: Daily deal with countdown */}
        <Suspense fallback={null}>
          <DailyDeal />
        </Suspense>

        {/* Personalized recommendations / best-sellers */}
        <RecommendedProducts />

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

        {/* Horarios de atención */}
        <Suspense fallback={<LoadingSection />}>
          <StoreHours />
        </Suspense>

        {/* Support */}
        <Suspense fallback={<LoadingFAQ />}>
          <FAQ />
        </Suspense>
        <Suspense fallback={<LoadingSection />}>
          <Contact />
        </Suspense>

        {/* Zona de delivery — movido desde /tienda */}
        <Suspense fallback={<LoadingSection />}>
          <section className="py-14 sm:py-20 bg-white dark:bg-card">
            <div className="max-w-7xl mx-auto px-4">
              <div className="text-center mb-8">
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">🗺️ Cobertura</span>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground">¿Llegamos a tu zona?</h2>
                <p className="text-muted mt-2 text-sm sm:text-base max-w-lg mx-auto">Revisa nuestra zona de delivery en Pucallpa</p>
              </div>
              <DeliveryZoneMap />
            </div>
          </section>
        </Suspense>

        {/* Mejora 12: PWA install banner */}
        <Suspense fallback={null}>
          <PWAInstallBanner />
        </Suspense>

        {/* Invitar amigos — movido desde /tienda */}
        <Suspense fallback={<LoadingSection />}>
          <ReferralBanner />
        </Suspense>
      </main>
      <Footer />
      <HomeClientShell />
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
