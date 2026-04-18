import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DescubriHero } from "@/components/descubri/DescubriHero";
import { FeaturesGrid9 } from "@/components/descubri/FeaturesGrid9";
import { PathsByProfile } from "@/components/descubri/PathsByProfile";
import { IntegrationDiagram } from "@/components/descubri/IntegrationDiagram";
import { TestimoniosEditorial } from "@/components/descubri/TestimoniosEditorial";
import { DescubriFAQ } from "@/components/descubri/DescubriFAQ";
import { DescubriCTAFinal } from "@/components/descubri/DescubriCTAFinal";

/**
 * /descubri — Hub meta-landing que agrupa todas las features Amazon-level.
 *
 * Stack de 7 secciones en scroll:
 *   1. Hero editorial 2-col con collage de 4 ilustraciones
 *   2. Features grid 3x3 (9 cards)
 *   3. Paths by profile (4 caminos)
 *   4. Integration diagram (SVG custom)
 *   5. Testimonios editoriales (3 cards)
 *   6. FAQ (8 items)
 *   7. CTA final horizontal con 3 botones + asistente
 */

export const metadata: Metadata = {
  title:
    "Descubrí todo lo que Buleje puede hacer por tu hogar — Pucallpa y Ucayali",
  description:
    "10 features nuevas gratis: Comparar productos, Bodega al Mes, Gift Cards, Socio Buleje, En Vivo, Asistente IA, Seguimiento en tiempo real, 1-Click Buy y Vendé en Buleje.",
  alternates: {
    canonical: "https://www.buleje.pe/descubri",
  },
  openGraph: {
    title: "Descubrí Buleje — 10 features para tu hogar",
    description:
      "Pucallpa y el Ucayali, ahora en una sola app. De la bodega del barrio al mundo digital.",
    url: "https://www.buleje.pe/descubri",
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Descubrí Buleje — 10 features para tu hogar",
    description:
      "10 features nuevas gratis: Comparar, Gift Cards, Socio, En Vivo, Asistente IA y más.",
  },
};

const MarketplaceNavbar = dynamic(
  () => import("@/components/marketplace/MarketplaceNavbar"),
  { ssr: true },
);
const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });

export default function DescubriHubPage() {
  return (
    <>
      <MarketplaceNavbar />
      <main id="main-content" className="bg-[var(--surface-canvas)]">
        <DescubriHero />
        <FeaturesGrid9 />
        <PathsByProfile />
        <IntegrationDiagram />
        <TestimoniosEditorial />
        <DescubriFAQ />
        <DescubriCTAFinal />
      </main>
      <Footer />
    </>
  );
}
