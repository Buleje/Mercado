/**
 * /zona/[ciudad] — City landing page for Programmatic SEO
 *
 * Targets: "bodega delivery Pucallpa", "tienda online Pucallpa"
 *
 * Renders category grid with product counts, FAQ section,
 * JSON-LD (GroceryStore + FAQPage), optimized meta tags.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import { categories } from "@/data/products";
import { zones, findZone, getZoneFAQs } from "@/data/zones";
import { ProductsDB } from "@/lib/db/products.db";
import { generateOfferCatalogLD, generateFAQPageLD } from "@/lib/seo/json-ld";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";

const realCategories = categories.filter((c) => c.id !== "todos");

interface Props {
  params: Promise<{ ciudad: string }>;
}

// ── Static params for all zones ─────────────────────────────────────
export function generateStaticParams() {
  return zones.map((z) => ({ ciudad: z.slug }));
}

// ── Cached product count per category ───────────────────────────────
async function getCategoryCounts(tenantId: string) {
  "use cache";
  cacheLife({ revalidate: 600, stale: 120, expire: 1800 });
  cacheTag("zone-category-counts", `zone-category-counts:${tenantId}`);

  const allProducts = await ProductsDB.getAll(tenantId);
  const active = allProducts.filter((p) => p.active !== false);
  const counts: Record<string, number> = {};

  for (const cat of realCategories) {
    counts[cat.id] = active.filter((p) => p.category === cat.id).length;
  }
  counts._total = active.length;
  return counts;
}

// ── Metadata ────────────────────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ciudad } = await params;
  const zone = findZone(ciudad);
  if (!zone) return { title: "Zona no encontrada" };

  const title = `Bodega Online en ${zone.name} — Delivery de Abarrotes, Bebidas y Mas | Buleje`;
  const description = `Compra abarrotes, bebidas, carnes, frutas y productos de limpieza con delivery rapido en ${zone.name}. Precios de bodega, paga con Yape o efectivo. ${zone.districts.join(", ")}.`;
  const url = `${BASE_URL}/zona/${zone.slug}`;

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
      title: `Bodega delivery en ${zone.name} | Buleje`,
      description,
    },
  };
}

// ── Category card ───────────────────────────────────────────────────
function CategoryCard({
  category,
  count,
  zoneName,
  zoneSlug,
}: {
  category: { id: string; label: string; emoji: string };
  count: number;
  zoneName: string;
  zoneSlug: string;
}) {
  return (
    <Link
      href={`/zona/${zoneSlug}/${category.id}`}
      className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-emerald-300 hover:-translate-y-0.5"
    >
      <span className="text-4xl" role="img" aria-label={category.label}>
        {category.emoji}
      </span>
      <h2 className="text-lg font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors">
        {category.label}
      </h2>
      <p className="text-sm text-slate-500">
        {count} {count === 1 ? "producto" : "productos"} en {zoneName}
      </p>
    </Link>
  );
}

// ── FAQ Section ─────────────────────────────────────────────────────
function FAQSection({ zone }: { zone: (typeof zones)[0] }) {
  const faqs = getZoneFAQs(zone);

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-slate-800 mb-4">
        Preguntas frecuentes sobre delivery en {zone.name}
      </h2>
      <div className="space-y-4">
        {faqs.map((faq) => (
          <details
            key={faq.question}
            className="group rounded-xl border border-slate-200 bg-white"
          >
            <summary className="cursor-pointer px-5 py-4 font-medium text-slate-700 hover:text-emerald-700 transition-colors list-none flex items-center justify-between">
              {faq.question}
              <svg
                className="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180"
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
            <p className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── Main async content ──────────────────────────────────────────────
async function ZoneContent({ ciudad }: { ciudad: string }) {
  const zone = findZone(ciudad);
  if (!zone) notFound();

  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";
  const counts = await getCategoryCounts(tenantId);
  const faqs = getZoneFAQs(zone);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            generateOfferCatalogLD(zone, realCategories),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateFAQPageLD(faqs)),
        }}
      />

      {/* Breadcrumbs */}
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: BASE_URL },
          { name: zone.name, url: `${BASE_URL}/zona/${zone.slug}` },
        ]}
      />

      {/* Hero H1 */}
      <header className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
          Bodega Online en {zone.name}
        </h1>
        <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
          {zone.description}
        </p>
        <p className="mt-2 text-sm text-emerald-600 font-medium">
          Delivery en {zone.districts.join(", ")} — Gratis desde S/50
        </p>
      </header>

      {/* Category grid */}
      <section>
        <h2 className="sr-only">
          Categorias de productos en {zone.name}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {realCategories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              count={counts[cat.id] ?? 0}
              zoneName={zone.name}
              zoneSlug={zone.slug}
            />
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          {counts._total ?? 0} productos disponibles con delivery en{" "}
          {zone.name}
        </p>
      </section>

      {/* CTA */}
      <div className="mt-8 text-center">
        <Link
          href="/tienda"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-white font-semibold shadow-md hover:bg-emerald-700 transition-colors"
        >
          Ver todos los productos
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
      </div>

      {/* FAQ */}
      <FAQSection zone={zone} />

      {/* SEO footer text */}
      <footer className="mt-12 border-t border-slate-100 pt-6">
        <p className="text-xs text-slate-400 leading-relaxed">
          Buleje es tu bodega de confianza en {zone.name}, {zone.region}.
          Hacemos delivery de abarrotes, bebidas, carnes, frutas, verduras,
          lacteos y productos de limpieza a los distritos de{" "}
          {zone.districts.join(", ")}. Precios de bodega sin sobrecostos.
          Paga con Yape, Plin o efectivo contra entrega.
        </p>
      </footer>
    </div>
  );
}

// ── Page component ──────────────────────────────────────────────────
export default function ZonaCiudadPage({ params }: Props) {
  // We need to unwrap the promise synchronously for Suspense to work
  // Use an inner async component that awaits params
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="animate-pulse text-sm text-slate-400">
            Cargando productos de tu zona...
          </div>
        </div>
      }
    >
      <ZoneContentWrapper params={params} />
    </Suspense>
  );
}

async function ZoneContentWrapper({
  params,
}: {
  params: Promise<{ ciudad: string }>;
}) {
  const { ciudad } = await params;
  return <ZoneContent ciudad={ciudad} />;
}
