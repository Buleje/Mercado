import type { Metadata } from "next";
import dynamic from "next/dynamic";
import SaasNavbar from "@/components/saas/SaasNavbar";
import SaasHero from "@/components/saas/SaasHero";
import Footer from "@/components/Footer";
import SaasInteractiveDemo from "@/components/saas/SaasInteractiveDemo";
import SaasBeforeAfter from "@/components/saas/SaasBeforeAfter";
import SaasActivityTicker from "@/components/saas/SaasActivityTicker";
import SaasPlanQuiz from "@/components/saas/SaasPlanQuiz";
import SaasSavingsCalculator from "@/components/saas/SaasSavingsCalculator";
import SaasDashboardDemo from "@/components/saas/SaasDashboardDemo";
import SaasStorePreview from "@/components/saas/SaasStorePreview";
import SaasDemoLauncher from "@/components/saas/SaasDemoLauncher";

export const metadata: Metadata = {
  title: "Buleje ERP — Sistema de Gestion para Bodegas y Minimarkets",
  description: "Software integral para tu bodega: ventas, inventario, fiados, WhatsApp, IA. Gratis para empezar.",
  keywords: ["erp bodega", "sistema de gestion", "pos bodega", "software minimarket", "erp peru"],
  openGraph: {
    title: "Buleje ERP — Sistema de Gestion para Bodegas",
    description: "Software integral para tu bodega: ventas, inventario, fiados, WhatsApp, IA. Gratis para empezar.",
    type: "website",
    locale: "es_PE",
    url: "https://www.buleje.pe/saas",
  },
  twitter: { card: "summary_large_image", title: "Buleje ERP", description: "Software integral para tu bodega. Gratis para empezar." },
  alternates: { canonical: "https://www.buleje.pe/saas" },
};

const SaasPlanes = dynamic(() => import("@/components/saas/SaasPlanes").catch(() => function P() { return null; }), { ssr: true });
const SaasTestimonios = dynamic(() => import("@/components/saas/SaasTestimonios").catch(() => function P() { return null; }), { ssr: true });
const SaasFaq = dynamic(() => import("@/components/saas/SaasFaq").catch(() => function P() { return null; }), { ssr: true });
const SaasCTA = dynamic(() => import("@/components/saas/SaasCTA").catch(() => function P() { return null; }), { ssr: true });

export default function SaasPage() {
  return (
    <>
      <SaasNavbar />
      <main>
        {/* 1. Hero — primera impresion con CTA */}
        <SaasHero />

        {/* 2. Antes vs Despues — slider visual de impacto */}
        <section id="antes-despues">
          <SaasBeforeAfter />
        </section>

        {/* 3. Demo interactiva — 5 mini-apps funcionales (POS, Inventario, Reportes, Delivery, IA) */}
        <section id="demo">
          <SaasInteractiveDemo />
        </section>

        {/* 4. Dashboard en vivo — KPIs animados + graficos + alertas */}
        <section id="dashboard">
          <SaasDashboardDemo />
        </section>

        {/* 5. Calculadora de ahorro — sliders personalizados */}
        <section id="calculadora">
          <SaasSavingsCalculator />
        </section>

        {/* 6. Generador de tienda — escribe tu nombre y ve tu tienda al instante */}
        <section id="preview">
          <SaasStorePreview />
        </section>

        {/* 7. Demo en vivo — crear tienda ficticia con datos reales */}
        <section id="demo-live">
          <SaasDemoLauncher />
        </section>

        {/* 8. Planes y precios */}
        <section id="planes">
          <SaasPlanes />
        </section>

        {/* 8. Quiz — 3 preguntas para saber tu plan ideal */}
        <section id="quiz">
          <SaasPlanQuiz />
        </section>

        {/* 9. Testimonios */}
        <section id="testimonios">
          <SaasTestimonios />
        </section>

        {/* 10. FAQ */}
        <section id="faq">
          <SaasFaq />
        </section>

        {/* 11. CTA final */}
        <SaasCTA />
      </main>
      <Footer />
      <SaasActivityTicker />
    </>
  );
}
