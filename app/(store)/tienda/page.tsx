import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import FreeDeliveryProgress from "@/components/FreeDeliveryProgress";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import TiendaClientShell from "@/components/TiendaClientShell";
import { categories, products } from "@/data/products";
import {
  ProductGridSkeleton,
  CategorySectionSkeleton,
  SectionSkeleton,
} from "@/components/LoadingSkeleton";

export const metadata: Metadata = {
  title: "Tienda Online de Abarrotes en Pucallpa — Bodega San Martín",
  description:
    "Explora nuestro catálogo completo de abarrotes, bebidas, carnes, snacks, limpieza y más. Delivery gratis desde S/50 en Pucallpa. Paga con Yape o efectivo.",
  alternates: {
    canonical: "https://www.bodegasanmartin.pe/tienda",
  },
  openGraph: {
    title: "Tienda Online — Bodega San Martín Pucallpa",
    description: "Más de 500 productos con delivery gratis en Pucallpa. Abarrotes, bebidas, carnes, snacks y más. Paga con Yape o efectivo.",
    url: "https://www.bodegasanmartin.pe/tienda",
    type: "website",
    locale: "es_PE",
    siteName: "Bodega San Martín",
    images: [{ url: "https://www.bodegasanmartin.pe/og-image.jpg", width: 1200, height: 630, alt: "Tienda online Bodega San Martín — Abarrotes en Pucallpa" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tienda Online — Bodega San Martín Pucallpa",
    description: "Más de 500 productos con delivery gratis en Pucallpa.",
    images: ["https://www.bodegasanmartin.pe/og-image.jpg"],
  },
};

// ── Above-the-fold (SSR + eager hydration) ──
const CategoryBubbles   = dynamic(() => import("@/components/CategoryBubbles"));
const DailySpecial      = dynamic(() => import("@/components/DailySpecial"));
const CountdownBanner   = dynamic(() => import("@/components/CountdownBanner"));
const FlashDeals        = dynamic(() => import("@/components/FlashDeals"));
const SeasonalPromo     = dynamic(() => import("@/components/SeasonalPromo"));

// ── Main catalog & sections ──
const PopularProducts   = dynamic(() => import("@/components/PopularProducts"));
const FeaturedCarousel  = dynamic(() => import("@/components/FeaturedCarousel"));
const CombosSection     = dynamic(() => import("@/components/CombosSection"));
const ProductCatalog    = dynamic(() => import("@/components/ProductCatalog"));
const LastOrderBanner   = dynamic(() => import("@/components/LastOrderBanner"));
const Footer            = dynamic(() => import("@/components/Footer"));

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
      {/* SEO: ItemList schema for category navigation */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Categorías de productos — Bodega San Martín",
            description: "Catálogo completo de productos con delivery en Pucallpa.",
            numberOfItems: categories.filter((c) => c.id !== "todos").length,
            itemListElement: categories
              .filter((c) => c.id !== "todos")
              .map((cat, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: cat.label,
                url: `https://www.bodegasanmartin.pe/tienda/categoria/${cat.id}`,
              })),
          }),
        }}
      />
      
      <AnnouncementBar />
      <Header />
      {/* O1 — Visible breadcrumbs */}
      <nav aria-label="Breadcrumb" className="bg-gray-50 dark:bg-card border-b border-gray-100 dark:border-card-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-1.5 text-xs text-muted">
          <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
          <span className="text-gray-300">/</span>
          <span className="font-semibold text-foreground">Tienda</span>
        </div>
      </nav>
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
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <SeasonalPromo />
        </Suspense>
        <CountdownBanner />
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <FlashDeals />
        </Suspense>
        <Suspense fallback={<SectionLoadingSkeleton />}>
          <CategoryBubbles />
        </Suspense>
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
          <ProductCatalog initialProducts={products} />
        </Suspense>
        {/* Below-fold sections + modals (client-only shell with ssr:false) */}
        <TiendaClientShell />
      </main>
      <Footer />
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
    <section className="py-12 sm:py-16 bg-surface min-h-70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionSkeleton />
      </div>
    </section>
  );
}

function ProductsLoadingSkeleton() {
  return (
    <section className="py-16 sm:py-20 bg-white dark:bg-card min-h-120">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <CategorySectionSkeleton />
      </div>
    </section>
  );
}

function CatalogLoadingSkeleton() {
  return (
    <section className="py-20 sm:py-28 bg-surface min-h-150">
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
