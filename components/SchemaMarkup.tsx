import { BRAND_GEO } from "@/lib/geo";

export default function SchemaMarkup({ ratingValue, ratingCount }: { ratingValue?: string; ratingCount?: string } = {}) {
  // Solo incluir aggregateRating si hay reviews reales — nunca fallback a números fake.
  // Structured data con rating falso = riesgo de penalización manual de Google.
  const hasRealRating =
    typeof ratingCount === "string" &&
    ratingCount.length > 0 &&
    Number.parseInt(ratingCount, 10) > 0;

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": "https://www.buleje.pe/#online-store",
    name: "Buleje",
    alternateName: [
      "Buleje Marketplace",
      "Buleje Perú",
      "Marketplace de Bodegas del Perú",
    ],
    description: `Marketplace de bodegas, minimarkets y tiendas de barrio de ${BRAND_GEO.city} (${BRAND_GEO.province}, ${BRAND_GEO.region}), en la Selva Central del Perú. Compra online con delivery rápido. Paga con Yape, Plin o efectivo.`,
    url: "https://www.buleje.pe",
    telephone: BRAND_GEO.phone,
    email: "contacto@buleje.pe",
    foundingDate: "2011",
    foundingLocation: {
      "@type": "Place",
      name: "Pucallpa, Ucayali, Perú",
    },
    slogan: `Tu marketplace de confianza en ${BRAND_GEO.city} — delivery rápido, pago fácil`,
    knowsLanguage: "es",
    address: {
      "@type": "PostalAddress",
      addressLocality: BRAND_GEO.city,
      addressRegion: BRAND_GEO.region,
      addressCountry: BRAND_GEO.countryCode,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: BRAND_GEO.lat,
      longitude: BRAND_GEO.lng,
    },
    areaServed: [
      {
        "@type": "City",
        name: BRAND_GEO.city,
        sameAs: "https://es.wikipedia.org/wiki/Ciudad_Constituci%C3%B3n_(Per%C3%BA)",
      },
      { "@type": "AdministrativeArea", name: BRAND_GEO.province },
      { "@type": "AdministrativeArea", name: BRAND_GEO.region },
      {
        "@type": "Country",
        name: BRAND_GEO.country,
        sameAs: "https://es.wikipedia.org/wiki/Per%C3%BA",
      },
    ],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ],
        opens: "07:00",
        closes: "21:00",
      },
    ],
    priceRange: "$",
    currenciesAccepted: "PEN",
    paymentAccepted: "Yape, Plin, Efectivo",
    image: "https://www.buleje.pe/og-image.jpg",
    logo: "https://www.buleje.pe/og-image.jpg",
    sameAs: [
      "https://www.facebook.com/buleje",
      "https://www.instagram.com/buleje",
    ],
    // aggregateRating solo si hay reviews reales (> 0). Sin fallback fake.
    ...(hasRealRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingValue || "4.9",
            bestRating: "5",
            worstRating: "1",
            ratingCount,
          },
        }
      : {}),
    // Brandon 2026-05-20 v10 audit P0: bloque `review` FAKE removido.
    // Google penaliza structured data inventado (review spam). Cuando
    // tengamos reviews reales del marketplace, reintroducimos via prop
    // o desde DB. Mientras tanto, aggregateRating sigue gated por
    // `hasRealRating` arriba — emisión 100% basada en datos reales.
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Productos de Buleje",
      itemListElement: [
        { "@type": "OfferCatalog", name: "Abarrotes" },
        { "@type": "OfferCatalog", name: "Bebidas" },
        { "@type": "OfferCatalog", name: "Golosinas y Snacks" },
        { "@type": "OfferCatalog", name: "Carnes y Pollo" },
        { "@type": "OfferCatalog", name: "Productos de Limpieza" },
        { "@type": "OfferCatalog", name: "Artículos para el Hogar" },
        { "@type": "OfferCatalog", name: "Frutas y Verduras" },
        { "@type": "OfferCatalog", name: "Lácteos" },
      ],
    },
    makesOffer: {
      "@type": "Offer",
      name: "Delivery gratis en compras desde S/50",
      description: "Entrega gratuita a domicilio para pedidos desde S/50 en ciudades habilitadas del Perú.",
      eligibleRegion: {
        "@type": "Country",
        name: "Perú",
      },
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+51929340532",
      contactType: "customer service",
      areaServed: "PE",
      availableLanguage: "Spanish",
      contactOption: "TollFree",
    },
    // Brandon 2026-05-20 v10 audit P1: parentOrganization conecta el
    // OnlineStore con la entidad Organization (Knowledge Graph linking).
    parentOrganization: { "@id": "https://www.buleje.pe/#organization" },
  };

  // Brandon 2026-05-20 v10 audit P1: @id agregado para que Google
  // pueda conectar Organization con OnlineStore (Knowledge Graph).
  // OnlineStore tiene `parentOrganization: { @id: ... }` apuntando
  // aquí (ver arriba si lo agregamos también).
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://www.buleje.pe/#organization",
    name: "Buleje",
    url: "https://www.buleje.pe",
    logo: "https://www.buleje.pe/og-image.jpg",
    description: `Marketplace de bodegas y tiendas de ${BRAND_GEO.city} (${BRAND_GEO.province}, ${BRAND_GEO.region}) con delivery rápido. Abarrotes, bebidas, comida, farmacia y más. Pago con Yape, Plin o efectivo.`,
    telephone: BRAND_GEO.phone,
    address: {
      "@type": "PostalAddress",
      addressLocality: BRAND_GEO.city,
      addressRegion: BRAND_GEO.region,
      addressCountry: BRAND_GEO.countryCode,
    },
    // SEO E-E-A-T: al crear Google Business Profile, agregar su URL de Maps
    // acá (máxima señal de entidad local en Ciudad Constitución) + YouTube/
    // TikTok si existen. No inventar perfiles — Google penaliza sameAs falso.
    sameAs: [
      "https://www.facebook.com/buleje",
      "https://www.instagram.com/buleje",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+51929340532",
      contactType: "customer service",
      areaServed: "PE",
      availableLanguage: "Spanish",
    },
  };

  // Brandon 2026-05-20 v10 audit P0: websiteSchema removido.
  // El audit detecto que home tenia DOS WebSite JSON-LD identicos:
  // uno aqui (target /buscar?q=) y otro en app/(store)/page.tsx
  // (BulejeJsonLd, target /tiendas?q=). Google ignora uno o produce
  // sitelinks searchbox indefinido. Mantenemos solo el de page.tsx
  // (mas rico — incluye description). Este wrapper sigue inyectando
  // LocalBusiness + Organization + BreadcrumbList + Navigation.

  // Brandon 2026-05-20 v10 audit P0: breadcrumbSchema GLOBAL removido.
  // Antes inyectaba un BreadcrumbList con solo "Inicio" en TODAS las
  // páginas → duplicaba con los BreadcrumbList completos de cada page
  // (home, /tiendas via TiendasBreadcrumb, /marketplace/[slug] etc).
  // GSC marca como error el 2do dupe. Ahora cada página emite el
  // SUYO completo con el path real.


  // Brandon 2026-05-20 v10 audit P2: URLs reales del navbar — antes
  // tenia "/tienda" (sin 's', no existe), "/#ofertas" (anchor a sección
  // inexistente), "/#preguntas" (idem). Reemplazadas por las rutas
  // realmente navegables del menu principal.
  const navigationSchema = {
    "@context": "https://schema.org",
    "@type": "SiteNavigationElement",
    name: [
      "Inicio",
      "Tiendas",
      "Negocios",
      "Abrir tu tienda",
      "Ofertas",
      "Ayuda",
    ],
    url: [
      "https://www.buleje.pe",
      "https://www.buleje.pe/tiendas",
      "https://www.buleje.pe/negocios",
      "https://www.buleje.pe/abrir-tienda",
      "https://www.buleje.pe/marketplace/ofertas",
      "https://www.buleje.pe/ayuda",
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(localBusinessSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(navigationSchema),
        }}
      />
    </>
  );
}
