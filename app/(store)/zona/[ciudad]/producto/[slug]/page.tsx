/**
 * /zona/[ciudad]/producto/[slug] — City x Product page for Programmatic SEO
 *
 * Buleje = Software SaaS ERP para bodegas y tiendas de todo Perú.
 *
 * Targets: "precio aceite palma pucallpa", "comprar arroz lima",
 *          "donde comprar cerveza cusco barato"
 *
 * Shows a single product with price, stores that sell it in this zone,
 * cross-links to same product in other zones, and other products in this zone.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { headers } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import { categories, slugify } from "@/data/products";
import { zones, findZone } from "@/data/zones";
import { ProductsDB } from "@/lib/db/products.db";
import { getCatalogCategoryIcon } from "@/lib/catalog/catalog-icons";
import {
  generateSoftwareApplicationLD,
  generateItemListLD,
  zoneBreadcrumbs,
} from "@/lib/seo/json-ld";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";

const realCategories = categories.filter((c) => c.id !== "todos");

interface Props {
  params: Promise<{ ciudad: string; slug: string }>;
}

// ── Cached: find a product by slug within a tenant ───────────────────
async function getProductBySlug(tenantId: string, productoSlug: string) {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag("zone-product", `zone-product:${tenantId}:${productoSlug}`);

  const allProducts = await ProductsDB.getAll(tenantId);
  const active = allProducts.filter((p) => p.active !== false);
  return active.find((p) => slugify(p.name) === productoSlug) ?? null;
}

// ── Cached: related products in the same category ───────────────────
async function getRelatedProducts(
  tenantId: string,
  categoryId: string,
  excludeSlug: string,
) {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag(
    "zone-product-related",
    `zone-product-related:${tenantId}:${categoryId}`,
  );

  const allProducts = await ProductsDB.getAll(tenantId);
  return allProducts
    .filter(
      (p) =>
        p.active !== false &&
        p.category === categoryId &&
        slugify(p.name) !== excludeSlug,
    )
    .slice(0, 8);
}

// ── Static params: zone × product combos ────────────────────────────
// Note: products live in the DB so we return an empty array and rely on
// Seed params for build validation — remaining combos render on-demand.
export function generateStaticParams() {
  return [{ ciudad: "pucallpa", slug: "arroz-extra" }];
}

// ── Metadata ─────────────────────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ciudad, slug: productoSlug } = await params;
  const zone = findZone(ciudad);
  if (!zone) return { title: "Zona no encontrada" };

  // Resolve tenantId for metadata — fallback to "main" (no real headers in
  // generateMetadata context, so we use the default tenant).
  const product = await getProductBySlug("main", productoSlug);
  if (!product) return { title: "Producto no encontrado" };

  const price = product.price.toFixed(2);
  const title = `${product.name} en ${zone.name} — S/${price} | Buleje`;
  const description =
    product.description
      ? `${product.description} Disponible en ${zone.name}, ${zone.region}. Precio: S/${price} por ${product.unit ?? "und"}. Gestiona tu bodega con Buleje ERP.`
      : `${product.name} en ${zone.name} al precio de S/${price} por ${product.unit ?? "und"}. Gestiona inventario, ventas y delivery con Buleje ERP para bodegas.`;
  const url = `${BASE_URL}/zona/${zone.slug}/producto/${productoSlug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      locale: "es_PE",
      siteName: "Buleje",
      images: product.image
        ? [
            {
              url: product.image.startsWith("http")
                ? product.image
                : `${BASE_URL}${product.image}`,
              width: 800,
              height: 800,
              alt: product.name,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — S/${price} en ${zone.name}`,
      description,
    },
  };
}

// ── Product JSON-LD (schema.org/Product) ─────────────────────────────
function generateProductLD(
  product: { name: string; price: number; image: string; description?: string; unit?: string },
  zone: { name: string; slug: string },
  productoSlug: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    image: product.image.startsWith("http")
      ? product.image
      : `${BASE_URL}${product.image}`,
    url: `${BASE_URL}/zona/${zone.slug}/producto/${productoSlug}`,
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: "PEN",
      availability: "https://schema.org/InStock",
      areaServed: {
        "@type": "City",
        name: zone.name,
      },
      seller: {
        "@type": "Organization",
        name: "Buleje",
        url: BASE_URL,
      },
      unitText: product.unit ?? "und",
    },
  };
}

// ── Related product card ──────────────────────────────────────────────
function RelatedProductCard({
  product,
  zoneSlug,
}: {
  product: {
    name: string;
    price: number;
    image: string;
    unit: string;
  };
  zoneSlug: string;
}) {
  const slug = slugify(product.name);
  return (
    <Link
      href={`/zona/${zoneSlug}/producto/${slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden shadow-sm transition-all hover:shadow-md hover:border-[#2d6a4f]/40"
    >
      <div className="relative aspect-square bg-slate-50 dark:bg-slate-800">
        <Image
          src={product.image}
          alt={`${product.name} — precio en ${zoneSlug}`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-contain p-3 group-hover:scale-105 transition-transform"
        />
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 group-hover:text-[#2d6a4f] transition-colors">
          {product.name}
        </h3>
        <div className="mt-auto pt-2 flex items-baseline gap-1">
          <span className="text-base font-bold text-[#2d6a4f]">
            S/{product.price.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400">/{product.unit}</span>
        </div>
      </div>
    </Link>
  );
}

// ── Main async content ────────────────────────────────────────────────
async function ZoneProductContent({
  ciudad,
  productoSlug,
}: {
  ciudad: string;
  productoSlug: string;
}) {
  const zone = findZone(ciudad);
  if (!zone) notFound();

  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";

  const product = await getProductBySlug(tenantId, productoSlug);
  if (!product) notFound();

  const category = realCategories.find((c) => c.id === product.category);
  const relatedProducts = await getRelatedProducts(
    tenantId,
    product.category,
    productoSlug,
  );

  const productLD = generateProductLD(product, zone, productoSlug);

  const relatedItems = relatedProducts.map((p) => ({
    name: p.name,
    price: p.price,
    image: p.image,
    url: `${BASE_URL}/zona/${zone.slug}/${slugify(p.name)}`,
    unit: p.unit ?? "und",
  }));

  const breadcrumbs = [
    ...zoneBreadcrumbs(zone, category ? { id: category.id, label: category.label } : undefined),
    {
      name: product.name,
      url: `${BASE_URL}/zona/${zone.slug}/producto/${productoSlug}`,
    },
  ];

  const price = product.price.toFixed(2);
  const otherZones = zones.filter((z) => z.slug !== zone.slug);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* JSON-LD: Product */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLD) }}
      />
      {/* JSON-LD: SoftwareApplication context */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateSoftwareApplicationLD(zone)),
        }}
      />
      {/* JSON-LD: Related products list */}
      {relatedProducts.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              generateItemListLD(
                `Productos relacionados en ${zone.name}`,
                relatedItems,
              ),
            ),
          }}
        />
      )}

      {/* Breadcrumbs */}
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Main product section */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-8 items-start">
        {/* Product image */}
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
          <Image
            src={product.image}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-contain p-6"
          />
          {product.badge && (
            <span className="absolute top-3 left-3 rounded-full bg-[#f4a261] px-3 py-1 text-xs font-semibold text-white shadow">
              {product.badge}
            </span>
          )}
        </div>

        {/* Product details */}
        <div className="flex flex-col gap-4">
          {/* Category pill */}
          {category && (() => {
            const CatIcon = getCatalogCategoryIcon(category.id);
            return (
              <Link
                href={`/zona/${zone.slug}/${category.id}`}
                className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-slate-900 dark:hover:border-slate-400 transition-colors"
              >
                <CatIcon className="h-3 w-3" strokeWidth={1.75} />
                {category.label}
              </Link>
            );
          })()}

          {/* H1 */}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-50 leading-tight">
            {product.name}
          </h1>

          {/* Zone badge */}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Disponible en{" "}
            <span className="font-medium text-[#2d6a4f]">{zone.name}</span>
            {", "}
            {zone.region}
          </p>

          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-[#2d6a4f]">
              S/{price}
            </span>
            <span className="text-base text-slate-400 dark:text-slate-500">
              / {product.unit ?? "und"}
            </span>
          </div>

          {/* Description */}
          {product.description && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {product.description}
            </p>
          )}

          {/* CTA: Add to cart or go to store */}
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Link
              href={`/tienda/${productoSlug}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2d6a4f] px-6 py-3 text-white font-semibold shadow-md hover:bg-[#245c44] active:scale-95 transition-all"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              Agregar al carrito
            </Link>
            <Link
              href={`/tienda`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3 text-slate-700 dark:text-slate-200 font-medium hover:border-[#2d6a4f]/50 hover:text-[#2d6a4f] transition-colors"
            >
              Ver tienda completa
            </Link>
          </div>

          {/* Zone delivery note */}
          {zone.deliveryActive && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Delivery disponible en {zone.name}
            </p>
          )}
        </div>
      </div>

      {/* ── Zone availability strip ──────────────────────────────────── */}
      <section className="mt-10 p-5 rounded-2xl bg-[#2d6a4f]/5 border border-[#2d6a4f]/10">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-3">
          Tiendas que venden {product.name} en {zone.name}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Con Buleje puedes encontrar{" "}
          <strong>{product.name}</strong> en bodegas de{" "}
          {zone.districts.join(", ")} y toda la zona de {zone.name}.
          Los precios y disponibilidad son gestionados en tiempo real
          por cada bodega a través del software ERP Buleje.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {zone.districts.map((district) => (
            <span
              key={district}
              className="rounded-full border border-[#2d6a4f]/20 bg-white dark:bg-slate-900 px-3 py-1 text-xs text-slate-600 dark:text-slate-400"
            >
              {district}
            </span>
          ))}
        </div>
      </section>

      {/* ── CTA Platform ─────────────────────────────────────────────── */}
      <div className="mt-8 p-6 rounded-2xl bg-[#2d6a4f] text-white text-center">
        <h2 className="text-lg font-bold">
          ¿Tienes una bodega en {zone.name}?
        </h2>
        <p className="mt-1 text-sm text-white/80">
          Vende {product.name} y miles de productos con Buleje ERP.
          Inventario, POS, delivery y SUNAT todo en uno.
        </p>
        <Link
          href="/registro"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#f4a261] px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-[#e08a4a] transition-colors"
        >
          Prueba Buleje gratis
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </Link>
        <p className="mt-2 text-xs text-white/50">
          Sin tarjeta de credito. Empieza en 5 minutos.
        </p>
      </div>

      {/* ── Related products in same category ────────────────────────── */}
      {relatedProducts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">
            {category ? `Más ${category.label.toLowerCase()} en ${zone.name}` : `Más productos en ${zone.name}`}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {relatedProducts.map((p) => (
              <RelatedProductCard
                key={p.id}
                product={{ name: p.name, price: p.price, image: p.image, unit: p.unit ?? "und" }}
                zoneSlug={zone.slug}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Same product in other zones (cross-link SEO) ─────────────── */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          {product.name} en otras ciudades
        </h2>
        <div className="flex flex-wrap gap-2">
          {otherZones.map((z) => (
            <Link
              key={z.slug}
              href={`/zona/${z.slug}/producto/${productoSlug}`}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-[#2d6a4f] transition-colors"
            >
              {product.name} en {z.name}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Other categories in this zone ────────────────────────────── */}
      {category && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Más categorias en {zone.name}
          </h2>
          <div className="flex flex-wrap gap-2">
            {realCategories
              .filter((c) => c.id !== category.id)
              .map((c) => {
                const CIcon = getCatalogCategoryIcon(c.id);
                return (
                  <Link
                    key={c.id}
                    href={`/zona/${zone.slug}/${c.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-slate-900 dark:hover:border-slate-400 transition-colors"
                  >
                    <CIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {c.label}
                  </Link>
                );
              })}
          </div>
        </section>
      )}

      {/* ── SEO footer ───────────────────────────────────────────────── */}
      <footer className="mt-10 border-t border-slate-100 dark:border-slate-800 pt-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          {product.name} disponible en {zone.name}, {zone.region}.
          Precio S/{price} por {product.unit ?? "und"}.
          Gestionado con Buleje, el software ERP para bodegas y tiendas
          creado en Pucallpa, Perú. Inventario, ventas POS, delivery,
          fiado digital y facturación SUNAT. Disponible en todo el Perú.
        </p>
      </footer>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────
export default function ZoneProductPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="animate-pulse text-sm text-slate-400">
            Cargando producto...
          </div>
        </div>
      }
    >
      <ZoneProductContentWrapper params={params} />
    </Suspense>
  );
}

async function ZoneProductContentWrapper({
  params,
}: {
  params: Promise<{ ciudad: string; slug: string }>;
}) {
  const { ciudad, slug } = await params;
  return <ZoneProductContent ciudad={ciudad} productoSlug={slug} />;
}
