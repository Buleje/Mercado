import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import { AnnouncementBar, StatsCounter, Benefits, CTABanner, RecommendedProducts } from "@/components/ClientSections";
import type { SectionKey } from "@/components/admin/StorefrontEditor";

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
const CombosSection      = dynamic(() => import("@/components/CombosSection"));
const RecipeSuggestions  = dynamic(() => import("@/components/RecipeSuggestions"));
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

// ── Leer visibleSections desde settings (server-side, con revalidación) ───────
async function getVisibleSections(): Promise<Set<SectionKey>> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/settings`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return new Set<SectionKey>(); // vacío = mostrar todo (backward compatible)
    const data = await res.json();
    const keys: SectionKey[] = Array.isArray(data?.homepage?.visibleSections)
      ? data.homepage.visibleSections
      : [];
    return new Set(keys);
  } catch {
    return new Set<SectionKey>(); // vacío = mostrar todo
  }
}

export default async function Home() {
  const visible = await getVisibleSections();
  // Si no hay configuración guardada → mostrar todo (backward compatible)
  const showAll = visible.size === 0;
  const show = (key: SectionKey) => showAll || visible.has(key);

  return (
    <>
      {show("announcement") && <AnnouncementBar />}
      <Header />
      <main id="main-content">
        {/* Hero — strong first impression with CTA to /tienda */}
        {show("hero") && <Hero />}

        {/* Social proof stats — siempre visible, no es una sección configurable */}
        <Suspense fallback={<LoadingStats />}>
          <StatsCounter />
        </Suspense>

        {/* Categorías */}
        {show("categories") && (
          <Suspense fallback={<LoadingSection />}>
            <PopularCategories />
          </Suspense>
        )}

        {/* Productos populares */}
        {show("popular") && (
          <Suspense fallback={<LoadingProducts />}>
            <ProductsPreview />
          </Suspense>
        )}

        {/* Ofertas del día */}
        {show("deals") && (
          <Suspense fallback={null}>
            <DailyDeal />
          </Suspense>
        )}

        {/* Recomendados — ligado a "popular" */}
        {show("popular") && <RecommendedProducts />}

        {/* Combos */}
        {show("combos") && (
          <Suspense fallback={<LoadingSection />}>
            <CombosSection />
          </Suspense>
        )}

        {/* Recetas */}
        {show("recipes") && (
          <Suspense fallback={<LoadingSection />}>
            <RecipeSuggestions />
          </Suspense>
        )}

        {/* How it works — 3-step process — siempre visible */}
        <Suspense fallback={<LoadingSection />}>
          <HowItWorks />
        </Suspense>

        {/* Value proposition — siempre visible */}
        <Suspense fallback={<LoadingSection />}>
          <Benefits />
        </Suspense>

        {/* Conversion CTA — siempre visible */}
        <Suspense fallback={<LoadingSection />}>
          <CTABanner />
        </Suspense>

        {/* Testimonios */}
        {show("testimonials") && (
          <Suspense fallback={<LoadingTestimonials />}>
            <Testimonials />
          </Suspense>
        )}
        <Suspense fallback={<LoadingSection />}>
          <BrandStory />
        </Suspense>

        {/* Horarios de atención */}
        <Suspense fallback={<LoadingSection />}>
          <StoreHours />
        </Suspense>

        {/* FAQ */}
        {show("faq") && (
          <Suspense fallback={<LoadingFAQ />}>
            <FAQ />
          </Suspense>
        )}

        {/* Contacto */}
        {show("contact") && (
          <Suspense fallback={<LoadingSection />}>
            <Contact />
          </Suspense>
        )}

        {/* Mapa de delivery */}
        {show("delivery_map") && (
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
        )}

        {/* PWA install banner */}
        <Suspense fallback={null}>
          <PWAInstallBanner />
        </Suspense>

        {/* Invitar amigos */}
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
