import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import FreeDeliveryProgress from "@/components/FreeDeliveryProgress";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import TiendaClientShell from "@/components/TiendaClientShell";
import { categories } from "@/data/products";
import {
  ProductGridSkeleton,
  CategorySectionSkeleton,
  SectionSkeleton,
} from "@/components/LoadingSkeleton";

export const metadata: Metadata = {
  title: "Tienda Online de Abarrotes en Pucallpa — Buleje",
  description:
    "Explora nuestro catálogo completo de abarrotes, bebidas, carnes, snacks, limpieza y más. Delivery gratis desde S/50 en Pucallpa. Paga con Yape o efectivo.",
  alternates: {
    canonical: "https://www.buleje.pe/tienda",
  },
  openGraph: {
    title: "Tienda Online — Buleje Pucallpa",
    description: "Más de 500 productos con delivery gratis en Pucallpa. Abarrotes, bebidas, carnes, snacks y más. Paga con Yape o efectivo.",
    url: "https://www.buleje.pe/tienda",
    type: "website",
    locale: "es_PE",
    siteName: "Buleje",
    images: [{ url: "https://www.buleje.pe/og-image.jpg", width: 1200, height: 630, alt: "Tienda online Buleje — Abarrotes en Pucallpa" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tienda Online — Buleje Pucallpa",
    description: "Más de 500 productos con delivery gratis en Pucallpa.",
    images: ["https://www.buleje.pe/og-image.jpg"],
  },
};

// ── Above-the-fold (SSR + eager hydration) ──
const DailySpecial      = dynamic(() => import("@/components/DailySpecial"));
const CountdownBanner   = dynamic(() => import("@/components/CountdownBanner"));
const FlashDeals        = dynamic(() => import("@/components/FlashDeals"));
const SeasonalPromo     = dynamic(() => import("@/components/SeasonalPromo"));

// ── Idea 15: Compra Colaborativa ──
const CollaborativeShoppingBanner = dynamic(() => import("@/components/CollaborativeShoppingBanner"));

// ── Main catalog & sections ──
const PopularProducts   = dynamic(() => import("@/components/PopularProducts"));
const FeaturedCarousel  = dynamic(() => import("@/components/FeaturedCarousel"));
const CombosSection     = dynamic(() => import("@/components/CombosSection"));
const ProductCatalog    = dynamic(() => import("@/components/ProductCatalog"));
const Footer            = dynamic(() => import("@/components/Footer"));

export default function TiendaPage() {
  return (
    <>
      {/* SEO: Breadcrumb navigation */}
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Tienda", url: "https://www.buleje.pe/tienda" },
        ]}
      />
      {/* SEO: ItemList schema for category navigation */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Categorías de productos — Buleje",
            description: "Catálogo completo de productos con delivery en Pucallpa.",
            numberOfItems: categories.filter((c) => c.id !== "todos").length,
            itemListElement: categories
              .filter((c) => c.id !== "todos")
              .map((cat, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: cat.label,
                url: `https://www.buleje.pe/tienda/categoria/${cat.id}`,
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
        {/* ── Idea 15: Compra Colaborativa Banner ──────────────────── */}
        <CollaborativeShoppingBanner />

        <FreeDeliveryProgress />
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
          <ProductCatalog initialProducts={[]} />
        </Suspense>
        {/* Below-fold sections + modals (client-only shell with ssr:false) */}
        <TiendaClientShell />
      </main>
      <Footer />
    </>
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
