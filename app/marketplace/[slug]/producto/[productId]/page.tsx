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
import type { RelatedProduct } from "@/components/marketplace/product-detail/ProductRelated";

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
    const res = await fetch(
      `${base}/api/marketplace/catalog?store=${storeSlug}&limit=5`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const products: ApiCatalogProduct[] = Array.isArray(json.products)
      ? json.products
      : Array.isArray(json.data)
      ? json.data
      : [];
    return products
      .filter((p) => p.productId !== excludeId)
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
  if (!product) return { title: "Producto no encontrado — Buleje" };

  const title =
    product.metaTitle ||
    `${product.name} — ${product.store.name} en Buleje`;
  const description =
    product.metaDescription ||
    product.description ||
    `Compra ${product.name} en ${product.store.name} a través de Buleje Marketplace, Pucallpa.`;

  const ogImage = product.ogImage || product.image;
  const pageUrl = `${base}/marketplace/${slug}/producto/${productId}`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: product.metaTitle || product.name,
      description,
      url: pageUrl,
      type: "website",
      ...(ogImage ? { images: [{ url: ogImage, alt: product.name }] } : {}),
    },
  };
}

// ── JSON-LD ────────────────────────────────────────────────────────────────────

function ProductJsonLd({ product, slug, productId }: {
  product: ApiProduct;
  slug: string;
  productId: string;
}) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.pe";
  const inStock = product.stock === null || product.stock > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: product.image || undefined,
    offers: {
      "@type": "Offer",
      price: product.price.toFixed(2),
      priceCurrency: "PEN",
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${base}/marketplace/${slug}/producto/${productId}`,
      seller: { "@type": "Organization", name: product.store.name },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
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

  return (
    <>
      <ProductJsonLd product={product} slug={slug} productId={productId} />

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
