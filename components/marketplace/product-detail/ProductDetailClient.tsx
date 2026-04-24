"use client";

/**
 * ProductDetailClient — Orchestrator del PDP.
 *
 * Recibe datos del Server Component (ya hidratados) y monta el layout completo:
 * 2-col desktop (gallery izq / info+actions der) → stack mobile.
 * Sticky sidebar en desktop cuando el scroll es largo.
 *
 * REGLA: No calcula totales — solo preview UI en ProductActions.
 * Danger zone intacta: no importa cart-context ni checkout.
 */

import Link from "next/link";
import { ChevronRight, Home, Store } from "@buleje/design-system/icons";
import { Caption } from "@buleje/design-system";
import { ProductGalleryDS } from "./ProductGalleryDS";
import { ProductInfo } from "./ProductInfo";
import { ProductActions } from "./ProductActions";
import { ProductDescription } from "./ProductDescription";
import { ProductSpecs } from "./ProductSpecs";
import { ProductSellerInfo } from "./ProductSellerInfo";
import ProductReviews from "./ProductReviews";
import { ProductRelated, type RelatedProduct } from "./ProductRelated";
import { ProductFaq } from "./ProductFaq";
import type { ProductBadgeIntent } from "@buleje/design-system";
// Trust signals (ronda 4): señales sociales + escasez para aumentar conversion
import LiveViewersChip from "@/components/marketplace/trust/LiveViewersChip";
import LowStockBadge from "@/components/marketplace/trust/LowStockBadge";
import RecentPurchaseToast from "@/components/marketplace/trust/RecentPurchaseToast";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface PDPProduct {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  previousPrice?: number | null;
  /** Precio exclusivo para Socios Buleje (si aplica). */
  socioPrice?: number | null;
  unit: string | null;
  stock: number | null;
  imageUrl: string | null;
  badge?: string | null;
}

export interface PDPStore {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  zone?: string | null;
  km?: string | null;
  rating?: number;
  logo?: string | null;
}

export interface PDPImages {
  url: string;
  alt?: string;
}

export interface ProductDetailClientProps {
  product: PDPProduct;
  store: PDPStore;
  images: PDPImages[];
  relatedProducts: RelatedProduct[];
  storeProductId: string;
}

// ── Recent purchases mock (deterministic por productId) ────────────────────────

const PURCHASE_NAMES = [
  "Ana",
  "Carlos",
  "María",
  "Luis",
  "Rosa",
  "Jorge",
  "Lucía",
  "Pedro",
  "Sofía",
  "Diego",
];

function derivePurchases(productId: number): { firstName: string; minutesAgo: number }[] {
  // Pseudo-random determinista basado en productId. Genera 3 compras recientes.
  const seed = productId;
  const count = 3;
  return Array.from({ length: count }).map((_, i) => {
    const nameIdx = (seed + i * 7) % PURCHASE_NAMES.length;
    const minutesAgo = 15 + ((seed * (i + 1) * 13) % 180); // 15-195 min
    return { firstName: PURCHASE_NAMES[nameIdx], minutesAgo };
  });
}

// ── Badge derivado ─────────────────────────────────────────────────────────────

function deriveBadge(
  stock: number | null,
  badge: string | null | undefined,
  previousPrice: number | null | undefined,
  price: number
): { intent: ProductBadgeIntent; label: string } | null {
  if (previousPrice != null && previousPrice > price) {
    const pct = Math.round(((previousPrice - price) / previousPrice) * 100);
    return { intent: "offer", label: `-${pct}%` };
  }
  if (stock !== null && stock !== undefined && stock <= 3 && stock > 0) {
    return { intent: "scarcity", label: "Últimas unidades" };
  }
  if (badge) {
    return { intent: "fresh", label: badge };
  }
  return null;
}

// ── Breadcrumb ─────────────────────────────────────────────────────────────────

function Breadcrumb({
  storeName,
  storeSlug,
  category,
  productName,
}: {
  storeName: string;
  storeSlug: string;
  category: string | null | undefined;
  productName: string;
}) {
  return (
    <nav
      aria-label="Ruta de navegación"
      className="bg-[var(--surface-raised)] border-b border-[var(--rule-muted)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-3">
        <ol className="flex items-center gap-1.5 flex-wrap">
          <li>
            <Link
              href="/marketplace"
              className="flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
              aria-label="Inicio Marketplace"
            >
              <Home className="h-3.5 w-3.5" aria-hidden />
              Inicio
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" />
          </li>
          <li>
            <Link
              href={`/marketplace/${storeSlug}`}
              className="flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
            >
              <Store className="h-3 w-3" aria-hidden />
              {storeName}
            </Link>
          </li>
          {category && (
            <>
              <li aria-hidden>
                <ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" />
              </li>
              <li>
                <Caption className="text-[var(--text-tertiary)]">{category}</Caption>
              </li>
            </>
          )}
          <li aria-hidden>
            <ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" />
          </li>
          <li>
            <Caption
              className="text-[var(--text-primary)] font-medium truncate max-w-[12rem] sm:max-w-xs"
              aria-current="page"
            >
              {productName}
            </Caption>
          </li>
        </ol>
      </div>
    </nav>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export function ProductDetailClient({
  product,
  store,
  images,
  relatedProducts,
  storeProductId,
}: ProductDetailClientProps) {
  const galleryBadge = deriveBadge(
    product.stock,
    product.badge,
    product.previousPrice,
    product.price
  );

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Breadcrumb: ya lo renderiza la page server component (`page.tsx`)
          con el primitivo `@/components/ui-system/Breadcrumbs`. Duplicarlo
          aquí generaba dos breadcrumbs visuales — fix 2026-04-20. */}

      {/* Layout 2-col desktop / stack mobile — ancho editorial */}
      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
        {/* Blob decorativo sutil */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
        />
        <div className="relative grid grid-cols-1 lg:grid-cols-[5fr_6fr] gap-10 lg:gap-16">
          {/* LEFT — Gallery */}
          <div className="lg:self-start lg:sticky lg:top-8">
            <ProductGalleryDS
              images={images}
              productName={product.name}
              category={product.category}
              badge={galleryBadge}
            />
          </div>

          {/* RIGHT — Info + Actions */}
          <div className="space-y-7">
            <ProductInfo
              name={product.name}
              storeName={store.name}
              storeSlug={store.slug}
              storeZone={store.zone}
              storeKm={store.km}
              price={product.price}
              previousPrice={product.previousPrice}
              socioPrice={product.socioPrice}
              unit={product.unit}
              stock={product.stock}
              category={product.category}
              badge={product.badge}
            />

            {/* Trust signals (ronda 4): viendo ahora + stock bajo si aplica */}
            <div className="flex flex-wrap items-center gap-2">
              <LiveViewersChip productId={String(product.id)} />
              {product.stock !== null && product.stock !== undefined && product.stock <= 5 && product.stock > 0 && (
                <LowStockBadge stock={product.stock} />
              )}
            </div>

            {/* RecentPurchaseToast — social proof rotatorio (ronda 4). */}
            <RecentPurchaseToast
              purchases={derivePurchases(product.id)}
              rotateMs={8000}
            />

            <div className="border-t border-[var(--rule-soft)]" />

            <ProductActions
              productId={product.id}
              storeId={store.id}
              storeName={store.name}
              storeSlug={store.slug}
              storeProductId={storeProductId}
              name={product.name}
              price={product.price}
              image={product.imageUrl}
              unit={product.unit}
              stock={product.stock}
            />
          </div>
        </div>

        {/* Sections below hero — cada componente trae su propio header */}
        <div className="mt-16 sm:mt-24 space-y-12 sm:space-y-16">
          <ProductDescription
            description={product.description}
            productName={product.name}
          />

          <div className="border-t border-[var(--rule-soft)]" />

          <ProductSpecs
            name={product.name}
            category={product.category}
            unit={product.unit}
            price={product.price}
          />

          <div className="border-t border-[var(--rule-soft)]" />

          <ProductSellerInfo
            storeName={store.name}
            storeSlug={store.slug}
            storeDescription={store.description}
            storeZone={store.zone}
            storeKm={store.km}
            storeRating={store.rating}
          />

          <div className="border-t border-[var(--rule-soft)]" />

          <ProductReviews productId={product.id} productName={product.name} />

          {relatedProducts.length > 0 && (
            <>
              <div className="border-t border-[var(--rule-soft)]" />
              <ProductRelated products={relatedProducts} storeSlug={store.slug} />
            </>
          )}

          <div className="border-t border-[var(--rule-soft)]" />

          <ProductFaq />
        </div>
      </div>

      {/* Sticky mobile bar */}
      <MobileStickyBar
        productId={product.id}
        storeId={store.id}
        storeName={store.name}
        storeSlug={store.slug}
        storeProductId={storeProductId}
        name={product.name}
        price={product.price}
        image={product.imageUrl}
        unit={product.unit}
        stock={product.stock}
      />

      {/* Footer vive en app/marketplace/layout.tsx (persistente). */}
    </div>
  );
}


// ── Mobile sticky bar ──────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

function MobileStickyBar({
  productId,
  storeId,
  storeName,
  storeSlug,
  storeProductId,
  name,
  price,
  image,
  unit,
  stock,
}: {
  productId: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeProductId: string;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  stock: number | null;
}) {
  const { addItem } = useMarketplaceCart();
  const [added, setAdded] = useState(false);
  const isOutOfStock = stock !== null && stock !== undefined && stock === 0;

  const handleAdd = useCallback(() => {
    if (isOutOfStock) return;
    addItem({ storeId, storeName, storeSlug, storeProductId, productId, name, price, image, unit });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }, [isOutOfStock, addItem, storeId, storeName, storeSlug, storeProductId, productId, name, price, image, unit]);

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-[var(--surface-raised)]/95 backdrop-blur-xl border-t border-[var(--rule-muted)] p-3"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <Caption className="text-[var(--text-tertiary)] truncate">{name}</Caption>
          <p className="text-[length:var(--ts-lg)] font-extrabold text-[var(--text-primary)] tabular-nums leading-tight">
            S/ {price.toFixed(2)}
          </p>
        </div>
        <button
          onClick={handleAdd}
          disabled={isOutOfStock}
          className={
            isOutOfStock
              ? "px-5 py-3 rounded-xl font-semibold text-[length:var(--ts-sm)] text-[var(--text-tertiary)] bg-[var(--surface-sunken)] cursor-not-allowed"
              : added
              ? "px-5 py-3 rounded-xl font-semibold text-[length:var(--ts-sm)] text-white bg-[var(--accent)] active:scale-95 transition-all"
              : "px-5 py-3 rounded-xl font-semibold text-[length:var(--ts-sm)] text-white bg-[var(--accent)] hover:opacity-90 active:scale-95 transition-all"
          }
          aria-label={isOutOfStock ? "Agotado" : "Agregar al carrito"}
        >
          {isOutOfStock ? "Agotado" : added ? "Agregado" : "Agregar"}
        </button>
      </div>
    </div>
  );
}
