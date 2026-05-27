/**
 * /zona/[ciudad]/distrito/[distrito] — District landing page for Programmatic SEO
 *
 * Hyperlocal extension of `/zona/[ciudad]` — vemos el ERP Buleje a nivel
 * distrital para capturar busquedas tipo "bodega en Yarinacocha",
 * "abarrotes delivery Los Olivos", "software tienda Cercado Arequipa".
 *
 * Renders:
 *   - H1 con distrito + ciudad
 *   - Hero + descripcion hiperlocal (signal textual)
 *   - Grid de categorias (cada una linkea a distrito × categoria)
 *   - FAQ distrital
 *   - Cross-link a otros distritos de la misma ciudad
 *   - JSON-LD: SoftwareApplication + WebPage (districtLanding) + FAQPage + Breadcrumb
 *
 * Cache: `use cache` + cacheLife + cacheTag por tenantId (multi-tenant safe).
 *
 * ADR: docs/adr/060-programmatic-seo-districts.md
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { categories } from "@/data/products";
import { getCatalogCategoryIcon } from "@/lib/catalog/catalog-icons";
import { zones, findZone } from "@/data/zones";
import {
  districts,
  findDistrict,
  getDistrictsForCity,
  getDistrictFAQs,
} from "@/data/districts";
import {
  generateSoftwareApplicationLD,
  generateFAQPageLD,
  generateDistrictLandingLD,
  districtBreadcrumbs,
} from "@/lib/seo/json-ld";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";

const realCategories = categories.filter((c) => c.id !== "todos");

interface Props {
  params: Promise<{ ciudad: string; distrito: string }>;
}

// ── Static params for all district combos ───────────────────────────
export function generateStaticParams() {
  return districts.map((d) => ({ ciudad: d.cityslug, distrito: d.slug }));
}

// ── Metadata ────────────────────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ciudad, distrito } = await params;
  const zone = findZone(ciudad);
  const district = findDistrict(ciudad, distrito);
  if (!zone || !district) return { title: "Distrito no encontrado" };

  // Title B2C-first (2026-05-27): lidera con comprar/delivery local del distrito.
  const title = `Bodegas, restaurantes y delivery en ${district.name}, ${zone.name}`;
  const description = `Pedí comida, abarrotes y productos en ${district.name} (${zone.name}): bodegas, restaurantes, mercados y tiendas con delivery local rápido y pago con Yape, Plin o efectivo. ¿Tenés un negocio? Llevalo al sistema Buleje.`;
  const url = `${BASE_URL}/zona/${zone.slug}/distrito/${district.slug}`;

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
      title: `Bodegas con delivery en ${district.name} — Buleje`,
      description,
    },
  };
}

// ── Category card ───────────────────────────────────────────────────
function CategoryCard({
  category,
  districtName,
  citySlug,
  districtSlug,
}: {
  category: { id: string; label: string; emoji: string };
  districtName: string;
  citySlug: string;
  districtSlug: string;
}) {
   
  const CatIcon = getCatalogCategoryIcon(category.id);
  return (
    <Link
      href={`/zona/${citySlug}/distrito/${districtSlug}/${category.id}`}
      className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-900 hover:-translate-y-0.5"
    >
      <div className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700">
        <CatIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-base font-extrabold tracking-tight text-slate-800 group-hover:text-slate-900 transition-colors">
          {category.label}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {category.label} en {districtName}
        </p>
      </div>
    </Link>
  );
}

// ── FAQ ─────────────────────────────────────────────────────────────
function FAQSection({
  district,
  zoneName,
  faqs,
}: {
  district: { name: string };
  zoneName: string;
  faqs: { question: string; answer: string }[];
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold text-slate-800 mb-4">
        Preguntas frecuentes sobre Buleje en {district.name}, {zoneName}
      </h2>
      <div className="space-y-3">
        {faqs.map((faq) => (
          <details
            key={faq.question}
            className="group rounded-xl border border-slate-200 bg-white"
          >
            <summary className="cursor-pointer px-5 py-3 font-medium text-slate-700 hover:text-[var(--data-success-700)] transition-colors list-none flex items-center justify-between">
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
            <p className="px-5 pb-3 text-sm text-slate-600 leading-relaxed">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── Main content ────────────────────────────────────────────────────
async function DistrictContent({
  ciudad,
  distrito,
}: {
  ciudad: string;
  distrito: string;
}) {
  const zone = findZone(ciudad);
  const district = findDistrict(ciudad, distrito);
  if (!zone || !district) notFound();

  const faqs = getDistrictFAQs(district, zone);
  const siblingDistricts = getDistrictsForCity(zone.slug).filter(
    (d) => d.slug !== district.slug,
  );
  const otherZones = zones.filter((z) => z.slug !== zone.slug).slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateSoftwareApplicationLD(zone)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateDistrictLandingLD(district, zone)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateFAQPageLD(faqs)),
        }}
      />

      {/* Breadcrumbs */}
      <BreadcrumbSchema items={districtBreadcrumbs(district, zone)} />

      {/* Hero */}
      <header className="text-center mb-10">
        <div className="inline-block rounded-full bg-emerald-50 px-4 py-1 text-sm font-medium text-[var(--data-success-700)] mb-4">
          Bodegas en {district.name}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
          Buleje en {district.name}, {zone.name}
        </h1>
        <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
          {district.description}
        </p>
        <p className="mt-2 text-sm text-[var(--data-success-600)] font-medium">
          Parte de {zone.region} — delivery y POS disponibles.
        </p>
      </header>

      {/* CTA */}
      <div className="text-center mb-10">
        <Link
          href="/registro"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--data-success-600)] px-8 py-3 text-white font-semibold shadow-md hover:bg-[var(--data-success-700)] transition-colors"
        >
          Prueba Buleje gratis en {district.name}
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
        <p className="mt-2 text-xs text-slate-400">
          Sin tarjeta de credito. Empieza en 5 minutos.
        </p>
      </div>

      {/* Categories grid */}
      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">
          Productos que vendes en {district.name}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {realCategories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              districtName={district.name}
              citySlug={zone.slug}
              districtSlug={district.slug}
            />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <FAQSection district={district} zoneName={zone.name} faqs={faqs} />

      {/* Other districts in same city */}
      {siblingDistricts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Otros distritos de {zone.name}
          </h2>
          <div className="flex flex-wrap gap-2">
            {siblingDistricts.map((d) => (
              <Link
                key={d.slug}
                href={`/zona/${zone.slug}/distrito/${d.slug}`}
                className="text-sm text-slate-500 hover:text-[var(--data-success-600)] transition-colors"
              >
                {d.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Other zones */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Buleje en otras ciudades
        </h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {otherZones.map((z) => (
            <Link
              key={z.slug}
              href={`/zona/${z.slug}`}
              className="text-xs text-slate-400 hover:text-[var(--data-success-600)] transition-colors"
            >
              {z.name}
            </Link>
          ))}
        </div>
      </section>

      {/* SEO footer */}
      <footer className="mt-12 border-t border-slate-100 pt-6">
        <p className="text-xs text-slate-400 leading-relaxed">
          Buleje es el software ERP para bodegas de {district.name},{" "}
          {zone.name}, {zone.region}. Gestiona inventario, ventas POS,
          delivery, fiado digital con score de credito y facturación
          electrónica SUNAT. Compatible con Yape, Plin y efectivo. Creado
          en Pucallpa, Perú — disponible en todo el país.
        </p>
      </footer>
    </div>
  );
}

// ── Page component ──────────────────────────────────────────────────
export default function DistrictLandingPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="animate-pulse text-sm text-slate-400">
            Cargando información del distrito...
          </div>
        </div>
      }
    >
      <DistrictContentWrapper params={params} />
    </Suspense>
  );
}

async function DistrictContentWrapper({
  params,
}: {
  params: Promise<{ ciudad: string; distrito: string }>;
}) {
  const { ciudad, distrito } = await params;
  return <DistrictContent ciudad={ciudad} distrito={distrito} />;
}
