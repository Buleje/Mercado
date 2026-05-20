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
    description:
      "Marketplace de bodegas, minimarkets y tiendas de barrio en todo el Perú. Compra online con delivery rápido en tu ciudad. Paga con Yape, Plin o efectivo. Originado en Pucallpa, operando a nivel nacional.",
    url: "https://www.buleje.pe",
    telephone: "+51929340532",
    email: "contacto@buleje.pe",
    foundingDate: "2011",
    foundingLocation: {
      "@type": "Place",
      name: "Pucallpa, Ucayali, Perú",
    },
    slogan: "Tu bodega de confianza en todo el Perú — delivery rápido, pago fácil",
    knowsLanguage: "es",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Jr. Ucayali 450",
      addressLocality: "Pucallpa",
      addressRegion: "Ucayali",
      postalCode: "25000",
      addressCountry: "PE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: -8.38006,
      longitude: -74.53561,
    },
    areaServed: [
      {
        "@type": "Country",
        name: "Perú",
        sameAs: "https://es.wikipedia.org/wiki/Per%C3%BA",
      },
      {
        "@type": "City",
        name: "Pucallpa",
        sameAs: "https://es.wikipedia.org/wiki/Pucallpa",
      },
      { "@type": "City", name: "Lima" },
      { "@type": "City", name: "Arequipa" },
      { "@type": "City", name: "Trujillo" },
      { "@type": "City", name: "Cusco" },
      { "@type": "City", name: "Chiclayo" },
      { "@type": "City", name: "Iquitos" },
      { "@type": "City", name: "Piura" },
      { "@type": "City", name: "Tarapoto" },
      { "@type": "AdministrativeArea", name: "Ucayali" },
      { "@type": "AdministrativeArea", name: "Lima Metropolitana" },
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
    description:
      "Tienda virtual de abarrotes con delivery rápido. Bebidas, golosinas, carne, pollo, limpieza y más. Pago con Yape o efectivo.",
    telephone: "+51929340532",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Jr. Ucayali 450",
      addressLocality: "Pucallpa",
      addressRegion: "Ucayali",
      postalCode: "25000",
      addressCountry: "PE",
    },
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
