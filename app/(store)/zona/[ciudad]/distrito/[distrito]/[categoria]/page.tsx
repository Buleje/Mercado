/**
 * /zona/[ciudad]/distrito/[distrito]/[categoria] — District × Category page
 *
 * Maxima granularidad SEO para Programmatic SEO:
 *   - 15 ciudades × ~3-7 distritos × 6 categorias = ~600+ paginas
 *
 * Targets:
 *   "abarrotes delivery Yarinacocha",
 *   "bebidas bodega Los Olivos",
 *   "carnes tienda Cercado Arequipa",
 *   "software para bodega de abarrotes en Callao".
 *
 * Renders:
 *   - H1 con categoria + distrito + ciudad
 *   - Hero + descripcion hiperlocal
 *   - Grid de productos de la categoria
 *   - JSON-LD: ItemList con `areaServed` Place distrital + SoftwareApplication
 *   - Cross-link a otras categorias del mismo distrito + misma categoria en otros distritos
 *
 * Cache: `use cache` con `cacheTag` por (tenantId, categoryId) — reusamos la
 * cache que ya carga `/zona/[ciudad]/[categoria]` de la misma categoria.
 *
 * ADR: docs/adr/060-programmatic-seo-districts.md
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { headers } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import { categories, slugify } from "@/data/products";
import { findZone } from "@/data/zones";
import { getCatalogCategoryIcon } from "@/lib/catalog/catalog-icons";
import {
  districts,
  findDistrict,
  getDistrictsForCity,
  getDistrictFAQs,
} from "@/data/districts";
import { ProductsDB } from "@/lib/db/products.db";
import {
  generateSoftwareApplicationLD,
  generateFAQPageLD,
  generateDistrictCategoryLD,
  districtBreadcrumbs,
} from "@/lib/seo/json-ld";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";

const realCategories = categories.filter((c) => c.id !== "todos");

interface Props {
  params: Promise<{ ciudad: string; distrito: string; categoria: string }>;
}

// ── Static params: district × category combos ───────────────────────
export function generateStaticParams() {
  const combos: { ciudad: string; distrito: string; categoria: string }[] = [];
  for (const d of districts) {
    for (const cat of realCategories) {
      combos.push({
        ciudad: d.cityslug,
        distrito: d.slug,
        categoria: cat.id,
      });
    }
  }
  return combos;
}

// ── Cached product fetch ────────────────────────────────────────────
async function getCategoryProducts(tenantId: string, categoryId: string) {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag(
    "district-cat-products",
    `district-cat-products:${tenantId}:${categoryId}`,
  );

  const allProducts = await ProductsDB.getAll(tenantId);
  return allProducts.filter(
    (p) => p.category === categoryId && p.active !== false,
  );
}

// ── Metadata ────────────────────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ciudad, distrito, categoria } = await params;
  const zone = findZone(ciudad);
  const district = findDistrict(ciudad, distrito);
  const cat = realCategories.find((c) => c.id === categoria);
  if (!zone || !district || !cat) return { title: "No encontrado" };

  const title = `${cat.label} en ${district.name}, ${zone.name} — Buleje ERP`;
  const description = `Software para vender ${cat.label.toLowerCase()} en bodegas de ${district.name} (${zone.name}). Inventario, POS, delivery y boletas SUNAT integrados. Compatible con Yape, Plin y efectivo.`;
  const url = `${BASE_URL}/zona/${zone.slug}/distrito/${district.slug}/${cat.id}`;

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
    },
    twitter: {
      card: "summary",
      title: `${cat.label} — ${district.name}, ${zone.name}`,
      description,
    },
  };
}

// ── Product card ────────────────────────────────────────────────────
function ProductSEOCard({
  product,
  districtName,
}: {
  product: {
    name: string;
    price: number;
    image: string;
    unit: string;
    slug: string;
  };
  districtName: string;
}) {
  return (
    <Link
      href={`/tienda/${product.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm transition-all hover:shadow-md hover:border-emerald-300"
    >
      <div className="relative aspect-square bg-slate-50">
        <Image
          src={product.image}
          alt={`${product.name} en ${districtName}`}
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
            S/{product.price.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400">/{product.unit}</span>
        </div>
      </div>
    </Link>
  );
}

// ── Main content ────────────────────────────────────────────────────
async function DistrictCategoryContent({
  ciudad,
  distrito,
  categoria,
}: {
  ciudad: string;
  distrito: string;
  categoria: string;
}) {
  const zone = findZone(ciudad);
  const district = findDistrict(ciudad, distrito);
  const cat = realCategories.find((c) => c.id === categoria);
  if (!zone || !district || !cat) notFound();

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

  const faqs = getDistrictFAQs(district, zone);
  const breadcrumbs = districtBreadcrumbs(district, zone, {
    id: cat.id,
    label: cat.label,
  });

  const siblingDistricts = getDistrictsForCity(zone.slug).filter(
    (d) => d.slug !== district.slug,
  );
  const siblingCategories = realCategories.filter((c) => c.id !== cat.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateSoftwareApplicationLD(zone)),
        }}
      />
      {products.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              generateDistrictCategoryLD(
                district,
                zone,
                cat.label,
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

      {/* Hero */}
      <header className="mb-8">
        <div className="inline-block rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-medium text-[var(--data-success-700)] mb-2">
          Buleje ERP · Hiperlocal
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          {cat.label} en {district.name}, {zone.name}
        </h1>
        <p className="mt-2 text-slate-600">
          {products.length > 0
            ? `${products.length} productos de ${cat.label.toLowerCase()} que puedes vender con Buleje en ${district.name}.`
            : `Gestiona ${cat.label.toLowerCase()} en tu bodega de ${district.name}, ${zone.name} con Buleje.`}{" "}
          Inventario, precios y delivery integrados a nivel distrital.
        </p>
      </header>

      {/* Product grid */}
      {products.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {productItems.map((p) => (
            <ProductSEOCard
              key={p.slug}
              product={p}
              districtName={district.name}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 rounded-2xl border border-dashed border-slate-200 bg-slate-50">
          <p className="text-slate-500">
            Empieza a vender {cat.label.toLowerCase()} con Buleje en{" "}
            {district.name}, {zone.name}.
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
          ¿Tienes una bodega en {district.name}?
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Vende {cat.label.toLowerCase()} con Buleje ERP: inventario, POS,
          delivery y facturación SUNAT.
        </p>
        <Link
          href="/registro"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--data-success-600)] px-6 py-2.5 text-sm text-white font-semibold shadow hover:bg-[var(--data-success-700)] transition-colors"
        >
          Probar gratis en {district.name}
        </Link>
      </div>

      {/* Cross-links: sibling categories in same district */}
      <section className="mt-10">
        <h2 className="text-lg font-bold text-slate-800 mb-4">
          Más categorias en {district.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          {siblingCategories.map((c) => {
            const CIcon = getCatalogCategoryIcon(c.id);
            return (
              <Link
                key={c.id}
                href={`/zona/${zone.slug}/distrito/${district.slug}/${c.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900 transition-colors"
              >
                <CIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {c.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Cross-links: same category in sibling districts */}
      {siblingDistricts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {cat.label} en otros distritos de {zone.name}
          </h2>
          <div className="flex flex-wrap gap-2">
            {siblingDistricts.map((d) => (
              <Link
                key={d.slug}
                href={`/zona/${zone.slug}/distrito/${d.slug}/${cat.id}`}
                className="text-sm text-slate-500 hover:text-[var(--data-success-600)] transition-colors"
              >
                {cat.label} en {d.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Back to zone + district parent */}
      <section className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link
          href={`/zona/${zone.slug}/distrito/${district.slug}`}
          className="text-slate-500 hover:text-[var(--data-success-600)] transition-colors"
        >
          ← Volver a {district.name}
        </Link>
        <span className="text-slate-300">·</span>
        <Link
          href={`/zona/${zone.slug}`}
          className="text-slate-500 hover:text-[var(--data-success-600)] transition-colors"
        >
          Ver {zone.name} completo
        </Link>
      </section>

      {/* SEO footer */}
      <footer className="mt-10 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          Buleje te permite gestionar {cat.label.toLowerCase()} y todas las
          categorias en {district.name}, {zone.name}, {zone.region}.
          Inventario en tiempo real, POS, delivery, fiado digital con score
          y boletas electronicas SUNAT — todo desde el celular. Creado en
          Pucallpa, Perú.
        </p>
      </footer>
    </div>
  );
}

// ── Page component ──────────────────────────────────────────────────
export default function DistrictCategoryPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="animate-pulse text-sm text-slate-400">
            Cargando productos del distrito...
          </div>
        </div>
      }
    >
      <DistrictCategoryContentWrapper params={params} />
    </Suspense>
  );
}

async function DistrictCategoryContentWrapper({
  params,
}: {
  params: Promise<{ ciudad: string; distrito: string; categoria: string }>;
}) {
  const { ciudad, distrito, categoria } = await params;
  return (
    <DistrictCategoryContent
      ciudad={ciudad}
      distrito={distrito}
      categoria={categoria}
    />
  );
}
