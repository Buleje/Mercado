import type { Metadata } from "next";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import StoreProviders from "@/components/StoreProviders";
import MotionProvider from "@/components/MotionProvider";
import Footer from "@/components/Footer";
import VenderHero from "@/components/vender/VenderHero";
import VenderBenefitsGrid from "@/components/vender/VenderBenefitsGrid";
import VenderSteps from "@/components/vender/VenderSteps";
import VenderRevenueCalculator from "@/components/vender/VenderRevenueCalculator";
import VenderSocialProof from "@/components/vender/VenderSocialProof";
import VenderFAQ from "@/components/vender/VenderFAQ";
import { FAQ_ITEMS } from "@/components/vender/vender-faq-data";
import VenderFinalCTA from "@/components/vender/VenderFinalCTA";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";
import JsonLd from "@/components/JsonLd";

const VENDER_URL = "https://www.buleje.pe/vender";

// JSON-LD seller landing (2026-05-27): SoftwareApplication con planes,
// BreadcrumbList y FAQPage reusando FAQ_ITEMS (mismo contenido visible).
const venderSoftwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${VENDER_URL}#software`,
  name: "Buleje — Vende en el marketplace",
  url: VENDER_URL,
  description:
    "Plataforma para que tu bodega venda online en Pucallpa: catálogo, pedidos por WhatsApp, delivery con repartidores locales y pagos Yape/Plin. Primer mes gratis.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "es-PE",
  offers: [
    { "@type": "Offer", name: "Gratis", price: "0", priceCurrency: "PEN" },
    { "@type": "Offer", name: "Pro", price: "29", priceCurrency: "PEN" },
  ],
};

const venderBreadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: "https://www.buleje.pe" },
    { "@type": "ListItem", position: 2, name: "Vende en Buleje", item: VENDER_URL },
  ],
};

const venderFaqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export const metadata: Metadata = {
  title: "Vende en Buleje — Abre tu tienda en Pucallpa en 5 minutos",
  description:
    "Suma tu bodega al marketplace de Ucayali. Sin letra chica, sin comisiones escondidas. Gratis el primer mes, soporte en español, pagos con Yape.",
  keywords: [
    "vender en Pucallpa",
    "abrir tienda online",
    "marketplace para bodegas",
    "vender por internet Ucayali",
    "software para bodega",
    "delivery para mi negocio",
  ],
  openGraph: {
    title: "Vende en Buleje",
    description:
      "Abre tu tienda online con la plataforma que usan las bodegas de Pucallpa. Gratis el primer mes.",
    url: "https://www.buleje.pe/vender",
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Vende en Buleje — tu tienda online en Pucallpa" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vende en Buleje — Abre tu tienda en 5 minutos",
    description: "Suma tu bodega al marketplace de Ucayali. Gratis el primer mes, pagos con Yape.",
    images: ["/api/og"],
  },
  alternates: {
    canonical: "/vender",
  },
};

/**
 * /vender — Seller Central landing. Server component.
 *
 * Stack de 7 secciones en scroll:
 *   1. Hero 2-col (DoniaElena)
 *   2. Benefits grid (3 cards)
 *   3. Cómo empezar (4 pasos editorial)
 *   4. Calculadora de ingresos (client interactivo)
 *   5. Social proof (bodegas ya vendiendo)
 *   6. FAQ accordion
 *   7. CTA final hero-horizontal
 */
export default function VenderLandingPage() {
  return (
    <StoreProviders tenantSlug="main">
      <MotionProvider>
        <JsonLd data={venderSoftwareLd} />
        <JsonLd data={venderBreadcrumbLd} />
        <JsonLd data={venderFaqLd} />
        <div className="min-h-screen bg-[var(--surface-canvas)]">
          <MarketplaceNavbar />
          <main id="main-content">
            {/*
              SEO 2026-05-28 audit: VenderHero renderiza el H1 visual via prop
              de UnifiedHero (no semántico). El server-rendered HTML no tenía
              H1 → Google veía la página sin encabezado primario. Agregamos
              H1 sr-only en el SSR initial. Visualmente invisible para no
              romper el diseño hero, accesible a screen readers y crawlers.
            */}
            <h1 className="sr-only">
              Vende tu bodega en Pucallpa — Marketplace Buleje sin comisiones
            </h1>
            <div className="border-b border-[var(--rule-muted)] bg-[var(--surface-raised)]">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3">
                <Breadcrumbs items={[{ label: "Vende en Buleje" }]} />
              </div>
            </div>
            <VenderHero />
            <VenderBenefitsGrid />
            <VenderSteps />
            <VenderRevenueCalculator />
            <VenderSocialProof />
            <VenderFAQ />
            <VenderFinalCTA />
            <RelatedFeatures features={relatedFor("vender")} />
          </main>
          <Footer />
        </div>
      </MotionProvider>
    </StoreProviders>
  );
}
