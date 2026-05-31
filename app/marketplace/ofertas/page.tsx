import type { Metadata } from "next";
import OfertasClient from "@/components/marketplace/ofertas/OfertasClient";
import JsonLd from "@/components/JsonLd";

const BASE_URL = "https://www.buleje.pe";

// JSON-LD (2026-05-27): Breadcrumb + CollectionPage para la página de ofertas.
const ofertasBreadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
    { "@type": "ListItem", position: 2, name: "Marketplace", item: `${BASE_URL}/marketplace` },
    { "@type": "ListItem", position: 3, name: "Ofertas", item: `${BASE_URL}/marketplace/ofertas` },
  ],
};

const ofertasCollectionLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${BASE_URL}/marketplace/ofertas`,
  name: "Ofertas del día en Buleje Ciudad Constitución",
  description:
    "Descuentos reales en bodegas, minimarkets y restaurantes de Ciudad Constitución. Delivery rápido, pago con Yape, Plin o efectivo.",
  url: `${BASE_URL}/marketplace/ofertas`,
  inLanguage: "es-PE",
  isPartOf: { "@type": "WebSite", name: "Buleje", url: BASE_URL },
};

export const metadata: Metadata = {
  title: "Ofertas — Precios que no te puedes perder",
  description:
    "Descuentos reales en bodegas cerca tuyo. Hoy ahorrás en lo que mas usas. Ofertas de esta semana en Ciudad Constitución — delivery rápido, pago Yape o efectivo.",
  alternates: {
    canonical: `${BASE_URL}/marketplace/ofertas`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Ofertas — Precios que no te puedes perder",
    description:
      "Descuentos reales en bodegas de Ciudad Constitución. Ahorra en abarrotes, frescos, bebidas y mas. Termina pronto.",
    url: `${BASE_URL}/marketplace/ofertas`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Ofertas del día en Buleje Ciudad Constitución" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ofertas — Precios que no te puedes perder",
    description: "Descuentos reales en bodegas de Ciudad Constitución. Delivery rápido, pago Yape o efectivo.",
    images: ["/api/og"],
  },
};

/**
 * /marketplace/ofertas — Pagina de ofertas estilo Amazon "Today's Deals".
 * MVP: datos mock de lib/mock-deals.ts. Sin DB, sin Prisma.
 * Hereda layout con MarketplaceNavbar del layout padre.
 */
export default function OfertasPage() {
  return (
    <>
      <JsonLd data={ofertasBreadcrumbLd} />
      <JsonLd data={ofertasCollectionLd} />
      {/*
        SEO 2026-05-28 audit: OfertasClient (client) renderiza el H1 visual.
        SSR initial HTML no tenía H1 → Google sin encabezado primario.
      */}
      <h1 className="sr-only">
        Ofertas y descuentos de bodegas en Ciudad Constitución hoy — Buleje Marketplace
      </h1>
      <OfertasClient />
    </>
  );
}
