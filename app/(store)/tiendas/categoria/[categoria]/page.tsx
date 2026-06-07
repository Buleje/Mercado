import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import TiendasClient from "../../TiendasClient";
import { CATEGORIAS } from "@/lib/constants/marketplace-categories";
import { BRAND_GEO } from "@/lib/geo";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";

const BASE_URL = "https://www.buleje.pe";

/**
 * /tiendas/categoria/[categoria] — Rutas SEO por categoría (Brandon 2026-06-02).
 *
 * Captura long-tail local: "abarrotes con delivery en Ciudad Constitución",
 * "farmacia delivery ciudad constitución", "carnes a domicilio", etc. Reusa
 * TiendasClient sembrando la categoría desde el segmento (initialCategory).
 *
 * Las categorías canónicas viven en lib/constants/marketplace-categories.ts —
 * agregar una allí genera una ruta SEO nueva (slug estable; renombrar requiere
 * redirect para no romper indexación).
 */

const CAT_LIST = Object.values(CATEGORIAS);

export function generateStaticParams() {
  return CAT_LIST.map((c) => ({ categoria: c.slug }));
}

interface PageProps {
  params: Promise<{ categoria: string }>;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { categoria } = await props.params;
  const cat = CATEGORIAS[categoria];
  if (!cat) return { title: "Categoría no encontrada | Buleje" };

  const city = BRAND_GEO.city;
  // El layout aplica un template `%s | Buleje` al <title>, así que NO repetimos
  // la marca acá (evita "... | Buleje | Buleje"). El OG title sí la lleva abajo.
  const title = `${cat.label} con delivery en ${city}`;
  const description = `${cat.subtitle} Pedí con Yape o efectivo y recibí a domicilio en ${city}.`.slice(0, 158);
  const url = `${BASE_URL}/tiendas/categoria/${cat.slug}`;

  return {
    title,
    description,
    keywords: [
      `${cat.label.toLowerCase()} ${city.toLowerCase()}`,
      `${cat.label.toLowerCase()} delivery`,
      `delivery ${cat.label.toLowerCase()} a domicilio`,
      ...cat.keywords,
    ],
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: "Buleje",
      locale: "es_PE",
      type: "website",
    },
  };
}

export default async function TiendasCategoriaPage(props: PageProps) {
  "use cache";
  cacheLife("minutes");
  cacheTag("tiendas-categoria");

  const { categoria } = await props.params;
  const cat = CATEGORIAS[categoria];
  if (!cat) notFound();

  const city = BRAND_GEO.city;
  const url = `${BASE_URL}/tiendas/categoria/${cat.slug}`;

  // ── JSON-LD: Breadcrumb + CollectionPage ──────────────────────────────────
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Tiendas", item: `${BASE_URL}/tiendas` },
      { "@type": "ListItem", position: 3, name: cat.label, item: url },
    ],
  };

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${cat.label} con delivery en ${city}`,
    description: cat.subtitle,
    url,
    isPartOf: { "@type": "WebSite", name: "Buleje", url: BASE_URL },
    about: { "@type": "Thing", name: cat.label },
  };

  // Cross-links a otras categorías — internal linking para SEO.
  const otras = CAT_LIST.filter((c) => c.slug !== cat.slug);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(collectionLd) }} />

      {/* ── Header SEO server-rendered: H1 único + intro + cross-links ──
           Contenido único por categoría (Google lo lee) + enlaces internos a
           las otras categorías (descubrimiento + PageRank). */}
      <section className="mx-auto max-w-[1760px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
          {cat.kicker} · {city}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
          {cat.label} con delivery en{" "}
          <span className="text-[var(--accent)]">{city}</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-snug text-[var(--text-secondary)] sm:text-base">
          {cat.subtitle}
        </p>
        {/* Cross-links a otras categorías */}
        <nav aria-label="Otras categorías" className="mt-4 flex flex-wrap gap-2">
          {otras.map((c) => (
            <Link
              key={c.slug}
              href={`/tiendas/categoria/${c.slug}`}
              className="inline-flex items-center rounded-full border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3.5 py-1.5 text-sm font-bold text-[var(--text-secondary)] transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
            >
              {c.label}
            </Link>
          ))}
        </nav>
      </section>

      {/* Directorio filtrado por la categoría (reusa toda la UX de /tiendas). */}
      <TiendasClient initialCategory={cat.slug} />
    </>
  );
}
