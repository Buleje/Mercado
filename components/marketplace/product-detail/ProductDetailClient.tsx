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
import Image from "next/image";
import { useEffect } from "react";
import {
  ChevronRight,
  Home,
  Store,
  Smartphone,
  Banknote,
  ArrowLeft,
  Share2,
  Star,
  CheckCircle2,
} from "@buleje/design-system/icons";
import { Caption } from "@buleje/design-system";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { ProductGalleryDS } from "./ProductGalleryDS";
import { ProductInfo } from "./ProductInfo";
import { ProductActions } from "./ProductActions";
import { ProductDescription } from "./ProductDescription";
import { ProductSpecs } from "./ProductSpecs";
import { ProductSellerInfo } from "./ProductSellerInfo";
import ProductReviews from "./ProductReviews";
import { ProductRelated, type RelatedProduct } from "./ProductRelated";
import FrequentlyBoughtTogether from "./FrequentlyBoughtTogether";
import { ProductCatalogExplorer, CATALOG_ALL } from "./ProductCatalogExplorer";
import { ProductSideNav } from "./ProductSideNav";
import type { ProductBadgeIntent } from "@buleje/design-system";
// Trust signals (ronda 4): señales sociales + escasez para aumentar conversion
import LowStockBadge from "@/components/marketplace/trust/LowStockBadge";

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
  banner?: string | null;
  category?: string | null;
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

// ── Banner del negocio + identidad (cabecera del cuadro, estilo MercadoLibre) ───

function StoreBannerHeader({
  storeName,
  storeSlug,
  logo,
  banner,
  category,
  rating,
}: {
  storeName: string;
  storeSlug: string;
  logo?: string | null;
  banner?: string | null;
  category?: string | null;
  rating?: number;
}) {
  const initial = storeName.trim().charAt(0).toUpperCase();
  const hasBanner = Boolean(banner && banner.trim().length > 0);

  return (
    <>
      {/* Banner FULL-BLEED (estilo MercadoLibre) — el mismo banner de la tienda
          (Store.banner). Ocupa todo el ancho, FUERA del cuadro del detalle. */}
      {/* Brandon 2026-06-14: banner más bajo (antes h-40/52/60) + calidad alta
          (quality 90) para que la imagen de portada se vea nítida sin ocupar
          tanto alto above-the-fold. */}
      <div className="relative w-full h-28 sm:h-36 lg:h-44 overflow-hidden bg-[var(--surface-sunken)]">
        {hasBanner ? (
          <Image
            src={banner!}
            alt={`Banner de ${storeName}`}
            fill
            sizes="100vw"
            quality={90}
            className="object-cover"
            priority
          />
        ) : (
          <div
            aria-hidden
            className="h-full w-full"
            style={{
              background:
                "linear-gradient(115deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 65%, #061a1e) 60%, #061a1e 100%)",
            }}
          />
        )}
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />
      </div>

      {/* Logo GRANDE solapado + identidad — centrado al ancho del cuadro,
          flotando sobre el banner (como MercadoLibre). */}
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="-mt-12 sm:-mt-14 mb-3 flex items-end gap-4">
          <Link
            href={`/marketplace/${storeSlug}`}
            aria-label={`Ver tienda ${storeName}`}
            className="relative z-10 grid h-24 w-24 sm:h-28 sm:w-28 shrink-0 place-items-center overflow-hidden rounded-md border-4 border-[var(--surface-canvas)] bg-[var(--surface-raised)] shadow-md"
          >
            {logo ? (
              <Image src={logo} alt={`Logo de ${storeName}`} width={112} height={112} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-[var(--surface-sunken)] text-3xl font-semibold uppercase text-[var(--text-secondary)]">
                {initial}
              </span>
            )}
          </Link>
          <div className="min-w-0 pb-1">
            <Link
              href={`/marketplace/${storeSlug}`}
              className="inline-flex items-center gap-1 text-lg font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors truncate"
            >
              {storeName}
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-label="Tienda verificada" />
            </Link>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              {rating ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" strokeWidth={0} aria-hidden />
                  <span className="font-medium text-[var(--text-secondary)] tabular-nums">{rating.toFixed(1)}</span>
                </span>
              ) : null}
              {category && <span className="capitalize">{category}</span>}
              <span className="text-[var(--data-success-600)]">Tienda oficial</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Barra de ruta: Volver + breadcrumb + Compartir (dentro del cuadro) ──────────

function RouteBar({
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
  const handleShare = () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: productName, url }).catch(() => {
        /* el usuario canceló el diálogo nativo de compartir — no es error */
      });
    } else {
      navigator.clipboard?.writeText(url).catch(() => {
        /* clipboard no disponible (contexto http o permisos) — silencioso */
      });
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-t-lg border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 sm:px-5 py-2.5">
      <nav aria-label="Ruta de navegación" className="min-w-0">
        <ol className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <li className="shrink-0">
            <Link
              href={`/marketplace/${storeSlug}`}
              className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-medium text-[var(--accent)] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Volver
            </Link>
          </li>
          <li aria-hidden className="shrink-0 text-[var(--rule-base)]">|</li>
          <li className="shrink-0">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
            >
              <Home className="h-3 w-3" aria-hidden />
              Inicio
            </Link>
          </li>
          <li aria-hidden className="shrink-0"><ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" /></li>
          <li className="shrink-0">
            <Link
              href={`/marketplace/${storeSlug}`}
              className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
            >
              <Store className="h-3 w-3" aria-hidden />
              {storeName}
            </Link>
          </li>
          {category && (
            <>
              <li aria-hidden className="shrink-0"><ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" /></li>
              <li className="shrink-0"><Caption className="text-[var(--text-tertiary)] capitalize">{category}</Caption></li>
            </>
          )}
          <li aria-hidden className="shrink-0"><ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" /></li>
          <li className="min-w-0">
            <Caption className="text-[var(--text-secondary)] truncate max-w-[10rem] sm:max-w-xs" aria-current="page">
              {productName}
            </Caption>
          </li>
        </ol>
      </nav>
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1 text-[length:var(--ts-xs)] font-medium text-[var(--accent)] hover:bg-[var(--surface-raised)] transition-colors"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Compartir</span>
      </button>
    </div>
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
  const { track } = useRecentlyViewed();
  const galleryBadge = deriveBadge(
    product.stock,
    product.badge,
    product.previousPrice,
    product.price
  );

  // Resumen de reseñas (★ promedio + total) para el rating row estilo AliExpress
  // bajo el título. ProductInfo ya lo renderiza si ratingCount > 0; el gap era
  // que el orquestador no lo pasaba. Real: total del endpoint + promedio de las
  // reseñas devueltas. Sin reseñas → row oculto (correcto).
  const [reviewSummary, setReviewSummary] = useState<{ avg: number; count: number } | null>(null);
  // UGC: fotos reales de clientes (de las reseñas) para sumar a la galería.
  const [ugcPhotos, setUgcPhotos] = useState<string[]>([]);
  // Navegación de categorías compartida entre la sidebar y el catálogo de abajo.
  const [exploreCategory, setExploreCategory] = useState<string>(CATALOG_ALL);
  const [exploreCategories, setExploreCategories] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    // Mismos params que ProductReviews (el endpoint exige filter+sort+limit+offset;
    // limit máx = 50). Con 50 alcanza para el promedio del rating row.
    fetch(`/api/marketplace/reviews-enhanced/${product.id}?filter=all&sort=recent&limit=50&offset=0`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        const list = Array.isArray(j.data) ? j.data : Array.isArray(j.reviews) ? j.reviews : [];
        // Fotos de clientes (UGC) — hasta 6 para la galería.
        const photos = list
          .flatMap((x: { photos?: unknown }) => (Array.isArray(x?.photos) ? x.photos : []))
          .filter((u: unknown): u is string => typeof u === "string" && u.length > 0)
          .slice(0, 6);
        if (photos.length) setUgcPhotos(photos);
        const count = typeof j.total === "number" ? j.total : list.length;
        if (!count) return;
        // Promedio: usa breakdown.average si viene; si no, promedia los ratings.
        const ratings = list
          .map((x: { rating?: unknown }) => Number(x?.rating))
          .filter((n: number) => n > 0);
        const fromList = ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;
        const avg = Number(j?.breakdown?.average) > 0 ? Number(j.breakdown.average) : fromList;
        setReviewSummary({ avg, count });
      })
      .catch(() => {/* sin resumen → rating row oculto */});
    return () => { cancelled = true; };
  }, [product.id]);

  // Track visit to populate "Recently viewed" drawer (ronda 4)
  useEffect(() => {
    track({
      id: product.id,
      storeProductId,
      name: product.name,
      price: product.price,
      image: product.imageUrl,
      url: `/marketplace/${store.slug}/producto/${storeProductId}`,
      unit: product.unit,
    });
  }, [product.id, product.name, product.price, product.imageUrl, product.unit, storeProductId, store.slug, track]);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Breadcrumb: ya lo renderiza la page server component (`page.tsx`)
          con el primitivo `@/components/ui-system/Breadcrumbs`. Duplicarlo
          aquí generaba dos breadcrumbs visuales — fix 2026-04-20. */}

      {/* Banner FULL-BLEED del negocio + logo grande + identidad (Brandon
          2026-06-14). El banner ocupa todo el ancho y queda FUERA del cuadro. */}
      <StoreBannerHeader
        storeName={store.name}
        storeSlug={store.slug}
        logo={store.logo}
        banner={store.banner}
        category={store.category}
        rating={store.rating}
      />

      {/* Contenedor centrado */}
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pb-6">
        {/* CUADRO (Brandon 2026-06-14): el borde arranca en Volver/ubicación y
            envuelve el detalle HASTA opiniones. "Te podría interesar" queda
            FUERA, suelto abajo. */}
        <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-sm">
          {/* Barra de ruta: Volver + breadcrumb + Compartir (inicio del cuadro) */}
          <RouteBar
            storeName={store.name}
            storeSlug={store.slug}
            category={product.category}
            productName={product.name}
          />

          {/* Cuerpo del cuadro */}
          <div className="p-4 sm:p-5 lg:p-6">
            {/* Layout 3-col: galería | info | buy-box sticky → 2-col lg → stack mobile */}
            <div className="relative grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)_360px] gap-6 lg:gap-8 xl:gap-10 items-start">
              {/* LEFT — Gallery (catálogo + fotos reales de clientes) */}
              <div className="lg:self-start lg:sticky lg:top-6">
                <ProductGalleryDS
                  images={[
                    ...images,
                    ...ugcPhotos
                      .filter((u) => !images.some((img) => img.url === u))
                      .map((u) => ({ url: u, alt: `Foto de cliente de ${product.name}`, ugc: true })),
                  ]}
                  productName={product.name}
                  category={product.category}
                  badge={galleryBadge}
                />
              </div>

              {/* CENTER — Info */}
              <div className="space-y-5 min-w-0">
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
                  ratingAverage={reviewSummary?.avg ?? 0}
                  ratingCount={reviewSummary?.count ?? 0}
                />

                {/* Stock bajo real — único trust signal sin datos inventados */}
                {product.stock !== null && product.stock !== undefined && product.stock <= 5 && product.stock > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <LowStockBadge stock={product.stock} />
                  </div>
                )}
              </div>

              {/* RIGHT — Columna del carrito: buy-box + vendedor + medios de pago */}
              <aside className="lg:col-span-2 xl:col-span-1 lg:sticky lg:top-6 space-y-3">
                {/* Buy box */}
                <div className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
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

                {/* Vendedor (minimal) */}
                <ProductSellerInfo
                  storeName={store.name}
                  storeSlug={store.slug}
                  storeDescription={store.description}
                  storeZone={store.zone}
                  storeKm={store.km}
                  storeRating={store.rating}
                />

                {/* Medios de pago (minimal + iconos) */}
                <section className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Medios de pago</h2>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] mb-3">
                    Pagás al recibir — sin tarjetas.
                  </p>
                  <ul className="space-y-2 text-sm text-[var(--text-primary)]">
                    <li className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden /> Yape
                    </li>
                    <li className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden /> Plin
                    </li>
                    <li className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden /> Efectivo
                    </li>
                  </ul>
                </section>
              </aside>
            </div>

            {/* Layout inferior: barra lateral de navegación (desktop) + contenido */}
            <div className="mt-7 lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-8">
              <ProductSideNav
                storeSlug={store.slug}
                storeName={store.name}
                hasRelated={relatedProducts.length > 0}
                categories={exploreCategories}
                activeCategory={exploreCategory}
                onCategoryChange={setExploreCategory}
                className="hidden lg:block"
              />
              <div className="min-w-0">

            {/* Barra de TABS (mobile) — ancla a cada sección de abajo */}
            <nav
              aria-label="Secciones del producto"
              className="border-b border-[var(--rule-base)] px-1 sm:px-2 lg:hidden"
            >
              <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto h-11 text-sm font-medium [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[
                  { label: "Descripción", href: "#descripcion" },
                  { label: "Detalles", href: "#detalles" },
                  { label: "Valoraciones", href: "#valoraciones" },
                  ...(relatedProducts.length > 0 ? [{ label: "Te podría interesar", href: "#recomendados" }] : []),
                ].map((t) => (
                  <a
                    key={t.href}
                    href={t.href}
                    className="shrink-0 whitespace-nowrap px-3 sm:px-4 h-11 inline-flex items-center border-b-2 border-transparent text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    {t.label}
                  </a>
                ))}
              </div>
            </nav>

            {/* Secciones — hasta opiniones (todo dentro del cuadro) */}
            <div className="mt-6 space-y-6">
              <div id="descripcion" className="scroll-mt-28">
                <ProductDescription
                  description={product.description}
                  productName={product.name}
                />
              </div>

              <div id="detalles" className="scroll-mt-28">
                <ProductSpecs
                  name={product.name}
                  category={product.category}
                  unit={product.unit}
                  price={product.price}
                />
              </div>

              <div id="combo" className="scroll-mt-28">
                <FrequentlyBoughtTogether
                  productId={product.id}
                  storeId={store.id}
                  storeName={store.name}
                  storeSlug={store.slug}
                  anchor={{
                    productId: product.id,
                    name: product.name,
                    price: product.price,
                    image: product.imageUrl,
                    storeId: store.id,
                    storeName: store.name,
                    storeSlug: store.slug,
                    storeProductId,
                    unit: product.unit,
                    category: product.category,
                  }}
                />
              </div>

              <div id="valoraciones" className="scroll-mt-28">
                <ProductReviews productId={product.id} productName={product.name} />
              </div>
            </div>
              </div>
            </div>
          </div>
        </div>

        {/* FUERA del cuadro: Te podría interesar (sección libre) */}
        {relatedProducts.length > 0 && (
          <div id="recomendados" className="mt-6 sm:mt-8 scroll-mt-28">
            <ProductRelated products={relatedProducts} storeSlug={store.slug} />
          </div>
        )}

        {/* Catálogo navegable por categoría — explorar más de la tienda */}
        <div id="explorar" className="mt-8 sm:mt-10 scroll-mt-28">
          <ProductCatalogExplorer
            storeSlug={store.slug}
            storeName={store.name}
            currentProductId={product.id}
            activeCategory={exploreCategory}
            onCategoryChange={setExploreCategory}
            onCategoriesLoaded={setExploreCategories}
          />
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
        previousPrice={product.previousPrice}
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
  previousPrice,
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
  previousPrice?: number | null;
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
          <div className="flex items-baseline gap-2">
            <p className="text-[length:var(--ts-lg)] font-semibold text-[var(--text-primary)] tabular-nums leading-tight">
              S/ {price.toFixed(2)}
            </p>
            {previousPrice != null && previousPrice > price && (
              <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-success-700,#047857)] tabular-nums">
                Ahorras S/ {(previousPrice - price).toFixed(2)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleAdd}
          disabled={isOutOfStock}
          className={
            isOutOfStock
              ? "px-5 py-3 rounded-sm font-semibold text-[length:var(--ts-sm)] text-[var(--text-tertiary)] bg-[var(--surface-sunken)] cursor-not-allowed"
              : added
              ? "px-5 py-3 rounded-sm font-semibold text-[length:var(--ts-sm)] text-white bg-[var(--accent-600,var(--accent))] active:scale-95 transition-all"
              : "px-5 py-3 rounded-sm font-semibold text-[length:var(--ts-sm)] text-white bg-[var(--accent-600,var(--accent))] hover:opacity-90 active:scale-95 transition-all"
          }
          aria-label={isOutOfStock ? "Agotado" : "Agregar al carrito"}
        >
          {isOutOfStock ? "Agotado" : added ? "Agregado" : "Agregar"}
        </button>
      </div>
    </div>
  );
}
