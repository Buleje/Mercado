import type { Metadata } from "next";
import TiendasClient from "./TiendasClient";
import { getInitialMarketplaceStores } from "@/lib/marketplace/initial-stores";
import { getStoreShowcaseByCategory } from "@/lib/db/marketplace-featured.db";
import type { PremiumProduct } from "@/components/marketplace/PremiumStoreCard";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";

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
  // 2026-05-28 audit: title antes 64 chars (truncado en mobile SERP).
  // Ahora 53 chars — keyword "Bodegas en Pucallpa" + intent "delivery" + brand.
  title: "Bodegas en Pucallpa · Delivery Yape · Buleje",
  // Brandon 2026-05-20 v2: 135 chars (target 70-155). Antes 159 chars
  // dispara warning de SEO auditors (Google trunca a ~155). Mantiene las
  // keywords clave (bodegas, farmacias, restaurantes, Pucallpa, delivery,
  // Yape, Plin) + cierre con valor agregado ("tu bodega del barrio, ahora
  // online" → conecta con la audiencia local).
  description:
    "Comprá en bodegas, restaurantes, mercados y farmacias de Pucallpa con delivery rápido. Paga con Yape, Plin o efectivo. Todo el barrio, ahora online.",
  keywords: [
    "bodegas Pucallpa",
    "restaurantes Pucallpa",
    "mercados Pucallpa",
    "delivery Pucallpa",
    "comprar online Pucallpa",
    "tiendas Ucayali",
    "minimarket Pucallpa",
    "Yape Pucallpa",
    "comida a domicilio Pucallpa",
    "delivery Ciudad Constitución",
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
    title: "Bodegas, restaurantes y mercados en Pucallpa | Buleje",
    description:
      "Comprá en bodegas, restaurantes, mercados y farmacias de Pucallpa. Delivery rápido · Yape, Plin o efectivo.",
    url: `${BASE_URL}/tiendas`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
    // 2026-05-27 SEO: antes apuntaba a /brand/buleje-logo.png (512×512,
    // cuadrado, declarado 1200×630 → mismatch + card pobre). Ahora /api/og
    // genera una card 1200×630 real y on-brand (mismo patrón que el resto).
    images: [
      {
        url: `${BASE_URL}/api/og`,
        width: 1200,
        height: 630,
        alt: "Buleje — tiendas y bodegas en Pucallpa con delivery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bodegas, restaurantes y mercados en Pucallpa | Buleje",
    description:
      "Comprá en bodegas, restaurantes, mercados y farmacias de Pucallpa. Delivery rápido · Yape, Plin o efectivo.",
    // Brandon 2026-05-20 v11 audit P2: twitter:image:alt requerido por
    // X/Twitter para accesibilidad de la preview cuando se comparte.
    images: [{
      url: `${BASE_URL}/api/og`,
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

  // Productos para las cards Premium (beneficio superadmin): solo se necesitan
  // para las tiendas con displayTier "premium". Reusa el helper que ya embebe
  // productos; mapeamos por slug. Fire-and-forget — si falla, premium muestra
  // su card sin preview (degrade elegante).
  const premiumSlugs = new Set(
    initialStores.filter((s) => s.displayTier === "premium").map((s) => s.slug),
  );
  let productsBySlug: Record<string, PremiumProduct[]> = {};
  if (premiumSlugs.size > 0) {
    try {
      // 1 producto por categoría → el cliente ve la variedad de la tienda.
      const showcase = await getStoreShowcaseByCategory([...premiumSlugs], 6);
      productsBySlug = Object.fromEntries(
        Object.entries(showcase).map(([slug, items]) => [
          slug,
          items.map((p) => ({
            productId: p.productId,
            name: p.name,
            image: p.image,
            retailPrice: p.retailPrice,
            discountPrice: p.discountPrice,
            category: p.category,
          })),
        ]),
      );
    } catch {
      productsBySlug = {};
    }
  }

  // ── JSON-LD: CollectionPage + ItemList con las tiendas top ──
  // Brandon 2026-05-25 SEO/IA: 12 → 24 tiendas + priceRange/pagos por tienda
  // (rich results + citabilidad en IA de Google).
  const topStores = initialStores.slice(0, 24);
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${BASE_URL}/tiendas`,
    url: `${BASE_URL}/tiendas`,
    name: "Tiendas y bodegas en Pucallpa",
    description:
      "Directorio de bodegas, restaurantes, mercados, minimarkets y farmacias locales en Pucallpa y Ciudad Constitución con delivery rápido y pago con Yape, Plin o efectivo.",
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
          priceRange: "S/",
          currenciesAccepted: "PEN",
          paymentAccepted: "Yape, Plin, Efectivo, Tarjeta",
          areaServed: { "@type": "City", name: s.zone ?? "Pucallpa" },
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

  // ── JSON-LD: FAQPage (Brandon 2026-05-25 SEO/IA) ──
  // Respuestas extraíbles por Google (rich result de FAQ) y por la IA
  // (AI Overviews / Gemini citan respuestas directas). Preguntas reales del
  // comprador de Pucallpa.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "¿Cómo pido delivery en las tiendas de Pucallpa por Buleje?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Elegí una bodega o restaurante del directorio, agregá productos al carrito y confirmá. La tienda recibe tu pedido al instante por WhatsApp y coordina el delivery a tu dirección en Pucallpa.",
        },
      },
      {
        "@type": "Question",
        name: "¿Puedo pagar con Yape o Plin?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí. Las tiendas en Buleje aceptan Yape, Plin, efectivo y tarjeta. Pagás directo a la tienda al recibir tu pedido o por transferencia, según lo que ofrezca cada negocio.",
        },
      },
      {
        "@type": "Question",
        name: "¿Cuánto cuesta el delivery?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "El costo de envío lo define cada tienda según tu zona en Pucallpa (Centro, Yarinacocha, Manantay, Callería, Campo Verde). Lo ves antes de confirmar el pedido, sin sorpresas.",
        },
      },
      {
        "@type": "Question",
        name: "¿Qué tipos de tiendas hay en Buleje?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Bodegas y minimarkets, mercados, restaurantes y pizzerías, farmacias, panaderías y ferreterías locales de Pucallpa y Ciudad Constitución, todas con catálogo online y delivery.",
        },
      },
      {
        "@type": "Question",
        name: "¿Tener mi tienda en Buleje cuesta algo?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Podés empezar gratis. Buleje te da catálogo online, bot de WhatsApp, POS e inventario. Hay planes pagos con más funciones para negocios que crecen.",
        },
      },
    ],
  };

  return (
    <>
      {/* SEC 2026-05-26: safeJsonLdStringify escapa < > & U+2028/2029 — evita
          que un nombre/descripción de tienda (dato de vendor) con "</script>"
          rompa el tag e inyecte XSS. Antes usaba JSON.stringify crudo. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(itemListSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(faqSchema) }}
      />
      {/*
        SEO 2026-05-28 audit: TiendasClient (client component) renderiza el
        H1 visual, pero el HTML SSR initial no lo tenía → Google veía la
        página sin encabezado primario. H1 sr-only en server preserva el
        diseño y da H1 semántico desde el primer byte del HTML.
      */}
      <h1 className="sr-only">
        Tiendas y bodegas en Pucallpa con delivery — Buleje Marketplace
      </h1>
      <TiendasClient initialStores={initialStores} premiumProducts={productsBySlug} />
    </>
  );
}
