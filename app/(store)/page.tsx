import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import { AnnouncementBar, StatsCounter, Benefits, CTABanner, RecommendedProducts } from "@/components/ClientSections";
import type { SectionKey } from "@/components/admin/StorefrontEditor";
import { zones } from "@/data/zones";
import { categories } from "@/data/products";

export const metadata: Metadata = {
  title: "Buleje — Software ERP para Bodegas del Peru | Inventario, POS, Delivery",
  description:
    "Buleje: el sistema completo para tu bodega. Inventario, punto de venta POS, delivery, fiado digital y facturacion SUNAT. Funciona con Yape y efectivo. Disponible en todo el Peru.",
  alternates: {
    canonical: "https://www.buleje.pe",
  },
  openGraph: {
    title: "Buleje — Software para Bodegas del Peru",
    description:
      "Sistema ERP completo: inventario, POS, delivery, fiado digital y SUNAT. Empieza gratis.",
    url: "https://www.buleje.pe",
    type: "website",
    locale: "es_PE",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Buleje — Software ERP para Bodegas y Tiendas del Peru",
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
const PopularCategories  = dynamic(() => import("@/components/PopularCategories"),  { loading: () => <SectionSkeleton /> });
const DailyDeal          = dynamic(() => import("@/components/DailyDeal"),          { loading: () => <CardSkeleton /> });
const CombosSection      = dynamic(() => import("@/components/CombosSection"),      { loading: () => <SectionSkeleton /> });
const RecipeSuggestions  = dynamic(() => import("@/components/RecipeSuggestions"),  { loading: () => <SectionSkeleton /> });
const HowItWorks         = dynamic(() => import("@/components/HowItWorks"),         { ssr: true });
const Testimonials       = dynamic(() => import("@/components/Testimonials"),       { ssr: true });
const BrandStory         = dynamic(() => import("@/components/BrandStory"),         { ssr: true });
const StoreHours         = dynamic(() => import("@/components/StoreHours"),         { ssr: true });
const FAQ                = dynamic(() => import("@/components/FAQ"),                { ssr: true });
const ReferralBanner     = dynamic(() => import("@/components/ReferralBanner"),     { loading: () => <CardSkeleton /> });
const PWAInstallBanner   = dynamic(() => import("@/components/PWAInstallBanner"));
const DeliveryZoneMap    = dynamic(() => import("@/components/DeliveryZoneMap"),    { loading: () => <CardSkeleton /> });
const Contact            = dynamic(() => import("@/components/Contact"),            { ssr: true });
const Footer             = dynamic(() => import("@/components/Footer"),             { ssr: true });

import HomeClientShell from "@/components/HomeClientShell";

// ── Mapa de secciones: key → componente con su fallback ─────────────────────

const SECTION_MAP: Record<SectionKey, () => ReactNode> = {
  announcement: () => <AnnouncementBar />,
  hero: () => <Hero />,
  categories: () => (
    <Suspense fallback={null}>
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
    <Suspense fallback={null}>
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
      <section className="py-16 sm:py-24 bg-white dark:bg-card relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70vw] h-[30vw] bg-primary/3 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
              🚚 Cobertura
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
              ¿Llegamos a tu{" "}
              <span className="text-primary relative">
                zona
                <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                  <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
                </svg>
              </span>
              ?
            </h2>
            <p className="text-muted mt-4 text-sm sm:text-base max-w-lg mx-auto">
              Revisa nuestra zona de delivery y alrededores
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden border border-gray-100 dark:border-card-border shadow-lg">
            <DeliveryZoneMap />
          </div>
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
      {/* Spacer for fixed header (announcement h-11 + header h-16/h-20) */}
      <div className="h-[6.75rem] sm:h-[7.75rem]" />
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

      {/* SEO: Zone internal links for crawl discovery + local ranking */}
      <nav className="bg-slate-50 dark:bg-slate-900/50 py-6 border-t border-slate-200 dark:border-slate-800" aria-label="Buleje en Peru">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Buleje esta en todo el Peru
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {zones.map((zone) => (
              <Link
                key={zone.slug}
                href={`/zona/${zone.slug}`}
                className="text-sm text-slate-500 hover:text-emerald-600 transition-colors"
              >
                {zone.name}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <Footer />
      <HomeClientShell />
    </>
  );
}

/* ── Loading States — consistent skeleton design ── */
function LoadingStats() {
  return (
    <section className="py-16 sm:py-24 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-3 animate-pulse" />
          <div className="h-10 w-56 bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto mb-3 animate-pulse" />
        </div>
        <StatsSkeleton />
      </div>
    </section>
  );
}

function LoadingProducts() {
  return (
    <section className="py-20 sm:py-28 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="h-5 w-28 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-3 animate-pulse" />
          <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto mb-3 animate-pulse" />
          <div className="h-4 w-80 bg-gray-100 dark:bg-gray-800 rounded-lg mx-auto animate-pulse" />
        </div>
        <SectionSkeleton />
      </div>
    </section>
  );
}

function LoadingSection() {
  return (
    <section className="py-16 sm:py-20 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <div className="h-5 w-28 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-3 animate-pulse" />
          <div className="h-9 w-52 bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto animate-pulse" />
        </div>
        <div className="space-y-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </section>
  );
}

function LoadingTestimonials() {
  return (
    <section className="py-20 sm:py-28 bg-primary/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="h-5 w-36 bg-primary/10 rounded-full mx-auto mb-3 animate-pulse" />
          <div className="h-10 w-72 bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto animate-pulse" />
        </div>
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
        <div className="text-center mb-10">
          <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-3 animate-pulse" />
          <div className="h-9 w-64 bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto animate-pulse" />
        </div>
        <FAQSkeleton />
      </div>
    </section>
  );
}
