import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import TiendaClientShell from "@/components/TiendaClientShell";
import type { TiendaSectionKey } from "@/components/admin/StorefrontEditor";
import {
  ProductGridSkeleton,
  SectionSkeleton,
} from "@/components/LoadingSkeleton";
import { zones } from "@/data/zones";
import { categories } from "@/data/products";

export const metadata: Metadata = {
  title: "Catalogo de Productos — Buleje ERP",
  description:
    "Explora el catalogo completo de productos: abarrotes, bebidas, carnes, limpieza y mas. Gestionado con Buleje, el software ERP para bodegas del Peru.",
  alternates: {
    canonical: "https://www.buleje.pe/tienda",
  },
  openGraph: {
    title: "Catalogo de Productos — Buleje",
    description: "Abarrotes, bebidas, carnes, limpieza y mas. Gestionado con Buleje ERP. Delivery con Yape y efectivo.",
    url: "https://www.buleje.pe/tienda",
    type: "website",
    locale: "es_PE",
    siteName: "Buleje",
    images: [{ url: "https://www.buleje.pe/api/og", width: 1200, height: 630, alt: "Buleje — Software ERP para Bodegas del Peru" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Catalogo — Buleje ERP",
    description: "Productos gestionados con Buleje. Software para bodegas del Peru.",
    images: ["https://www.buleje.pe/api/og"],
  },
};

// ── Above-the-fold (SSR + eager hydration) ──
const DailySpecial      = dynamic(() => import("@/components/DailySpecial"));
const CountdownBanner   = dynamic(() => import("@/components/CountdownBanner"));
const FlashDeals        = dynamic(() => import("@/components/FlashDeals"));
const SeasonalPromo     = dynamic(() => import("@/components/SeasonalPromo"));

// ── Main catalog & sections ──
const PopularProducts   = dynamic(() => import("@/components/PopularProducts"));
const FeaturedCarousel  = dynamic(() => import("@/components/FeaturedCarousel"));
const CombosSection     = dynamic(() => import("@/components/CombosSection"));
const LastUnitsSection  = dynamic(() => import("@/components/LastUnitsSection"));
const ProductCatalog    = dynamic(() => import("@/components/ProductCatalog"));
const Footer            = dynamic(() => import("@/components/Footer"));

// ── Tienda section defaults (same order as StorefrontEditor) ────────────────
const TIENDA_DEFAULT_ORDER: TiendaSectionKey[] = [
  "daily_special", "seasonal_promo", "countdown",
  "flash_deals", "popular_products", "featured_carousel", "combos",
  "last_units", "recipes", "favorites", "recently_viewed",
];

// Keys that default to OFF when no config exists
const TIENDA_DEFAULT_DISABLED: Set<TiendaSectionKey> = new Set(["recipes"]);

/**
 * #42: Cached product fetcher — pure DB read without headers/cookies.
 * tenantId is passed as param and becomes part of the cache key.
 * Revalidates every 5 min. Invalidable via updateTag('tienda-products:*').
 */
async function getCachedProducts(tenantId: string) {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag("tienda-products", `tienda-products:${tenantId}`);
  const { ProductsDB } = await import("@/lib/db/products.db");
  const dbProducts = await ProductsDB.getAll(tenantId);
  return dbProducts.filter((p) => p.active !== false);
}

/**
 * #42: Cached section config — pure DB read for storefront layout.
 */
async function getCachedSectionConfig(tenantId: string) {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag("tienda-sections", `tienda-sections:${tenantId}`);
  const { SettingsDB } = await import("@/lib/db/settings.db");
  return SettingsDB.get(tenantId);
}

// ── Read tienda section config from settings (server-side) ──────────────────
async function getTiendaSectionConfig(): Promise<{
  visible: Set<TiendaSectionKey>;
  order: TiendaSectionKey[];
}> {
  try {
    const { headers } = await import("next/headers");
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id") ?? "main";
    const data = await getCachedSectionConfig(tenantId);

    const storeTheme = data?.storeTheme as Record<string, unknown> | undefined;

    // Read visible sections
    const visibleKeys: TiendaSectionKey[] =
      Array.isArray(storeTheme?.tiendaSections)
        ? (storeTheme.tiendaSections as TiendaSectionKey[])
        : [];

    // Read order
    const orderKeys: TiendaSectionKey[] =
      Array.isArray(storeTheme?.tiendaSectionOrder)
        ? (storeTheme.tiendaSectionOrder as TiendaSectionKey[])
        : [];

    // If no config saved yet, use defaults (all ON except recipes)
    if (visibleKeys.length === 0 && orderKeys.length === 0) {
      return {
        visible: new Set(
          TIENDA_DEFAULT_ORDER.filter(k => !TIENDA_DEFAULT_DISABLED.has(k))
        ),
        order: TIENDA_DEFAULT_ORDER,
      };
    }

    return {
      visible: new Set(visibleKeys),
      order: orderKeys.length > 0 ? orderKeys : TIENDA_DEFAULT_ORDER,
    };
  } catch {
    return {
      visible: new Set(
        TIENDA_DEFAULT_ORDER.filter(k => !TIENDA_DEFAULT_DISABLED.has(k))
      ),
      order: TIENDA_DEFAULT_ORDER,
    };
  }
}

export default async function TiendaPage() {
  const { visible, order } = await getTiendaSectionConfig();
  const show = (key: TiendaSectionKey) => visible.has(key);

  // Server-side product prefetch — #42: uses cached function for 5min revalidation
  let initialProducts: Array<Record<string, unknown>> = [];
  try {
    const { headers } = await import("next/headers");
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id") ?? "main";
    initialProducts = await getCachedProducts(tenantId) as unknown as Array<Record<string, unknown>>;
  } catch {
    // Fallback to empty — client will retry via useCachedData
  }

  // Client shell section visibility
  const shellVisibility = {
    showRecipes: show("recipes"),
    showFavorites: show("favorites"),
    showRecentlyViewed: show("recently_viewed"),
  };

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
      {(() => {
        const realCategories = [...new Set(initialProducts.map((p) => p.category as string).filter(Boolean))];
        return realCategories.length > 0 ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "ItemList",
                name: "Categorías de productos — Buleje",
                description: "Catálogo completo de productos — Buleje.",
                numberOfItems: realCategories.length,
                itemListElement: realCategories.map((cat, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  name: cat,
                  url: `https://www.buleje.pe/tienda/categoria/${cat}`,
                })),
              }),
            }}
          />
        ) : null;
      })()}
      
      <AnnouncementBar />
      <Header />
      {/* Spacer to push content below fixed header (h-11 announcement + h-16/h-20 header) */}
      <div className="h-[6.75rem] sm:h-[7.75rem]" />
      <main id="main-content">
        {order.map((key) => {
          if (!show(key)) return null;
          switch (key) {
            case "daily_special":
              return (
                <Suspense key={key} fallback={null}>
                  <DailySpecial />
                </Suspense>
              );
            case "seasonal_promo":
              return (
                <Suspense key={key} fallback={null}>
                  <SeasonalPromo />
                </Suspense>
              );
            case "countdown":
              return <CountdownBanner key={key} />;
            case "flash_deals":
              return (
                <Suspense key={key} fallback={null}>
                  <FlashDeals />
                </Suspense>
              );
            case "popular_products":
              return (
                <Suspense key={key} fallback={null}>
                  <PopularProducts />
                </Suspense>
              );
            case "featured_carousel":
              return (
                <Suspense key={key} fallback={null}>
                  <FeaturedCarousel />
                </Suspense>
              );
            case "combos":
              return (
                <Suspense key={key} fallback={null}>
                  <CombosSection />
                </Suspense>
              );
            case "last_units":
              return (
                <Suspense key={key} fallback={null}>
                  <LastUnitsSection />
                </Suspense>
              );
            // recipes, favorites, recently_viewed → handled by TiendaClientShell
            default:
              return null;
          }
        })}

        {/* Always visible — main product catalog */}
        <Suspense fallback={<CatalogLoadingSkeleton />}>
          <ProductCatalog initialProducts={initialProducts as any} />
        </Suspense>

        {/* Below-fold sections + modals (client-only shell) */}
        <TiendaClientShell {...shellVisibility} />
      </main>

      {/* SEO: Internal links to zone pages for crawl discovery */}
      <section className="bg-slate-50 dark:bg-slate-900/50 py-8 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-4">
            Buleje — Software para bodegas en todo el Peru
          </h2>
          <div className="flex flex-wrap gap-2">
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
      </section>

      <Footer />
    </>
  );
}

/* ── Loading States ── */
function _SectionLoadingSkeleton() {
  return (
    <section className="py-12 sm:py-16 bg-surface min-h-70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionSkeleton />
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
