import { safeJsonLdStringify } from "@/lib/seo/json-ld";
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
import type { MetadatosFicha, ParametrosDeBusqueda } from "@/extensiones/_contrato";
import { fichaPropia, metadatosDeFichaPropia } from "@/lib/extensiones/FichaPropia";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ParametrosDeBusqueda>;
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

/** ADR-460 · los metadatos de una ficha propia (`null` = el producto no es de esa tienda). */
async function metadatosPropios(m: MetadatosFicha | null): Promise<Metadata> {
  const { resolveStoreContext } = await import("@/lib/store-metadata");
  const ctx = await resolveStoreContext();
  if (!m) return { title: { absolute: `Producto no encontrado — ${ctx.name}` }, robots: { index: false, follow: true } };
  const url = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe"}${m.ruta}`;
  return {
    title: { absolute: m.titulo },
    description: m.descripcion,
    alternates: { canonical: url, languages: { "es-PE": url, "x-default": url } },
    openGraph: {
      title: m.titulo,
      description: m.descripcion,
      url,
      ...(m.imagen ? { images: [{ url: m.imagen, alt: m.titulo }] } : {}),
      type: "website",
      locale: "es_PE",
      siteName: ctx.name,
    },
    twitter: { card: "summary_large_image", title: m.titulo, description: m.descripcion, ...(m.imagen ? { images: [m.imagen] } : {}) },
  };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  // ADR-460 · un negocio con ficha propia da sus metadatos (sin ella: los de siempre).
  const propios = await metadatosDeFichaPropia(slug, searchParams);
  if (propios !== undefined) return metadatosPropios(propios);
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
  const titleStr = `${product.name} — S/${Number(product.price).toFixed(2)} · ${ctx.name}`;

  return {
    title: ctx.isTenant ? { absolute: titleStr } : titleStr,
    description: `Compra ${product.name} a S/${Number(product.price).toFixed(2)} por ${product.unit}. ${category?.label ?? "Producto"} con delivery rápido. Paga con Yape o efectivo en ${ctx.name}.`,
    alternates: {
      canonical: productUrl,
      languages: { "es-PE": productUrl, "x-default": productUrl },
    },
    openGraph: {
      title: titleStr,
      description: `${product.name} a S/${Number(product.price).toFixed(2)}/${product.unit}. ${category?.label ?? ""} con delivery rápido.`,
      url: productUrl,
      images: [{ url: product.image, width: 600, height: 600, alt: `${product.name} — compra online con delivery` }],
      type: "website",
      locale: "es_PE",
      siteName: ctx.name,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — S/${Number(product.price).toFixed(2)}`,
      description: `Compra ${product.name} con delivery.`,
      images: [product.image],
    },
  };
}

function ProductDetailSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)] animate-pulse">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="aspect-square bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded-2xl" />
          <div className="space-y-4 pt-4">
            <div className="h-8 w-48 bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded" />
            <div className="h-6 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded" />
            <div className="h-10 w-32 bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

async function ProductDetailContent({ params }: Pick<Props, "params">) {
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
      {/* Una sola miga a la vista: la de la ficha (alineada con la foto). Se
          dibujaban TRES —la del esquema, ésta y la de ProductDetailClient— en
          todas las tiendas (medido 02-10-2026). El esquema queda para Google. */}
      <BreadcrumbSchema items={breadcrumbs} visible={false} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLdStringify({
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
              price: Number(product.price).toFixed(2),
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

export default async function ProductDetailPage({ params, searchParams }: Props) {
  // ADR-460 · un negocio con página propia puede traer su ficha (la de su
  // salón, su bodega…); si no la trae, o si falla, la general de siempre. La
  // búsqueda sólo se espera en la rama de la ficha propia.
  const propia = await fichaPropia((await params).slug, searchParams);
  if (propia) return propia;
  return (
    <Suspense fallback={<ProductDetailSkeleton />}>
      <ProductDetailContent params={params} />
    </Suspense>
  );
}
