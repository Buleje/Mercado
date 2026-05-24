/**
 * /zona/[ciudad]/[categoria] — City x Category page for Programmatic SEO
 *
 * Buleje = Software SaaS ERP para bodegas y tiendas de todo Perú.
 *
 * Targets: "vender abarrotes con software Pucallpa",
 *          "sistema para bodega de bebidas Lima"
 *
 * Shows the product catalog a bodega could sell using Buleje.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { headers } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import { categories, slugify } from "@/data/products";
import { zones, findZone, getZoneFAQs } from "@/data/zones";
import { ProductsDB } from "@/lib/db/products.db";
import { getCatalogCategoryIcon } from "@/lib/catalog/catalog-icons";
import {
  generateItemListLD,
  generateFAQPageLD,
  generateSoftwareApplicationLD,
  zoneBreadcrumbs,
} from "@/lib/seo/json-ld";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";

const realCategories = categories.filter((c) => c.id !== "todos");

interface Props {
  params: Promise<{ ciudad: string; categoria: string }>;
}

// ── Static params: zone × category combos ───────────────────────────
export function generateStaticParams() {
  const combos: { ciudad: string; categoria: string }[] = [];
  for (const zone of zones) {
    for (const cat of realCategories) {
      combos.push({ ciudad: zone.slug, categoria: cat.id });
    }
  }
  return combos;
}

// ── Cached products for category ────────────────────────────────────
async function getCategoryProducts(tenantId: string, categoryId: string) {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag(
    "zone-cat-products",
    `zone-cat-products:${tenantId}:${categoryId}`,
  );

  const allProducts = await ProductsDB.getAll(tenantId);
  return allProducts.filter(
    (p) => p.category === categoryId && p.active !== false,
  );
}

// ── Metadata ────────────────────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ciudad, categoria } = await params;
  const zone = findZone(ciudad);
  const cat = realCategories.find((c) => c.id === categoria);
  if (!zone || !cat) return { title: "No encontrado" };

  const title = `Vender ${cat.label} en ${zone.name} — Buleje ERP para Bodegas`;
  const description = `Usa Buleje para gestionar ${cat.label.toLowerCase()} en tu bodega de ${zone.name}. Inventario, precios, delivery y facturación SUNAT integrados. Software gratuito para empezar.`;
  const url = `${BASE_URL}/zona/${zone.slug}/${cat.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { "es-PE": url, "x-default": url },
    },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      locale: "es_PE",
      siteName: "Buleje",
    },
    twitter: {
      card: "summary",
      title: `${cat.label} con Buleje en ${zone.name}`,
      description,
    },
  };
}

// ── Product card ────────────────────────────────────────────────────
function ProductSEOCard({
  product,
}: {
  product: {
    name: string;
    price: number;
    image: string;
    unit: string;
    slug: string;
  };
}) {
  return (
    <Link
      href={`/tienda/${product.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm transition-all hover:shadow-md hover:border-emerald-300"
    >
      <div className="relative aspect-square bg-slate-50">
        <Image
          src={product.image}
          alt={`${product.name} — gestiona con Buleje`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-contain p-3 group-hover:scale-105 transition-transform"
        />
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="text-sm font-medium text-slate-800 line-clamp-2 group-hover:text-[var(--data-success-700)] transition-colors">
          {product.name}
        </h3>
        <div className="mt-auto pt-2 flex items-baseline gap-1">
          <span className="text-lg font-bold text-[var(--data-success-700)]">
            S/{Number(product.price).toFixed(2)}
          </span>
          <span className="text-xs text-slate-400">/{product.unit}</span>
        </div>
      </div>
    </Link>
  );
}

// ── Main async content ──────────────────────────────────────────────
async function CategoryZoneContent({
  ciudad,
  categoria,
}: {
  ciudad: string;
  categoria: string;
}) {
  const zone = findZone(ciudad);
  const cat = realCategories.find((c) => c.id === categoria);
  if (!zone || !cat) notFound();

  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";
  const products = await getCategoryProducts(tenantId, cat.id);

  const productItems = products.map((p) => ({
    name: p.name,
    price: p.price,
    image: p.image,
    url: `${BASE_URL}/tienda/${slugify(p.name)}`,
    unit: p.unit ?? "und",
    slug: slugify(p.name),
  }));

  const faqs = getZoneFAQs(zone);
  const breadcrumbs = zoneBreadcrumbs(zone, { id: cat.id, label: cat.label });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            generateSoftwareApplicationLD(zone),
          ),
        }}
      />
      {products.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              generateItemListLD(
                `${cat.label} en ${zone.name} — Buleje`,
                productItems,
              ),
            ),
          }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateFAQPageLD(faqs)),
        }}
      />

      {/* Breadcrumbs */}
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Hero H1 */}
      <header className="mb-8">
        <div className="inline-block rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-medium text-[var(--data-success-700)] mb-2">
          Buleje ERP
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          {cat.label} en {zone.name}
        </h1>
        <p className="mt-2 text-slate-600">
          {products.length > 0
            ? `${products.length} productos de ${cat.label.toLowerCase()} que puedes vender con Buleje en ${zone.name}.`
            : `Gestiona ${cat.label.toLowerCase()} en tu bodega de ${zone.name} con Buleje.`}
          {" "}Inventario, precios y delivery integrados.
        </p>
      </header>

      {/* Product grid */}
      {products.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {productItems.map((p) => (
            <ProductSEOCard key={p.slug} product={p} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 rounded-2xl border border-dashed border-slate-200 bg-slate-50">
          <p className="text-slate-500">
            Empieza a vender {cat.label.toLowerCase()} con Buleje en{" "}
            {zone.name}.
          </p>
          <Link
            href="/registro"
            className="mt-4 inline-block rounded-lg bg-[var(--data-success-600)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--data-success-700)]"
          >
            Registrate gratis
          </Link>
        </div>
      )}

      {/* CTA */}
      <div className="mt-8 p-6 rounded-2xl bg-emerald-50 border border-emerald-100 text-center">
        <h2 className="text-lg font-bold text-slate-800">
          Empieza a vender {cat.label.toLowerCase()} online
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Buleje te da inventario, POS, delivery y facturación SUNAT
          todo en un solo lugar.
        </p>
        <Link
          href="/registro"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--data-success-600)] px-6 py-2.5 text-sm text-white font-semibold shadow hover:bg-[var(--data-success-700)] transition-colors"
        >
          Probar gratis
        </Link>
      </div>

      {/* Cross-links to other categories */}
      <section className="mt-10">
        <h2 className="text-lg font-bold text-slate-800 mb-4">
          Más categorias en {zone.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          {realCategories
            .filter((c) => c.id !== cat.id)
            .map((c) => {
              const CIcon = getCatalogCategoryIcon(c.id);
              return (
                <Link
                  key={c.id}
                  href={`/zona/${zone.slug}/${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900 transition-colors"
                >
                  <CIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {c.label}
                </Link>
              );
            })}
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-10">
        <h2 className="text-lg font-bold text-slate-800 mb-4">
          Preguntas frecuentes
        </h2>
        <div className="space-y-3">
          {faqs.slice(0, 3).map((faq) => (
            <details
              key={faq.question}
              className="group rounded-xl border border-slate-200 bg-white"
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700 hover:text-[var(--data-success-700)] transition-colors list-none flex items-center justify-between">
                {faq.question}
                <svg
                  className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <p className="px-4 pb-3 text-sm text-slate-600">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Other zones */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Buleje en otras ciudades
        </h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {zones
            .filter((z) => z.slug !== zone.slug)
            .slice(0, 6)
            .map((z) => (
              <Link
                key={z.slug}
                href={`/zona/${z.slug}/${cat.id}`}
                className="text-xs text-slate-400 hover:text-[var(--data-success-600)] transition-colors"
              >
                {cat.label} en {z.name}
              </Link>
            ))}
        </div>
      </section>

      {/* SEO footer */}
      <footer className="mt-10 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          Buleje es un software ERP para bodegas y tiendas creado en
          Pucallpa, Perú. Gestiona {cat.label.toLowerCase()} y todas las
          categorias de tu negocio en {zone.name} con inventario, POS,
          delivery, fiado digital y facturación SUNAT. Disponible en todo
          el Perú.
        </p>
      </footer>
    </div>
  );
}

// ── Page component ──────────────────────────────────────────────────
export default function ZonaCategoriaPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="animate-pulse text-sm text-slate-400">
            Cargando productos...
          </div>
        </div>
      }
    >
      <CategoryZoneContentWrapper params={params} />
    </Suspense>
  );
}

async function CategoryZoneContentWrapper({
  params,
}: {
  params: Promise<{ ciudad: string; categoria: string }>;
}) {
  const { ciudad, categoria } = await params;
  return <CategoryZoneContent ciudad={ciudad} categoria={categoria} />;
}
