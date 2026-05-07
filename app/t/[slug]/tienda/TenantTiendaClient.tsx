"use client";

/**
 * TenantTiendaClient — Cliente de la tienda pública tenant-scoped `/t/[slug]/tienda`.
 *
 * Responsabilidad: consumir la config y los productos precargados por el
 * Server Component (page.tsx) y orquestar las secciones dinámicas + el
 * catálogo paginado + el carrito flotante.
 *
 * Claves del contrato:
 *   - `strictAdminOnly=true` en TiendaSections → ninguna sección inventa
 *     productos random. Si admin no asignó, el shopper ve un placeholder
 *     en lugar de un pick aleatorio del catálogo.
 *   - Los productos vienen ya filtrados por `visible=true` + `active=true`
 *     desde el Server Component (StorePageDB.listCatalogWithVisibility).
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { ShoppingCart, ChevronRight } from "lucide-react";
import type { TiendaSectionKey } from "@/components/admin/StorefrontEditor";
import type { Product } from "@/data/products";
import { hydrateStoreProductsCache } from "@/hooks/use-store-products";
import { useCart } from "@/contexts/cart-context";
import AnnouncementBar from "@/components/AnnouncementBar";
import CategoryBubbles from "@/components/CategoryBubbles";
import TiendaSections from "@/components/TiendaSections";
import TiendaHero from "@/components/store/TiendaHero";
import TrustBar from "@/components/store/TrustBar";
import StoreBaseTheme from "@/components/store/StoreBaseTheme";
import { ProductGridSkeleton } from "@/components/LoadingSkeleton";

const ProductCatalog = dynamic(() => import("@/components/ProductCatalog"));
// Footer dedicado al tenant — sin links cross-store al marketplace.
const TenantFooter = dynamic(() => import("@/components/store/TenantFooter"));

export interface TenantTiendaClientProps {
  slug: string;
  storeName: string;
  products: Product[];
  visibleSections: TiendaSectionKey[];
  sectionOrder: TiendaSectionKey[];
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(amount);
}

/* ── Carrito flotante tenant-scoped ─────────────────────────────────────────── */
function CartBadge({ slug }: { slug: string }) {
  const { items } = useCart();
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.quantity * i.price, 0);
  if (count === 0) return null;
  return (
    <Link
      href={`/t/${slug}/tienda/carrito`}
      className="fixed bottom-6 right-4 sm:right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white font-bold text-sm transition-all active:scale-95 bg-[var(--accent)] hover:bg-[var(--accent-600)]"
      aria-label={`Ver carrito con ${count} items`}
    >
      <ShoppingCart className="w-5 h-5" aria-hidden="true" />
      <span>
        {count} ítem{count !== 1 ? "s" : ""}
      </span>
      <span className="opacity-80">·</span>
      <span>{formatPrice(total)}</span>
      <ChevronRight className="w-4 h-4 opacity-70" aria-hidden="true" />
    </Link>
  );
}

export default function TenantTiendaClient({
  slug,
  storeName,
  products,
  visibleSections,
  sectionOrder,
}: TenantTiendaClientProps) {
  // Hidratar el cache del hook `useStoreProducts` para que CategoryBubbles
  // (y cualquier subcomponente que se apoye en el hook) arranque SIN flash
  // de contenido vacio.
  useEffect(() => {
    hydrateStoreProductsCache(slug, products);
  }, [slug, products]);

  // Ocultar los breadcrumbs globales que se inyectan desde el layout/shell —
  // Brandon (2026-05-05) pidió que el hero arranque pegado al nav. Marca el
  // body con `tenant-storefront` y app/globals.css aplica `display: none`.
  useEffect(() => {
    document.body.classList.add("tenant-storefront");
    return () => {
      document.body.classList.remove("tenant-storefront");
    };
  }, []);

  const visibleSet = new Set<string>(visibleSections);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Concepto de diseño base — fundación moderna para que los temas custom
          se apliquen mejor encima. Sistema cohesivo de tipografía, espaciado,
          sombras coloreadas y transitions consistentes. */}
      <StoreBaseTheme />

      {/* Barra de anuncios (respeta config admin — se oculta sola si disabled). */}
      <AnnouncementBar />

      {/* Hero 2-column con ilustracion Pucallpa + CTAs claros */}
      <TiendaHero slug={slug} storeName={storeName} productCount={products.length} />

      {/* Trust bar: 4 chips de confianza (25 min, pago en casa, fresco, whatsapp) */}
      <TrustBar />

      <main id="main-content">
        {/* Filtros de categoria con ilustraciones (gris neutro) */}
        <CategoryBubbles />

        {/* Secciones dinamicas orquestadas desde admin.
            - showEmptyPlaceholders=true: seccion habilitada sin contenido muestra
              placeholder "No hay productos agregados todavia".
            - strictAdminOnly=true: ninguna seccion inventa productos al azar; si
              admin no asigno, se muestra placeholder (no pick random).
        */}
        <TiendaSections
          serverProducts={products}
          visibleSections={visibleSet}
          sectionOrder={sectionOrder}
          showEmptyPlaceholders
          strictAdminOnly
        />

        {/* Catalogo principal — siempre visible, recibe los productos ya filtrados */}
        <Suspense fallback={<CatalogLoadingSkeleton />}>
          <ProductCatalog initialProducts={products} />
        </Suspense>
      </main>

      <TenantFooter slug={slug} storeName={storeName} />

      <CartBadge slug={slug} />
    </div>
  );
}

function CatalogLoadingSkeleton() {
  return (
    <section className="py-16 sm:py-20 bg-surface min-h-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="h-12 w-full sm:w-64 bg-gray-200 dark:bg-surface rounded-xl animate-pulse" />
          <div className="h-12 w-full sm:w-48 bg-gray-200 dark:bg-surface rounded-xl animate-pulse" />
        </div>
        <ProductGridSkeleton count={12} />
      </div>
    </section>
  );
}
