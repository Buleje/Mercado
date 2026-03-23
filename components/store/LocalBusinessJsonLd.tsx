/**
 * JSON-LD structured data for Local Business SEO.
 * Place in app/(store)/layout.tsx or page.tsx for Google rich results.
 * Server component — no "use client" needed.
 */

export default function LocalBusinessJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    name: "Bodega San Mart\u00edn",
    alternateName: "Bodega San Martin - Abarrotes Delivery Pucallpa",
    description:
      "Bodega de abarrotes con delivery en Pucallpa. Arroz, aceite, az\u00facar, fideos, productos de limpieza y m\u00e1s. Pedidos por WhatsApp y web. Pago con Yape, Plin o efectivo.",
    url: "https://www.bodegasanmartin.pe",
    telephone: process.env.NEXT_PUBLIC_WHATSAPP_PHONE
      ? `+51${process.env.NEXT_PUBLIC_WHATSAPP_PHONE}`
      : "+51000000000",
    image: "https://www.bodegasanmartin.pe/logo.png",
    logo: "https://www.bodegasanmartin.pe/logo.png",
    priceRange: "S/1 - S/200",
    currenciesAccepted: "PEN",
    paymentAccepted: "Efectivo, Yape, Plin",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Pucallpa",
      addressLocality: "Pucallpa",
      addressRegion: "Ucayali",
      postalCode: "25001",
      addressCountry: "PE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: -8.3791,
      longitude: -74.5539,
    },
    areaServed: {
      "@type": "City",
      name: "Pucallpa",
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
        closes: "22:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Sunday",
        opens: "08:00",
        closes: "20:00",
      },
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Productos de bodega",
      itemListElement: [
        {
          "@type": "Offer",
          itemOffered: { "@type": "Product", name: "Abarrotes" },
        },
        {
          "@type": "Offer",
          itemOffered: { "@type": "Product", name: "Bebidas" },
        },
        {
          "@type": "Offer",
          itemOffered: { "@type": "Product", name: "Limpieza" },
        },
      ],
    },
    sameAs: [],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
