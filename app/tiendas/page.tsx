import type { Metadata } from "next";
import TiendasClient from "./TiendasClient";
import { JoinUsSection } from "@/components/marketing/JoinUsSection";
import { getInitialMarketplaceStores } from "@/lib/marketplace/initial-stores";
import { getStoreShowcaseByCategory } from "@/lib/db/marketplace-featured.db";
import type { PremiumProduct } from "@/components/marketplace/PremiumStoreCard";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { StoreReviewsDB } from "@/lib/db/store-reviews.db";
import { BRAND_GEO } from "@/lib/geo";
import {
  Bike,
  ShoppingCart,
  UtensilsCrossed,
  Pill,
  Store,
  Croissant,
  Wrench,
} from "@buleje/design-system/icons";

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
  title: `Tiendas en ${BRAND_GEO.city} · Delivery Yape`,
  // Brandon 2026-05-20 v2: 135 chars (target 70-155). Antes 159 chars
  // dispara warning de SEO auditors (Google trunca a ~155). Mantiene las
  // keywords clave (bodegas, farmacias, restaurantes, Pucallpa, delivery,
  // Yape, Plin) + cierre con valor agregado ("tu bodega del barrio, ahora
  // online" → conecta con la audiencia local).
  description:
    `Comprá en bodegas, restaurantes, mercados y farmacias de ${BRAND_GEO.city} con delivery rápido. Paga con Yape, Plin o efectivo. Todo el barrio, ahora online.`,
  keywords: [
    `bodegas ${BRAND_GEO.city}`,
    `restaurantes ${BRAND_GEO.city}`,
    `mercados ${BRAND_GEO.city}`,
    `delivery ${BRAND_GEO.city}`,
    `comprar online ${BRAND_GEO.city}`,
    `tiendas ${BRAND_GEO.region}`,
    `minimarket ${BRAND_GEO.city}`,
    `Yape ${BRAND_GEO.city}`,
    `comida a domicilio ${BRAND_GEO.city}`,
    "delivery Oxapampa",
    "delivery Pasco",
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
    title: `Bodegas, restaurantes y mercados en ${BRAND_GEO.city} | Buleje`,
    description:
      `Comprá en bodegas, restaurantes, mercados y farmacias de ${BRAND_GEO.city}. Delivery rápido · Yape, Plin o efectivo.`,
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
        alt: `Buleje — tiendas y bodegas en ${BRAND_GEO.city} con delivery`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Bodegas, restaurantes y mercados en ${BRAND_GEO.city} | Buleje`,
    description:
      `Comprá en bodegas, restaurantes, mercados y farmacias de ${BRAND_GEO.city}. Delivery rápido · Yape, Plin o efectivo.`,
    // Brandon 2026-05-20 v11 audit P2: twitter:image:alt requerido por
    // X/Twitter para accesibilidad de la preview cuando se comparte.
    images: [{
      url: `${BASE_URL}/api/og`,
      alt: `Buleje — tiendas y bodegas con delivery rápido en ${BRAND_GEO.cityRegion}`,
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
  // productos; mapeamos por slug. Si falla, premium muestra su card sin preview
  // (degrade elegante).
  const premiumSlugs = new Set(
    initialStores.filter((s) => s.displayTier === "premium").map((s) => s.slug),
  );
  const topStores = initialStores.slice(0, 24);

  // Perf (audit 2026-05-31): el showcase de premium y los agregados de reseñas
  // solo dependen de initialStores → los resolvemos EN PARALELO con Promise.all.
  // Antes eran 2 awaits en serie = un round-trip de DB extra en el TTFB de cada
  // render. El showcase degrada a {} si falla (premium sin preview).
  const emptyShowcase = {} as Awaited<
    ReturnType<typeof getStoreShowcaseByCategory>
  >;
  const [showcase, storeReviewAgg] = await Promise.all([
    premiumSlugs.size > 0
      ? // 1 producto por categoría → el cliente ve la variedad de la tienda.
        getStoreShowcaseByCategory([...premiumSlugs], 6).catch(() => emptyShowcase)
      : Promise.resolve(emptyShowcase),
    // Audit SEO 2026-05-31 ("schema honesto, UI sembrada"): el aggregateRating
    // de cada tienda sale SOLO de reseñas REALES (tabla Review), no de la
    // columna sembrada store.rating/reviewCount (que en lanzamiento tiene data
    // semilla sin filas Review detrás → "spammy structured markup" para Google).
    // Map vacío hoy → cero estrellas falsas; se auto-activa por tienda cuando
    // lleguen reseñas reales. La UI (TiendasClient) sigue mostrando la semilla.
    StoreReviewsDB.getApprovedAggregatesByStoreIds(topStores.map((s) => s.id)),
  ]);

  const productsBySlug: Record<string, PremiumProduct[]> = Object.fromEntries(
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

  // ── JSON-LD: CollectionPage + ItemList con las tiendas top ──
  // Brandon 2026-05-25 SEO/IA: 12 → 24 tiendas + priceRange/pagos por tienda
  // (rich results + citabilidad en IA de Google).
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${BASE_URL}/tiendas`,
    url: `${BASE_URL}/tiendas`,
    name: `Tiendas y bodegas en ${BRAND_GEO.city}`,
    description:
      `Directorio de bodegas, restaurantes, mercados, minimarkets y farmacias locales en ${BRAND_GEO.cityRegion} con delivery rápido y pago con Yape, Plin o efectivo.`,
    inLanguage: "es-PE",
    isPartOf: {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: BASE_URL,
      name: "Buleje",
    },
    // Une el grafo: la CollectionPage referencia su breadcrumb (audit 2026-05-31).
    breadcrumb: { "@id": `${BASE_URL}/tiendas#breadcrumb` },
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
          areaServed: { "@type": "City", name: s.zone ?? BRAND_GEO.city },
          address: {
            "@type": "PostalAddress",
            addressLocality: s.zone ?? BRAND_GEO.city,
            addressRegion: BRAND_GEO.region,
            addressCountry: "PE",
          },
          // Solo reseñas REALES (no la columna sembrada s.rating/reviewCount).
          ...(() => {
            const agg = storeReviewAgg.get(s.id);
            return agg && agg.total > 0 && agg.average > 0
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: agg.average,
                    reviewCount: agg.total,
                    bestRating: 5,
                    worstRating: 1,
                  },
                }
              : {};
          })(),
        },
      })),
    },
  };

  // ── JSON-LD: BreadcrumbList (audit SEO 2026-05-31) ──
  // Emitido server-side SIEMPRE (mode-independent). Antes vivía solo en
  // TiendasBreadcrumb, pero ese componente está gated por !isTiendasOnly →
  // en modo tiendas-only (el default real) Google NO recibía el breadcrumb.
  // Ahora TiendasBreadcrumb solo renderiza el nav visible (sin su JSON-LD).
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${BASE_URL}/tiendas#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: `Tiendas en ${BRAND_GEO.city}`,
        item: `${BASE_URL}/tiendas`,
      },
    ],
  };

  // ── JSON-LD: ItemList de Productos (Product + Offer) — audit SEO 2026-05-31 ──
  // Los previews de tiendas premium muestran productos con precio. Emitimos
  // Product+Offer (ItemList) → habilita rich snippets de precio en Google.
  const storeNameBySlug: Record<string, string> = Object.fromEntries(
    initialStores.map((s) => [s.slug, s.name]),
  );
  const previewProducts = Object.entries(productsBySlug).flatMap(([slug, items]) =>
    items.map((p) => ({ ...p, storeSlug: slug, storeName: storeNameBySlug[slug] ?? "" })),
  );
  const productListSchema =
    previewProducts.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          "@id": `${BASE_URL}/tiendas#productos`,
          isPartOf: { "@id": `${BASE_URL}/tiendas` },
          name: `Productos destacados de tiendas en ${BRAND_GEO.city}`,
          numberOfItems: previewProducts.length,
          itemListElement: previewProducts.map((p, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            item: {
              "@type": "Product",
              name: p.name,
              ...(p.image ? { image: p.image } : {}),
              ...(p.category ? { category: p.category } : {}),
              offers: {
                "@type": "Offer",
                price: Number(p.discountPrice ?? p.retailPrice).toFixed(2),
                priceCurrency: "PEN",
                availability: "https://schema.org/InStock",
                url: `${BASE_URL}/marketplace/${p.storeSlug}`,
                ...(p.storeName
                  ? { seller: { "@type": "Organization", name: p.storeName } }
                  : {}),
              },
            },
          })),
        }
      : null;

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
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(breadcrumbSchema) }}
      />
      {productListSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(productListSchema) }}
        />
      )}
      {/*
        SEO 2026-05-28 audit: TiendasClient (client component) renderiza el
        H1 visual, pero el HTML SSR initial no lo tenía → Google veía la
        página sin encabezado primario. H1 sr-only en server preserva el
        diseño y da H1 semántico desde el primer byte del HTML.
      */}
      <h1 className="sr-only">
        {`Tiendas y bodegas en ${BRAND_GEO.city} con delivery — Buleje Marketplace`}
      </h1>
      <TiendasClient initialStores={initialStores} premiumProducts={productsBySlug} />

      {/* SEO + categorías — sección visible indexable (audit 2026-05-31, rediseño
          visual 2026-05-31): de un muro de texto gris text-sm a un bloque con
          jerarquía + tiles de categoría con icono. 100% server-rendered → sigue
          siendo indexable y sin coste JS. La FAQ se movió a la home (/). */}
      <section
        aria-labelledby="tiendas-seo-heading"
        className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 mt-8 border-t border-[var(--rule-soft)]"
      >
        <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
          <Bike className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Delivery local
        </p>
        <h2
          id="tiendas-seo-heading"
          className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] mb-4 max-w-2xl"
        >
          Delivery de bodegas, restaurantes y farmacias en {BRAND_GEO.city}
        </h2>
        <div className="max-w-3xl text-base leading-relaxed text-[var(--text-secondary)]">
          <p>
            Buleje reúne las bodegas, minimarkets, restaurantes, pizzerías y
            farmacias de {BRAND_GEO.city} ({BRAND_GEO.province}, {BRAND_GEO.region})
            en un solo lugar. Pedís online desde tu celular y la tienda recibe tu
            pedido al instante por WhatsApp, lo prepara y te lo lleva a tu puerta —
            normalmente en 25 a 35 minutos según tu zona. Pagás con Yape, Plin,
            efectivo o tarjeta al recibir, sin adelantar nada.
          </p>
        </div>

        {/* Tiles de categoría — visual, on-brand, mismo patrón de tile que la home. */}
        <ul className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { icon: ShoppingCart, label: "Bodegas y minimarkets" },
            { icon: UtensilsCrossed, label: "Restaurantes y pizzerías" },
            { icon: Pill, label: "Farmacias y boticas" },
            { icon: Store, label: "Mercados" },
            { icon: Croissant, label: "Panaderías" },
            { icon: Wrench, label: "Ferreterías" },
          ].map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex flex-col items-start gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30 hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <span className="text-sm font-bold leading-snug text-[var(--text-primary)]">
                {label}
              </span>
            </li>
          ))}
        </ul>

      </section>

      {/* Trabajá con nosotros — reclutamiento (tiendas/comercios/repartidores),
          mismo componente que la home (single source). Brandon 2026-05-31:
          reemplaza el CTA de dueño que vivía acá; el funnel de vendors se
          centraliza en este bloque. */}
      <JoinUsSection />
    </>
  );
}
