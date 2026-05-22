import type { Metadata } from "next";
import TiendasClient from "./TiendasClient";
import { getInitialMarketplaceStores } from "@/lib/marketplace/initial-stores";

const BASE_URL = "https://www.buleje.pe";

/**
 * Metadata enriquecida (Brandon 2026-05-20 SEO sprint).
 *
 * Decisiones:
 *   · Title focal: "Tiendas y bodegas …" — keyword head local + ciudad.
 *   · Description: 155 chars, incluye categorías (bodega, farmacia,
 *     restaurante), pagos peruanos (Yape) y promesa de delivery.
 *   · Open Graph: image apunta a /og/tiendas.png — si no existe el
 *     archivo, Vercel devuelve 404 silencioso y los crawlers caen al
 *     favicon. Mejor que omitir el campo.
 *   · Twitter Card: large image, mismo OG.
 *   · Robots: index, follow + max-image-preview large (mejor preview en
 *     Google Discover/imágenes).
 *   · Verification, alternates languages → omitido (single-locale).
 */
export const metadata: Metadata = {
  // El template del root layout agrega " | Buleje". No duplicar el sufijo
  // de marca aquí — Brandon 2026-05-20 SEO fix.
  title: "Tiendas y bodegas en Pucallpa · Delivery con Yape",
  // Brandon 2026-05-20 v2: 135 chars (target 70-155). Antes 159 chars
  // dispara warning de SEO auditors (Google trunca a ~155). Mantiene las
  // keywords clave (bodegas, farmacias, restaurantes, Pucallpa, delivery,
  // Yape, Plin) + cierre con valor agregado ("tu bodega del barrio, ahora
  // online" → conecta con la audiencia local).
  description:
    "Bodegas, farmacias y restaurantes de Pucallpa con delivery rápido. Paga con Yape, Plin o efectivo. Tu bodega del barrio, ahora online.",
  keywords: [
    "bodegas Pucallpa",
    "delivery Pucallpa",
    "tiendas Ucayali",
    "minimarket Pucallpa",
    "Yape Pucallpa",
    "comida a domicilio Pucallpa",
    "Ciudad Constitución",
    "marketplace Perú",
    "Buleje",
  ],
  alternates: {
    canonical: `${BASE_URL}/tiendas`,
    // Brandon 2026-05-21 SEO pro: hreflang es-PE + x-default. Google
    // entiende que es contenido localizado para Perú; usuarios en otros
    // países lo ven igual al no haber traducción.
    languages: {
      "es-PE": `${BASE_URL}/tiendas`,
      "x-default": `${BASE_URL}/tiendas`,
    },
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
  openGraph: {
    title: "Tiendas y bodegas en Pucallpa | Buleje",
    description:
      "Bodegas, farmacias y restaurantes de Pucallpa. Delivery rápido · Yape, Plin o efectivo.",
    url: `${BASE_URL}/tiendas`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
    images: [
      {
        url: `${BASE_URL}/brand/buleje-logo.png`,
        width: 1200,
        height: 630,
        alt: "Buleje — tiendas y bodegas en Pucallpa con delivery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tiendas y bodegas en Pucallpa | Buleje",
    description:
      "Bodegas, farmacias y restaurantes de Pucallpa. Delivery rápido · Yape, Plin o efectivo.",
    // Brandon 2026-05-20 v11 audit P2: twitter:image:alt requerido por
    // X/Twitter para accesibilidad de la preview cuando se comparte.
    images: [{
      url: `${BASE_URL}/brand/buleje-logo.png`,
      alt: "Buleje — tiendas y bodegas con delivery rápido en Pucallpa, Ucayali",
    }],
  },
};

/**
 * /tiendas — Directorio de tiendas del marketplace Buleje.
 *
 * Fix bug back-nav cross-layout (Next 16): pre-fetch de stores en el server
 * vía `getInitialMarketplaceStores` (con Cache Components + cacheTag) y los
 * pasamos como prop initial al client. El HTML server-rendered ya tiene la
 * lista materializada, así que aunque la hidratación cliente quede frozen
 * tras un back nav, los items siguen visibles.
 *
 * El client sigue haciendo su useEffect fetch para refrescar/filtrar; el prop
 * solo cubre el render inicial.
 *
 * SEO (Brandon 2026-05-20): inyectamos JSON-LD ItemList con las primeras 12
 * tiendas + CollectionPage schema. Server-side (sin coste JS para el cliente).
 * Google indexa cada tienda como un item del listing → rich results posibles.
 */
export default async function TiendasPage() {
  const initialStores = await getInitialMarketplaceStores();

  // ── JSON-LD: CollectionPage + ItemList con primeras 12 tiendas ──
  const topStores = initialStores.slice(0, 12);
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${BASE_URL}/tiendas`,
    url: `${BASE_URL}/tiendas`,
    name: "Tiendas y bodegas en Pucallpa",
    description:
      "Directorio de bodegas, farmacias y restaurantes locales en Pucallpa y Ciudad Constitución con delivery rápido.",
    inLanguage: "es-PE",
    isPartOf: {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: BASE_URL,
      name: "Buleje",
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: topStores.length,
      itemListElement: topStores.map((s, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        item: {
          "@type": "LocalBusiness",
          "@id": `${BASE_URL}/marketplace/${s.slug}`,
          name: s.name,
          url: `${BASE_URL}/marketplace/${s.slug}`,
          image: s.logo ?? s.cover ?? undefined,
          description: s.description ?? undefined,
          address: {
            "@type": "PostalAddress",
            addressLocality: s.zone ?? "Pucallpa",
            addressRegion: "Ucayali",
            addressCountry: "PE",
          },
          ...(s.rating > 0 && s.reviewCount > 0
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: s.rating,
                  reviewCount: s.reviewCount,
                  bestRating: 5,
                  worstRating: 1,
                },
              }
            : {}),
        },
      })),
    },
  };

  // Brandon 2026-05-20 v10: BreadcrumbList ya lo emite TiendasBreadcrumb
  // dentro del TiendasClient (con item URL siempre presente — audit P0).
  // No emitimos otro aquí para evitar duplicación.

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <TiendasClient initialStores={initialStores} />
    </>
  );
}
