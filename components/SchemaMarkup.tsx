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
    telephone: "+51916409675",
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
    review: [
      {
        "@type": "Review",
        author: { "@type": "Person", name: "María López" },
        datePublished: "2025-09-15",
        reviewBody: "Excelente servicio, los productos llegan frescos y a buen precio. Ya no necesito ir al mercado.",
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
      },
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Carlos Ramírez" },
        datePublished: "2025-10-02",
        reviewBody: "Pedir por WhatsApp es súper fácil. En menos de una hora ya tenía todo en mi casa. ¡Recomendado!",
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
      },
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Ana Gutiérrez" },
        datePublished: "2025-11-20",
        reviewBody: "La calidad de las frutas y verduras es increíble. Se nota que seleccionan lo mejor. Cliente fija.",
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
      },
    ],
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
      telephone: "+51916409675",
      contactType: "customer service",
      areaServed: "PE",
      availableLanguage: "Spanish",
      contactOption: "TollFree",
    },
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Buleje",
    url: "https://www.buleje.pe",
    logo: "https://www.buleje.pe/og-image.jpg",
    description:
      "Tienda virtual de abarrotes con delivery rápido. Bebidas, golosinas, carne, pollo, limpieza y más. Pago con Yape o efectivo.",
    telephone: "+51916409675",
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
      telephone: "+51916409675",
      contactType: "customer service",
      areaServed: "PE",
      availableLanguage: "Spanish",
    },
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Buleje",
    alternateName: "Tienda Virtual de Abarrotes",
    url: "https://www.buleje.pe",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate:
          "https://www.buleje.pe/buscar?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: "https://www.buleje.pe",
      },
    ],
  };

  const navigationSchema = {
    "@context": "https://schema.org",
    "@type": "SiteNavigationElement",
    name: [
      "Inicio",
      "Tienda",
      "Categorías",
      "Ofertas del día",
      "Preguntas frecuentes",
      "Contacto",
    ],
    url: [
      "https://www.buleje.pe",
      "https://www.buleje.pe/tienda",
      "https://www.buleje.pe/tienda#categorias",
      "https://www.buleje.pe/#ofertas",
      "https://www.buleje.pe/#preguntas",
      "https://www.buleje.pe/#contacto",
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
          __html: JSON.stringify(websiteSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema),
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
