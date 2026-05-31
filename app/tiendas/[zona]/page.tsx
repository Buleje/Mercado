import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import TiendasClient from "../TiendasClient";
import { MARKETPLACE_ZONES } from "@/lib/marketplace-zones";

const BASE_URL = "https://www.buleje.pe";

/**
 * /tiendas/[zona] — Rutas SEO por zona (TS-43).
 *
 * Captura long-tail "bodegas en yarinacocha", "tiendas en manantay", etc.
 * Reusa TiendasClient pero sembrando la zona desde el segmento.
 *
 * Sprint 5 marketplace blueprint. Zonas del catálogo canónico
 * (lib/marketplace-zones.ts) — agregar zonas allí genera rutas SEO nuevas.
 */

const ZONES = MARKETPLACE_ZONES.map((z) => ({ id: z.id, label: z.label, city: z.city }));

type ZoneSlug = string;

export function generateStaticParams() {
  return ZONES.map((z) => ({ zona: z.id }));
}

interface PageProps {
  params: Promise<{ zona: string }>;
}

function findZone(slug: string) {
  return ZONES.find((z) => z.id === slug);
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { zona } = await props.params;
  const z = findZone(zona);
  if (!z) return { title: "Tiendas no encontradas | Buleje" };

  const title = `Bodegas y tiendas en ${z.label} — ${z.city} | Buleje`;
  const description = `Descubre las bodegas, minimarkets y tiendas con delivery rápido en ${z.label}, ${z.city}. Paga con Yape o efectivo. Recibe en 25 min.`;
  const url = `${BASE_URL}/tiendas/${z.id}`;

  return {
    title,
    description,
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

export default async function TiendasZonaPage(props: PageProps) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`tiendas-zona`);
  const { zona } = await props.params;
  const z = findZone(zona);
  if (!z) notFound();

  // ── Breadcrumb + ItemList JSON-LD ────────────────────────────────
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio",   item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Tiendas",  item: `${BASE_URL}/tiendas` },
      { "@type": "ListItem", position: 3, name: z.label },
    ],
  };

  const localBusinessLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Tiendas en ${z.label}`,
    description: `Directorio de bodegas y tiendas con delivery en ${z.label}, ${z.city}.`,
    url: `${BASE_URL}/tiendas/${z.id}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }}
      />
      <TiendasClient initialZone={z.id as ZoneSlug} />
    </>
  );
}
