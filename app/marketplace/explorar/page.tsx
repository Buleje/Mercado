import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import ExplorarClient from "@/components/marketplace/explorar/ExplorarClient";
import JsonLd from "@/components/JsonLd";
import { BRAND_GEO } from "@/lib/geo";

const BASE_URL = "https://www.buleje.pe";

// JSON-LD (2026-05-27): Breadcrumb + CollectionPage para el hub de descubrimiento.
const explorarBreadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
    { "@type": "ListItem", position: 2, name: "Marketplace", item: `${BASE_URL}/marketplace` },
    { "@type": "ListItem", position: 3, name: "Explorar", item: `${BASE_URL}/marketplace/explorar` },
  ],
};

const explorarCollectionLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${BASE_URL}/marketplace/explorar`,
  name: `Explorar el catálogo de Buleje ${BRAND_GEO.city}`,
  description:
    `Bodegas, ofertas, categorías y ocasiones de todo ${BRAND_GEO.city} en un solo lugar. Delivery rápido, pago con Yape, Plin o efectivo.`,
  url: `${BASE_URL}/marketplace/explorar`,
  inLanguage: "es-PE",
  isPartOf: { "@type": "WebSite", name: "Buleje", url: BASE_URL },
};

export const metadata: Metadata = {
  title: "Explorar — Todo el catálogo de Buleje",
  description:
    `Descubri bodegas, ofertas, categorias y ocasiones en un solo lugar. Tu hub de compras en ${BRAND_GEO.city} con delivery rápido y pago Yape o efectivo.`,
  alternates: {
    canonical: `${BASE_URL}/marketplace/explorar`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Explorar — Todo el catálogo de Buleje",
    description:
      `Descubri bodegas, ofertas y categorias de todo ${BRAND_GEO.city} en un solo lugar. Delivery rápido, pago Yape o efectivo.`,
    url: `${BASE_URL}/marketplace/explorar`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: `Explorá el catálogo de Buleje ${BRAND_GEO.city}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Explorar — Todo el catálogo de Buleje",
    description: `Bodegas, ofertas y categorías de todo ${BRAND_GEO.city} en un solo lugar. Delivery rápido, pago Yape o efectivo.`,
    images: ["/api/og"],
  },
};

/**
 * /marketplace/explorar — Hub centro de descubrimiento.
 *
 * Pagina estilo Amazon homepage adaptada a Buleje (minimalista Holded).
 * Hereda el MarketplaceNavbar del layout padre, que expone el link
 * "Explorar" entre "Bodegas" y "Recetas".
 *
 * Ilustraciones exclusivamente del DS (25+ componentes monoline) — cero
 * fotos stock, cero emojis, cero colores saturados.
 *
 * Audit 2026-05-17 02-P2-1 (TD-055): `"use cache"` aquí caché el shell
 * del page (metadata + JSX) pero el contenido real es <ExplorarClient />
 * client-side (306 LOC). El cache reduce la latencia inicial del render
 * pero NO elimina el bundle JS que se hidrata. Para verdadero beneficio
 * server-cache:
 *   1. Mover los fetches de datos a server (categorías, deals, banners)
 *   2. Pasar data como props serializable al client component
 *   3. ExplorarClient queda como island reducido (solo interactividad)
 * Refactor pendiente — requiere coordinación con design system (illustration
 * components ya son client). Defer a sprint dedicado.
 */
export default async function ExplorarPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace-explorar");
  return (
    <>
      <JsonLd data={explorarBreadcrumbLd} />
      <JsonLd data={explorarCollectionLd} />
      {/*
        SEO 2026-05-28 audit: ExplorarClient (client) renderiza el H1 visual.
        SSR initial HTML no tenía H1 → ranking penalizado. H1 sr-only desde
        el server con keyword de búsqueda principal.
      */}
      <h1 className="sr-only">
        {`Explora bodegas, restaurantes y farmacias en ${BRAND_GEO.city} — Buleje`}
      </h1>
      <ExplorarClient />
    </>
  );
}
