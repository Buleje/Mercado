export default function SchemaMarkup() {
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    name: "Bodega San Martín",
    alternateName: "Bodega San Martín - Tienda Virtual de Abarrotes en Pucallpa",
    description:
      "Tienda virtual de abarrotes en Pucallpa. Venta online de bebidas, golosinas, carne, pollo, productos de limpieza y artículos de consumo diario. Delivery rápido. Pago con Yape o efectivo.",
    url: "https://www.bodegasanmartin.pe",
    telephone: "+51916409675",
    email: "contacto@bodegasanmartin.pe",
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
    areaServed: {
      "@type": "City",
      name: "Pucallpa",
      sameAs: "https://es.wikipedia.org/wiki/Pucallpa",
    },
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
    paymentAccepted: "Yape, Efectivo",
    image: "https://www.bodegasanmartin.pe/og-image.jpg",
    sameAs: [
      "https://www.facebook.com/bodegasanmartin",
      "https://www.instagram.com/bodegasanmartin",
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      bestRating: "5",
      worstRating: "1",
      ratingCount: "328",
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Productos de Bodega San Martín",
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
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Bodega San Martín",
    url: "https://www.bodegasanmartin.pe",
    logo: "https://www.bodegasanmartin.pe/og-image.jpg",
    description:
      "Tienda virtual de abarrotes en Pucallpa con delivery rápido. Bebidas, golosinas, carne, pollo, limpieza y más. Pago con Yape o efectivo.",
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
      "https://www.facebook.com/bodegasanmartin",
      "https://www.instagram.com/bodegasanmartin",
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
    name: "Bodega San Martín",
    alternateName: "Tienda Virtual de Abarrotes en Pucallpa",
    url: "https://www.bodegasanmartin.pe",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate:
          "https://www.bodegasanmartin.pe/buscar?q={search_term_string}",
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
        item: "https://www.bodegasanmartin.pe",
      },
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "¿Hacen delivery de abarrotes en todo Pucallpa?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí, realizamos delivery de abarrotes en toda la zona urbana de Pucallpa. Nuestro servicio de entrega a domicilio cubre la mayoría de barrios y urbanizaciones.",
        },
      },
      {
        "@type": "Question",
        name: "¿Se puede pagar con Yape?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "¡Por supuesto! Aceptamos pagos con Yape para tu comodidad. También puedes pagar en efectivo contra entrega. Somos una tienda con Yape en Pucallpa.",
        },
      },
      {
        "@type": "Question",
        name: "¿También aceptan efectivo contra entrega?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí, aceptamos pago en efectivo al momento de la entrega. Nuestro repartidor llevará tu pedido y podrás pagarlo en el momento.",
        },
      },
      {
        "@type": "Question",
        name: "¿Qué productos venden?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Vendemos abarrotes, bebidas, golosinas, carne, pollo, productos de limpieza, artículos para el hogar, snacks y más. Todo lo que necesitas para tu hogar o negocio.",
        },
      },
      {
        "@type": "Question",
        name: "¿Venden bebidas, golosinas, carne y pollo?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí, contamos con bebidas (gaseosas, aguas, jugos, energizantes), golosinas (chocolates, galletas, caramelos, snacks), carne y pollo frescos.",
        },
      },
      {
        "@type": "Question",
        name: "¿Tienen productos de limpieza?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí, ofrecemos detergente, lejía, jabón, limpiadores multiusos, desinfectantes y más. Todo con delivery en Pucallpa.",
        },
      },
      {
        "@type": "Question",
        name: "¿Cómo hago mi pedido online?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Navega por nuestro catálogo, agrega lo que necesites al carrito y completa tu pedido. También puedes escribirnos por WhatsApp. Aceptamos Yape o efectivo.",
        },
      },
      {
        "@type": "Question",
        name: "¿Cuánto demora el delivery en Pucallpa?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Nuestro delivery en Pucallpa es rápido. Generalmente entregamos el mismo día. Para pedidos urgentes, contáctanos por WhatsApp.",
        },
      },
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
          __html: JSON.stringify(faqSchema),
        }}
      />
    </>
  );
}
