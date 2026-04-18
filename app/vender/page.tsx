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
import VenderFinalCTA from "@/components/vender/VenderFinalCTA";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";

export const metadata: Metadata = {
  title: "Vendé en Buleje — Abrí tu tienda en Pucallpa en 5 minutos",
  description:
    "Sumá tu bodega al marketplace de Ucayali. Sin letra chica, sin comisiones escondidas. Gratis el primer mes, soporte en español, pagos con Yape.",
  openGraph: {
    title: "Vendé en Buleje",
    description:
      "Abrí tu tienda online con la plataforma que usan las bodegas de Pucallpa. Gratis el primer mes.",
    type: "website",
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
        <div className="min-h-screen bg-[var(--surface-canvas)]">
          <MarketplaceNavbar />
          <main id="main-content">
            <div className="border-b border-[var(--rule-muted)] bg-[var(--surface-raised)]">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3">
                <Breadcrumbs items={[{ label: "Vendé en Buleje" }]} />
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
