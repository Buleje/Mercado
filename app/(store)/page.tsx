import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
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

// ── Mapa de secciones: key → componente con su fallback ─────────────────────

const SECTION_MAP: Record<SectionKey, () => ReactNode> = {
  announcement: () => <AnnouncementBar />,
  hero: () => <Hero />,
  categories: () => (
    <Suspense fallback={<LoadingSection />}>
      <PopularCategories />
    </Suspense>
  ),
  popular: () => (
    <>
      <Suspense fallback={<LoadingProducts />}>
        <ProductsPreview />
      </Suspense>
      <RecommendedProducts />
    </>
  ),
  deals: () => (
    <Suspense fallback={null}>
      <DailyDeal />
    </Suspense>
  ),
  combos: () => (
    <Suspense fallback={<LoadingSection />}>
      <CombosSection />
    </Suspense>
  ),
  recipes: () => (
    <Suspense fallback={<LoadingSection />}>
      <RecipeSuggestions />
    </Suspense>
  ),
  testimonials: () => (
    <Suspense fallback={<LoadingTestimonials />}>
      <Testimonials />
    </Suspense>
  ),
  faq: () => (
    <Suspense fallback={<LoadingFAQ />}>
      <FAQ />
    </Suspense>
  ),
  contact: () => (
    <Suspense fallback={<LoadingSection />}>
      <Contact />
    </Suspense>
  ),
  delivery_map: () => (
    <Suspense fallback={<LoadingSection />}>
      <section className="py-14 sm:py-20 bg-white dark:bg-card">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
              Cobertura
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground">
              Llegamos a tu zona?
            </h2>
            <p className="text-muted mt-2 text-sm sm:text-base max-w-lg mx-auto">
              Revisa nuestra zona de delivery en Pucallpa
            </p>
          </div>
          <DeliveryZoneMap />
        </div>
      </section>
    </Suspense>
  ),
};

// Orden por defecto si no hay config guardada
const DEFAULT_ORDER: SectionKey[] = [
  "announcement", "hero", "categories", "popular", "deals",
  "combos", "recipes", "testimonials", "faq", "contact", "delivery_map",
];

// ── Leer secciones visibles y orden desde settings (server-side, DB directo) ─
async function getSectionConfig(): Promise<{
  visible: Set<SectionKey>;
  order: SectionKey[];
}> {
  try {
    const { headers } = await import("next/headers");
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id") ?? "main";
    const { SettingsDB } = await import("@/lib/db/settings.db");
    const data = await SettingsDB.get(tenantId);

    // Leer secciones visibles
    let visibleKeys: SectionKey[] = [];
    const storeTheme = data?.storeTheme as Record<string, unknown> | undefined;
    if (storeTheme?.sections && Array.isArray(storeTheme.sections)) {
      visibleKeys = (storeTheme.sections as Array<string | { id: string }>).map((s) =>
        typeof s === "string" ? s : s.id
      ) as SectionKey[];
    }

    // Leer orden
    const orderKeys: SectionKey[] =
      Array.isArray(storeTheme?.sectionOrder)
        ? (storeTheme.sectionOrder as SectionKey[])
        : [];

    return {
      visible: new Set(visibleKeys),
      order: orderKeys.length > 0 ? orderKeys : DEFAULT_ORDER,
    };
  } catch {
    return { visible: new Set(), order: DEFAULT_ORDER };
  }
}

export default async function Home() {
  const { visible, order } = await getSectionConfig();
  const showAll = visible.size === 0;
  const show = (key: SectionKey) => showAll || visible.has(key);

  // Renderizar secciones EN EL ORDEN configurado por el admin
  const orderedSections = order.filter(show);

  return (
    <>
      <Header />
      <main id="main-content">
        {/* Secciones dinámicas — en el orden del StorefrontEditor */}
        {orderedSections.map((key) => {
          const render = SECTION_MAP[key];
          if (!render) return null;
          return <div key={key}>{render()}</div>;
        })}

        {/* Secciones siempre visibles (no configurables) */}
        <Suspense fallback={<LoadingStats />}>
          <StatsCounter />
        </Suspense>

        <Suspense fallback={<LoadingSection />}>
          <HowItWorks />
        </Suspense>

        <Suspense fallback={<LoadingSection />}>
          <Benefits />
        </Suspense>

        <Suspense fallback={<LoadingSection />}>
          <CTABanner />
        </Suspense>

        <Suspense fallback={<LoadingSection />}>
          <BrandStory />
        </Suspense>

        <Suspense fallback={<LoadingSection />}>
          <StoreHours />
        </Suspense>

        <Suspense fallback={null}>
          <PWAInstallBanner />
        </Suspense>

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
