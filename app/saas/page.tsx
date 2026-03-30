import type { Metadata } from "next";
import dynamic from "next/dynamic";
import SaasNavbar from "@/components/saas/SaasNavbar";
import SaasHero from "@/components/saas/SaasHero";
import SaasFooter from "@/components/saas/SaasFooter";
import SaasInteractiveDemo from "@/components/saas/SaasInteractiveDemo";
import SaasBeforeAfter from "@/components/saas/SaasBeforeAfter";
import SaasActivityTicker from "@/components/saas/SaasActivityTicker";
import SaasPlanQuiz from "@/components/saas/SaasPlanQuiz";
import SaasSavingsCalculator from "@/components/saas/SaasSavingsCalculator";
import SaasDashboardDemo from "@/components/saas/SaasDashboardDemo";
import SaasStorePreview from "@/components/saas/SaasStorePreview";

export const metadata: Metadata = {
  title:
    "Buleje ERP — Sistema de Gestion para Bodegas y Minimarkets",
  description:
    "Software integral para tu bodega: ventas, inventario, fiados, WhatsApp, IA. Gratis para empezar.",
  keywords: [
    "erp bodega",
    "sistema de gestion",
    "pos bodega",
    "software minimarket",
    "erp peru",
  ],
  openGraph: {
    title: "Buleje ERP — Sistema de Gestion para Bodegas",
    description:
      "Software integral para tu bodega: ventas, inventario, fiados, WhatsApp, IA. Gratis para empezar.",
    type: "website",
    locale: "es_PE",
    url: "https://www.buleje.pe/saas",
  },
  twitter: {
    card: "summary_large_image",
    title: "Buleje ERP",
    description:
      "Software integral para tu bodega: ventas, inventario, fiados, WhatsApp, IA. Gratis para empezar.",
  },
  alternates: {
    canonical: "https://www.buleje.pe/saas",
  },
};

// Importaciones dinámicas para secciones existentes
const SaasCaracteristicas = dynamic(() => import("@/components/saas/SaasCaracteristicas").catch(() => function P() { return null; }), { ssr: true });
const SaasComoFunciona = dynamic(() => import("@/components/saas/SaasComoFunciona").catch(() => function P() { return null; }), { ssr: true });
const SaasScreenshots = dynamic(() => import("@/components/saas/SaasScreenshots").catch(() => function P() { return null; }), { ssr: true });
const SaasPlanes = dynamic(() => import("@/components/saas/SaasPlanes").catch(() => function P() { return null; }), { ssr: true });
const SaasTestimonios = dynamic(() => import("@/components/saas/SaasTestimonios").catch(() => function P() { return null; }), { ssr: true });
const SaasComparativa = dynamic(() => import("@/components/saas/SaasComparativa").catch(() => function P() { return null; }), { ssr: true });
const SaasFaq = dynamic(() => import("@/components/saas/SaasFaq").catch(() => function P() { return null; }), { ssr: true });
const SaasCTA = dynamic(() => import("@/components/saas/SaasCTA").catch(() => function P() { return null; }), { ssr: true });

export default function SaasPage() {
  return (
    <>
      <SaasNavbar />
      <main>
        {/* 1. Hero con CTA */}
        <SaasHero />

        {/* 2. Antes vs Despues (slider interactivo) */}
        <section id="antes-despues">
          <SaasBeforeAfter />
        </section>

        {/* 3. Demo interactiva (5 tabs: POS, Inventario, Reportes, Delivery, IA) */}
        <section id="demo">
          <SaasInteractiveDemo />
        </section>

        {/* 4. Dashboard animado en vivo */}
        <section id="dashboard">
          <SaasDashboardDemo />
        </section>

        {/* 5. Caracteristicas */}
        <section id="caracteristicas">
          <SaasCaracteristicas />
        </section>

        {/* 6. Calculadora de ahorro */}
        <section id="calculadora">
          <SaasSavingsCalculator />
        </section>

        {/* 7. Como funciona */}
        <section id="como-funciona">
          <SaasComoFunciona />
        </section>

        {/* 8. Generador de tienda preview */}
        <section id="preview">
          <SaasStorePreview />
        </section>

        {/* 9. Screenshots */}
        <section id="screenshots">
          <SaasScreenshots />
        </section>

        {/* 10. Planes */}
        <section id="planes">
          <SaasPlanes />
        </section>

        {/* 11. Quiz de plan */}
        <section id="quiz">
          <SaasPlanQuiz />
        </section>

        {/* 12. Testimonios */}
        <section id="testimonios">
          <SaasTestimonios />
        </section>

        {/* 13. Comparativa */}
        <section id="comparativa">
          <SaasComparativa />
        </section>

        {/* 14. FAQ */}
        <section id="faq">
          <SaasFaq />
        </section>

        {/* 15. CTA final */}
        <SaasCTA />
      </main>
      <SaasFooter />

      {/* Ticker de actividad flotante (bottom-left) */}
      <SaasActivityTicker />
    </>
  );
}
