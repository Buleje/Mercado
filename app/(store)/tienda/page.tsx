import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import TiendaClientShell from "@/components/TiendaClientShell";
import type { TiendaSectionKey } from "@/components/admin/StorefrontEditor";
import {
  ProductGridSkeleton,
  SectionSkeleton,
} from "@/components/LoadingSkeleton";
import { zones } from "@/data/zones";
import { categories } from "@/data/products";
import { SettingsDB } from "@/lib/db/settings.db";
import { getCachedSettings, resolveStoreContext } from "@/lib/store-metadata";

/**
 * Metadata dinámica: cuando se entra vía /t/<slug>/tienda el middleware
 * inyecta `x-tenant-store-route` y `x-tenant-id`. Usamos el nombre real
 * del comercio para que el título no diga "Buleje ERP" en una tienda
 * individual. Se aplica `title.absolute` para anular el template
 * `%s | Buleje` del root layout.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const ctx = await resolveStoreContext();
    const settings = await getCachedSettings(ctx.tenantId);
    const slogan = settings?.slogan ?? "Delivery rápido y seguro";

    const title = `${ctx.name} — Catálogo`;
    const description = `Explora el catálogo de ${ctx.name}. ${slogan}. Delivery con Yape y efectivo.`;

    // SEO 2026-05-24: og:image dinámico (share visual en WhatsApp/FB) — el
    // twitter card era summary_large_image pero sin imagen. Sirve para /tienda
    // y /t/{slug}/tienda (rewrite). Patrón /api/og igual al landing del tenant.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
    const ogImage = `${baseUrl}/api/og?title=${encodeURIComponent(ctx.name)}&subtitle=${encodeURIComponent("Catálogo · delivery con Yape o efectivo")}`;

    return {
      title: ctx.isTenant ? { absolute: title } : title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        locale: "es_PE",
        siteName: ctx.name,
        images: [{ url: ogImage, width: 1200, height: 630, alt: ctx.name }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImage],
      },
    };
  } catch {
    return {
      title: "Catálogo",
      description: "Catálogo completo. Delivery con Yape y efectivo.",
    };
  }
}

// ── Main catalog (still loaded individually — always visible) ──
const ProductCatalog    = dynamic(() => import("@/components/ProductCatalog"));
const Footer            = dynamic(() => import("@/components/Footer"));
const TenantFooter      = dynamic(() => import("@/components/store/TenantFooter"));

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
  const { visible } = await getTiendaSectionConfig();
  const show = (key: TiendaSectionKey) => visible.has(key);

  // Server-side product prefetch — #42: uses cached function for 5min revalidation
  let initialProducts: Array<Record<string, unknown>> = [];
  let tenantSlug = "main";
  let isTenantStoreRoute = false;
  try {
    // resolveStoreContext + getCachedProducts comparten cache per-request
    // con generateMetadata → 1 sola lectura de settings por render.
    const ctx = await resolveStoreContext();
    tenantSlug = ctx.tenantId;
    isTenantStoreRoute = ctx.isTenant;
    initialProducts = await getCachedProducts(tenantSlug) as unknown as Array<Record<string, unknown>>;
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
      {/* BreadcrumbSchema REMOVIDO (Brandon 2026-06-07): renderizaba un breadcrumb
          VISIBLE "Inicio › Tienda" además del JSON-LD → era el 2º breadcrumb
          duplicado. En la tienda individual el inicio ya es su portada; sin migas.
          El ItemList JSON-LD de productos (abajo) se mantiene para SEO. */}
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
      
      {/* Breadcrumb visible "Inicio › Tienda" REMOVIDO (Brandon 2026-06-07):
          en la tienda individual el inicio ES el catálogo → el breadcrumb era
          redundante (y se duplicaba). El BreadcrumbSchema (JSON-LD) se mantiene
          arriba para SEO. */}
      <main id="main-content">
        {/* Brandon 2026-06-07: la tienda individual muestra SOLO el catálogo.
            Quitados TiendaHero ("Tu bodega en {ciudad}"), TrustBar ("¿Por qué
            comprarme?") y TiendaSections (franja "Ofertas que no te podés perder")
            → página limpia, sin marketing del marketplace. */}
        <Suspense fallback={<CatalogLoadingSkeleton />}>
          <ProductCatalog initialProducts={initialProducts as any} />
        </Suspense>

        {/* Below-fold sections + modals (client-only shell) */}
        <TiendaClientShell {...shellVisibility} />
      </main>

      {/* SEO: Internal links to zone pages for crawl discovery.
          Solo visible cuando NO estamos en la tienda individual de un
          comerciante — esos links son del marketplace y romperían la
          autonomía de la tienda del cliente. */}
      {!isTenantStoreRoute && (
        <section className="bg-slate-50 dark:bg-slate-900/50 py-8 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-4">
              Buleje — Software para bodegas en todo el Perú
            </h2>
            <div className="flex flex-wrap gap-2">
              {zones.map((zone) => (
                <Link
                  key={zone.slug}
                  href={`/zona/${zone.slug}`}
                  className="text-sm text-slate-500 hover:text-[var(--data-success-600)] transition-colors"
                >
                  {zone.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

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
          <div className="h-12 w-full sm:w-64 bg-[var(--rule-soft)] dark:bg-surface rounded-xl animate-pulse" />
          <div className="h-12 w-full sm:w-48 bg-[var(--rule-soft)] dark:bg-surface rounded-xl animate-pulse" />
        </div>
        {/* Products grid */}
        <ProductGridSkeleton count={12} />
      </div>
    </section>
  );
}
