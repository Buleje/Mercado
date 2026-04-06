import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.com";

export const metadata: Metadata = {
  title: "Planes y Precios — Buleje | Tienda Online para Bodegas",
  description:
    "Elige el plan perfecto para tu bodega. Desde gratis hasta Enterprise con dominio propio, analytics avanzado, soporte prioritario y más. Prueba gratis 14 días.",
  keywords: [
    "bodega online", "tienda virtual", "planes precios", "ecommerce peru",
    "bodega san martin", "SaaS bodegas", "tienda gratis",
  ],
  alternates: { canonical: `${BASE_URL}/pricing` },
  openGraph: {
    title: "Planes y Precios — Buleje",
    description:
      "Crea tu tienda online con el plan que mejor se adapte a tu negocio. Desde $0/mes hasta Enterprise con soporte dedicado.",
    url: `${BASE_URL}/pricing`,
    siteName: "Buleje",
    type: "website",
    locale: "es_PE",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planes y Precios — Buleje",
    description: "Elige tu plan y lanza tu tienda online en minutos. Free, Pro, Business o Enterprise.",
  },
};

// JSON-LD SoftwareApplication schema + Product/Offer for each plan
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Planes y Precios",
  description: "Planes de suscripción para la plataforma Buleje",
  url: `${BASE_URL}/pricing`,
  mainEntity: {
    "@type": "SoftwareApplication",
    name: "Buleje",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Plataforma SaaS para crear y gestionar tiendas online para bodegas y pequeños comercios en Perú.",
    offers: [
      {
        "@type": "Offer",
        name: "Plan Free",
        price: "0",
        priceCurrency: "USD",
        description: "Hasta 50 productos, 1 usuario admin, ideal para empezar",
        url: `${BASE_URL}/registro?plan=free`,
      },
      {
        "@type": "Offer",
        name: "Plan Pro",
        price: "49",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "49",
          priceCurrency: "USD",
          billingDuration: "P1M",
        },
        description: "Hasta 500 productos, 5 usuarios admin, analytics avanzado",
        url: `${BASE_URL}/registro?plan=pro`,
      },
      {
        "@type": "Offer",
        name: "Plan Business",
        price: "149",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "149",
          priceCurrency: "USD",
          billingDuration: "P1M",
        },
        description: "Hasta 2000 productos, 15 usuarios admin, dominio propio, soporte prioritario",
        url: `${BASE_URL}/registro?plan=business`,
      },
      {
        "@type": "Offer",
        name: "Plan Enterprise",
        price: "399",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "399",
          priceCurrency: "USD",
          billingDuration: "P1M",
        },
        description: "Productos ilimitados, usuarios ilimitados, SLA garantizado, soporte dedicado, white label",
        url: `${BASE_URL}/registro?plan=enterprise`,
      },
    ],
  },
};

// Breadcrumb JSON-LD for pricing page
const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
    { "@type": "ListItem", position: 2, name: "Planes y Precios", item: `${BASE_URL}/pricing` },
  ],
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {children}
    </>
  );
}
