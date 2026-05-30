/**
 * PDP — Product Detail Page (Server Component).
 *
 * Ruta: /marketplace/[slug]/producto/[productId]
 *
 * 1. Fetch product + store info desde API pública.
 * 2. Fetch related products (misma categoría + misma tienda, excluye el actual).
 * 3. notFound() si no existe o active=false.
 * 4. generateMetadata dinámica.
 * 5. JSON-LD Product.
 *
 * Sin segment configs (ADR-019): Next 16 auto-detecta dynamic params.
 * Sin Prisma directo: usa la API REST pública.
 */

import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import type { Metadata } from "next";
import { ProductDetailClient } from "@/components/marketplace/product-detail/ProductDetailClient";
import BackToStoreButton from "@/components/marketplace/product-detail/BackToStoreButton";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import type { RelatedProduct } from "@/components/marketplace/product-detail/ProductRelated";
// generateStaticParams (build-time) usa la DB class directamente — no es prisma
// directo (regla #1) y en build no hay base URL para el fetch REST. El render
// del page sigue usando la API REST pública.
import { MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";

// ── Types desde la API ─────────────────────────────────────────────────────────

interface ApiProduct {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  wholesalePrice: number | null;
  unit: string | null;
  badge: string | null;
  stock: number | null;
  image: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  images: { id: string; url: string; alt: string | null; isPrimary: boolean }[];
  storeProductId: string;
  minOrderQty: number;
  store: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    description: string | null;
    zone: string | null;
    rating?: number | null;
    reviewCount?: number | null;
  };
}

interface ApiCatalogProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string;
  category: string;
  stock: number | null;
  storeId: string;
  storeSlug: string;
  storeName: string;
  storeZone: string | null;
  storeRating: number;
}

// ── Data fetchers ──────────────────────────────────────────────────────────────

async function fetchProduct(productId: string): Promise<ApiProduct | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace-product", `marketplace-product:${productId}`);
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.pe";
  try {
    const res = await fetch(`${base}/api/marketplace/products/${productId}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function fetchRelated(
  category: string | null,
  storeSlug: string,
  excludeId: number
): Promise<RelatedProduct[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace-catalog", `marketplace-catalog:${storeSlug}`);
  if (!category) return [];
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.pe";
  try {
    // PENTEST 2026-05-18 Fase 3 P1 #35: pedir más productos y filtrar por
    // categoría en memoria. Antes: limit=5 sin filtro → "Pepsi" mostraba
    // "Pollo a la Brasa" como relacionado. Ahora: pedimos 30 y filtramos
    // por la misma categoría del producto actual (case-insensitive).
    // Si la API soporta query param `category` en el futuro, agregarlo aquí.
    const res = await fetch(
      `${base}/api/marketplace/catalog?store=${storeSlug}&limit=30`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const products: ApiCatalogProduct[] = Array.isArray(json.products)
      ? json.products
      : Array.isArray(json.data)
      ? json.data
      : [];
    const categoryNorm = category.toLowerCase().trim();
    const sameCategory = products.filter(
      (p) =>
        p.productId !== excludeId &&
        (p.category ?? "").toLowerCase().trim() === categoryNorm,
    );
    // Si no hay suficientes de la misma categoría, completamos con cualquiera
    // del store para no dejar la sección vacía (UX > pureza).
    const fallback = products.filter(
      (p) =>
        p.productId !== excludeId &&
        !sameCategory.some((s) => s.productId === p.productId),
    );
    return [...sameCategory, ...fallback]
      .slice(0, 4)
      .map((p) => ({
        id: p.productId,
        name: p.name,
        price: p.price,
        image: p.image,
        storeName: p.storeName,
        storeSlug: p.storeSlug,
        storeId: p.storeId,
        storeProductId: p.storeProductId,
        unit: p.unit,
        category: p.category,
        stock: p.stock ?? undefined,
      }));
  } catch {
    return [];
  }
}

// ── generateMetadata ───────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}): Promise<Metadata> {
  const { slug, productId } = await params;
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.pe";

  const product = await fetchProduct(productId);
  if (!product) return { title: "Producto no encontrado" };

  // Designer audit P0: antes terminaba en "en Buleje" y el template root
  // añadía otro "| Buleje" → "Pepsi Black — Mi Pollo en Buleje | Marketplace · Buleje".
  // Ahora solo "Producto — Tienda" y el template lo cierra con "| Buleje".
  const title =
    product.metaTitle ||
    `${product.name} — ${product.store.name}`;
  const description =
    product.metaDescription ||
    product.description ||
    `Compra ${product.name} en ${product.store.name} a través de Buleje Marketplace, Pucallpa.`;

  const ogImage = product.ogImage || product.image;
  const pageUrl = `${base}/marketplace/${slug}/producto/${productId}`;

  return {
    title,
    description,
    alternates: {
      canonical: pageUrl,
      // Brandon 2026-05-21 SEO pro: hreflang es-PE + x-default.
      languages: { "es-PE": pageUrl, "x-default": pageUrl },
    },
    openGraph: {
      title: product.metaTitle || product.name,
      description,
      url: pageUrl,
      type: "website",
      siteName: "Buleje",
      locale: "es_PE",
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: product.name }] } : {}),
    },
    // Audit P11: Twitter Card explícito por ruta — antes solo el root
    // layout lo definía y child pages lo heredaban con summary genérico.
    // summary_large_image da preview rica con foto del producto.
    twitter: {
      card: "summary_large_image",
      title: product.metaTitle || product.name,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

// ── JSON-LD ────────────────────────────────────────────────────────────────────

// Helper puro: priceValidUntil 30 días forward formateado YYYY-MM-DD.
// Externalizado para no romper react-hooks/purity en el componente.
function pricingValidUntil(now: number): string {
  const d = new Date(now + 30 * 24 * 60 * 60 * 1000);
  const isoString = d.toISOString();
  const datePart = isoString.split("T")[0];
  return datePart ?? isoString;
}

// Brandon 2026-05-30 (audit #1): bajo Next 16 cacheComponents NO se puede leer
// `Date.now()` directo en un Server Component (error next-prerender-current-time)
// — antes estaba enmascarado porque la ruta era 100% dinámica (sin
// generateStaticParams). Lo envolvemos en "use cache": el now queda congelado por
// cacheLife (recomputado a diario), suficiente para priceValidUntil del Offer
// (validez 30 días). El fix sancionado por el propio mensaje de Next.
async function getPriceValidUntil(): Promise<string> {
  "use cache";
  cacheLife("days");
  return pricingValidUntil(Date.now());
}

function ProductJsonLd({ product, slug, productId, priceValidUntil }: {
  product: ApiProduct;
  slug: string;
  productId: string;
  priceValidUntil: string;
}) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.pe";
  const inStock = product.stock === null || product.stock > 0;
  const productUrl = `${base}/marketplace/${slug}/producto/${productId}`;
  const priceNum = typeof product.price === "number" ? product.price : Number(product.price);
  const priceFormatted = Number.isFinite(priceNum) ? priceNum.toFixed(2) : "0.00";

  // Audit P11 top-tier: schema enriquecido para Google Shopping rich results.
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": productUrl,
    name: product.name,
    description: product.description || undefined,
    image: product.image ? [product.image] : undefined,
    sku: String(product.id),
    category: product.category || undefined,
    brand: {
      "@type": "Brand",
      name: product.store.name,
    },
    offers: {
      "@type": "Offer",
      price: priceFormatted,
      priceCurrency: "PEN",
      priceValidUntil,
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      url: productUrl,
      seller: {
        "@type": "Organization",
        name: product.store.name,
        url: `${base}/marketplace/${slug}`,
      },
      areaServed: {
        "@type": "City",
        name: "Pucallpa",
      },
    },
  };

  // AggregateRating: solo si store tiene reviewCount > 0
  const rating = product.store.rating;
  const reviewCount = product.store.reviewCount;
  if (
    typeof rating === "number" &&
    rating > 0 &&
    typeof reviewCount === "number" &&
    reviewCount > 0
  ) {
    // 2026-05-28 audit P5: ratingValue antes era string ("5.0") por
    // toFixed() — algunos parsers Google rechazan. Ahora Number con
    // 1 decimal (5.0). bestRating/worstRating también pasan a number.
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(rating.toFixed(1)),
      reviewCount: reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ── generateStaticParams ─────────────────────────────────────────────────────────
// Brandon 2026-05-30 (audit #1): mismo fix que el storefront [slug]. Sin esta
// función, este segmento dinámico anidado no puede prerenderar shell estático
// bajo Next 16 cacheComponents → warning "Uncached data outside <Suspense>"
// atribuido al RootLayout. Devolvemos [] (los productos son demasiados para
// prerenderar en build): basta con que la función EXISTA para habilitar el
// shell; cada producto rendea on-demand vía dynamicParams=true (default), sin
// warning y sin staleness (los datos siguen dinámicos por request).
export async function generateStaticParams(): Promise<
  Array<{ slug: string; productId: string }>
> {
  try {
    const params = await MarketplaceStoreProductsDB.listPublishedProductParams(100);
    if (params.length > 0) {
      return params.map((p) => ({ slug: p.slug, productId: String(p.productId) }));
    }
  } catch {
    // DB no accesible en build → cae al placeholder.
  }
  // cacheComponents EXIGE ≥1 entry. Placeholder: el render hace notFound() para
  // un productId inexistente. Los productos reales se prerenderan cuando existen.
  return [{ slug: "__validate__", productId: "0" }];
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ slug: string; productId: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug, productId } = await params;

  const product = await fetchProduct(productId);

  if (!product) {
    notFound();
  }

  const relatedProducts = await fetchRelated(
    product.category,
    product.store.slug,
    product.id
  );

  // Construir gallery images
  const images =
    product.images.length > 0
      ? product.images.map((img) => ({ url: img.url, alt: img.alt ?? product.name }))
      : product.image
      ? [{ url: product.image, alt: product.name }]
      : [];

  // 2026-05-28 audit P2 CRITICAL: BreadcrumbList JSON-LD agregado al PDP
  // marketplace. Antes solo el storefront /tienda/[slug] tenía breadcrumbs.
  // Sin esto SERP no muestra path Home → Marketplace → {tienda} → {producto}
  // → CTR cae en desktop SERP.
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
  const breadcrumbItems = [
    { name: "Inicio", url: base },
    { name: "Marketplace", url: `${base}/marketplace` },
    { name: product.store.name, url: `${base}/marketplace/${slug}` },
    { name: product.name, url: `${base}/marketplace/${slug}/producto/${productId}` },
  ];

  // priceValidUntil vía "use cache" — evita Date.now() directo en el Server
  // Component (next-prerender-current-time bajo cacheComponents).
  const priceValidUntil = await getPriceValidUntil();

  return (
    <>
      <ProductJsonLd product={product} slug={slug} productId={productId} priceValidUntil={priceValidUntil} />

      {/*
        SEO 2026-05-28 audit P4: H1 sr-only server-side. ProductDetailClient
        es client → SSR HTML no tenía H1. Ahora H1 semántico en initial HTML
        para Google + screen readers, sin afectar diseño visual.
      */}
      <h1 className="sr-only">
        {product.name} — S/{(() => {
          const n = typeof product.price === "number" ? product.price : Number(product.price);
          return Number.isFinite(n) ? n.toFixed(2) : "0.00";
        })()} en {product.store.name} ({product.store.zone ?? "Pucallpa"})
      </h1>

      {/* BreadcrumbSchema: JSON-LD para SERP + nav visible si visible=true */}
      <BreadcrumbSchema items={breadcrumbItems} visible={false} />

      {/* Botón Volver — más limpio que breadcrumbs, vuelve a la tienda. */}
      <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6 lg:px-8">
        <BackToStoreButton storeSlug={slug} storeName={product.store.name} />
      </div>

      <ProductDetailClient
        product={{
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          price: product.price,
          previousPrice: product.wholesalePrice ?? null,
          unit: product.unit,
          stock: product.stock,
          imageUrl: product.image,
          badge: product.badge,
        }}
        store={{
          id: product.store.id,
          name: product.store.name,
          slug: product.store.slug,
          description: product.store.description,
          zone: product.store.zone,
          km: product.store.zone ? "0.8 km" : null,
        }}
        images={images}
        relatedProducts={relatedProducts}
        storeProductId={product.storeProductId}
      />
    </>
  );
}
