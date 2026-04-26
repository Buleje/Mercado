import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { slugify, categories } from "@/data/products";
import type { Product } from "@/data/products";
import { ProductsDB } from "@/lib/db/products.db";
import ProductDetailClient from "@/components/ProductDetailClient";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

interface Props {
  params: Promise<{ slug: string }>;
}

// No pre-rendered pages — products are dynamic (DB-based, per-tenant).
// Next 16 con cacheComponents rechaza `generateStaticParams` que retorne []
// ("EmptyGenerateStaticParamsError"). La página lee `await headers()` para
// resolver tenantId, así que JAMÁS puede pre-renderizarse estáticamente →
// removemos la función por completo. Next auto-detecta dinámica por headers().
// Ver ADR-019 (ampliado 2026-04-09).

async function getProductBySlugFromDB(slug: string): Promise<Product | null> {
  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";
  const products = await ProductsDB.getAll(tenantId);
  const found = products.find((p) => slugify(p.name) === slug);
  return found ? (found as unknown as Product) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugFromDB(slug);
  // Tienda individual: nombre del comercio dinámico para títulos.
  const { resolveStoreContext } = await import("@/lib/store-metadata");
  const ctx = await resolveStoreContext();

  if (!product) {
    const notFoundTitle = `Producto no encontrado — ${ctx.name}`;
    return {
      title: ctx.isTenant ? { absolute: notFoundTitle } : notFoundTitle,
    };
  }

  const category = categories.find((c) => c.id === product.category);
  const productUrl = `https://www.buleje.pe/tienda/${slug}`;
  const titleStr = `${product.name} — S/${product.price.toFixed(2)} · ${ctx.name}`;

  return {
    title: ctx.isTenant ? { absolute: titleStr } : titleStr,
    description: `Compra ${product.name} a S/${product.price.toFixed(2)} por ${product.unit}. ${category?.label ?? "Producto"} con delivery rápido. Paga con Yape o efectivo en ${ctx.name}.`,
    alternates: {
      canonical: productUrl,
    },
    openGraph: {
      title: titleStr,
      description: `${product.name} a S/${product.price.toFixed(2)}/${product.unit}. ${category?.label ?? ""} con delivery rápido.`,
      url: productUrl,
      images: [{ url: product.image, width: 600, height: 600, alt: `${product.name} — compra online con delivery` }],
      type: "website",
      locale: "es_PE",
      siteName: ctx.name,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — S/${product.price.toFixed(2)}`,
      description: `Compra ${product.name} con delivery.`,
      images: [product.image],
    },
  };
}

function ProductDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 animate-pulse">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-2xl" />
          <div className="space-y-4 pt-4">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-6 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

async function ProductDetailContent({ params }: Props) {
  await connection();
  const { slug } = await params;
  const product = await getProductBySlugFromDB(slug);

  if (!product) notFound();

  const category = categories.find((c) => c.id === product.category);

  const breadcrumbs = [
    { name: "Inicio", url: "https://www.buleje.pe" },
    { name: "Tienda", url: "https://www.buleje.pe/tienda" },
    ...(category
      ? [{ name: category.label, url: `https://www.buleje.pe/tienda/categoria/${category.id}` }]
      : []),
    { name: product.name, url: `https://www.buleje.pe/tienda/${slug}` },
  ];

  return (
    <>
      <BreadcrumbSchema items={breadcrumbs} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            image: product.image,
            sku: `Buleje-${product.id}`,
            description: `${product.name} — ${category?.label ?? "Producto"} disponible con delivery. Paga con Yape o efectivo. Buleje.`,
            category: category?.label,
            brand: {
              "@type": "Organization",
              name: "Buleje",
            },
            offers: {
              "@type": "Offer",
              url: `https://www.buleje.pe/tienda/${slug}`,
              price: product.price.toFixed(2),
              priceCurrency: "PEN",
              priceValidUntil: "2026-12-31",
              availability: product.badge?.toLowerCase() === "agotado"
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
              itemCondition: "https://schema.org/NewCondition",
              eligibleRegion: {
                "@type": "Place",
                name: "Ucayali, Perú",
              },
              shippingDetails: {
                "@type": "OfferShippingDetails",
                shippingRate: {
                  "@type": "MonetaryAmount",
                  value: "0",
                  currency: "PEN",
                },
                shippingDestination: {
                  "@type": "DefinedRegion",
                  addressCountry: "PE",
                  addressRegion: "Ucayali",
                },
                deliveryTime: {
                  "@type": "ShippingDeliveryTime",
                  handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
                  transitTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" },
                },
              },
              seller: {
                "@type": "Organization",
                name: "Buleje",
              },
            },
          }),
        }}
      />
      <ProductDetailClient product={product} />
    </>
  );
}

export default function ProductDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<ProductDetailSkeleton />}>
      <ProductDetailContent params={params} />
    </Suspense>
  );
}
