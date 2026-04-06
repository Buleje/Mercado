export default function SchemaMarkup({ ratingValue, ratingCount }: { ratingValue?: string; ratingCount?: string } = {}) {
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    "@id": "https://www.buleje.pe/#grocery-store",
    name: "Buleje",
    alternateName: "Buleje - Tienda Virtual de Abarrotes",
    description:
      "Tienda virtual de abarrotes. Venta online de bebidas, golosinas, carne, pollo, productos de limpieza y artículos de consumo diario. Delivery rápido. Pago con Yape o efectivo.",
    url: "https://www.buleje.pe",
    telephone: "+51916409675",
    email: "contacto@buleje.pe",
    foundingDate: "2011",
    slogan: "Tu bodega de confianza — delivery rápido, pago fácil",
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
        "@type": "City",
        name: "Pucallpa",
        sameAs: "https://es.wikipedia.org/wiki/Pucallpa",
      },
      { "@type": "AdministrativeArea", name: "Callería" },
      { "@type": "AdministrativeArea", name: "Yarinacocha" },
      { "@type": "AdministrativeArea", name: "Manantay" },
      { "@type": "AdministrativeArea", name: "Campo Verde" },
      { "@type": "AdministrativeArea", name: "Nueva Requena" },
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
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: ratingValue || "4.9",
      bestRating: "5",
      worstRating: "1",
      ratingCount: ratingCount || "328",
    },
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
      description: "Entrega gratuita a domicilio para pedidos desde S/50.",
      eligibleRegion: {
        "@type": "Place",
        name: "Ucayali, Perú",
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
