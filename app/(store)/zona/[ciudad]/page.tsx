/**
 * /zona/[ciudad] — City landing page for Programmatic SEO
 *
 * Buleje = Software SaaS ERP para bodegas y tiendas de todo Peru.
 *
 * Targets: "software para bodegas Lima", "sistema ERP tienda Arequipa",
 *          "app de bodega Pucallpa", "gestion inventario tienda Peru"
 *
 * Renders category grid, platform features, FAQ, JSON-LD.
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
import {
  generateSoftwareApplicationLD,
  generateZoneLandingLD,
  generateFAQPageLD,
} from "@/lib/seo/json-ld";
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

  const title = `Software para Bodegas en ${zone.name} — Buleje ERP | Inventario, POS y Delivery`;
  const description = `Buleje: sistema ERP para bodegas y tiendas en ${zone.name}, ${zone.region}. Inventario en tiempo real, punto de venta POS, delivery, fiado digital y facturacion SUNAT. Funciona con Yape y efectivo.`;
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
      title: `Buleje — Software para Bodegas en ${zone.name}`,
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
        {count > 0
          ? `${count} productos disponibles`
          : "Categoria disponible"}
      </p>
    </Link>
  );
}

// ── Platform features section ───────────────────────────────────────
const FEATURES = [
  { icon: "📦", title: "Inventario", desc: "Control de stock en tiempo real con alertas" },
  { icon: "🛒", title: "Ventas POS", desc: "Punto de venta rapido desde celular o PC" },
  { icon: "🛵", title: "Delivery", desc: "Tus clientes piden y tu entregas a domicilio" },
  { icon: "💳", title: "Fiado Digital", desc: "Credito automatico con score para clientes" },
  { icon: "🧾", title: "SUNAT", desc: "Boletas y facturas electronicas integradas" },
  { icon: "📊", title: "Reportes", desc: "Resumen diario por WhatsApp con IA" },
];

function FeaturesGrid({ zoneName }: { zoneName: string }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-slate-800 mb-4">
        Todo lo que necesita tu bodega en {zoneName}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center"
          >
            <span className="text-2xl">{f.icon}</span>
            <h3 className="mt-1 text-sm font-semibold text-slate-700">
              {f.title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── FAQ Section ─────────────────────────────────────────────────────
function FAQSection({ zone }: { zone: (typeof zones)[0] }) {
  const faqs = getZoneFAQs(zone);

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-slate-800 mb-4">
        Preguntas frecuentes sobre Buleje en {zone.name}
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
                className="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180 shrink-0"
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
            generateSoftwareApplicationLD(zone),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            generateZoneLandingLD(zone, realCategories),
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
          { name: "Buleje", url: BASE_URL },
          { name: zone.name, url: `${BASE_URL}/zona/${zone.slug}` },
        ]}
      />

      {/* Hero H1 */}
      <header className="text-center mb-10">
        <div className="inline-block rounded-full bg-emerald-50 px-4 py-1 text-sm font-medium text-emerald-700 mb-4">
          Software ERP para Bodegas
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
          Buleje en {zone.name}
        </h1>
        <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
          {zone.description}
        </p>
        <p className="mt-2 text-sm text-emerald-600 font-medium">
          Disponible en {zone.districts.join(", ")} y todo {zone.region}
        </p>
      </header>

      {/* CTA principal */}
      <div className="text-center mb-10">
        <Link
          href="/registro"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-white font-semibold shadow-md hover:bg-emerald-700 transition-colors"
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
        <p className="mt-2 text-xs text-slate-400">
          Sin tarjeta de credito. Empieza en 5 minutos.
        </p>
      </div>

      {/* Category grid */}
      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">
          Categorias que puedes vender con Buleje
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
      </section>

      {/* Features */}
      <FeaturesGrid zoneName={zone.name} />

      {/* FAQ */}
      <FAQSection zone={zone} />

      {/* Other zones */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Buleje tambien esta en
        </h2>
        <div className="flex flex-wrap gap-2">
          {zones
            .filter((z) => z.slug !== zone.slug)
            .map((z) => (
              <Link
                key={z.slug}
                href={`/zona/${z.slug}`}
                className="text-sm text-slate-500 hover:text-emerald-600 transition-colors"
              >
                {z.name}
              </Link>
            ))}
        </div>
      </section>

      {/* SEO footer text */}
      <footer className="mt-12 border-t border-slate-100 pt-6">
        <p className="text-xs text-slate-400 leading-relaxed">
          Buleje es un software ERP creado en Pucallpa para bodegas y
          tiendas de todo el Peru. Disponible en {zone.name},{" "}
          {zone.region} y en mas de 10 ciudades del pais.
          Inventario, ventas POS, delivery, fiado digital, facturacion
          SUNAT y reportes automaticos por WhatsApp.
          Funciona con Yape, Plin y efectivo.
        </p>
      </footer>
    </div>
  );
}

// ── Page component ──────────────────────────────────────────────────
export default function ZonaCiudadPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="animate-pulse text-sm text-slate-400">
            Cargando informacion de tu zona...
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
