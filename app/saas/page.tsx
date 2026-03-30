import type { Metadata } from "next";
import dynamic from "next/dynamic";
import SaasNavbar from "@/components/saas/SaasNavbar";
import SaasHero from "@/components/saas/SaasHero";
import SaasFooter from "@/components/saas/SaasFooter";
import SaasInteractiveDemo from "@/components/saas/SaasInteractiveDemo";

export const metadata: Metadata = {
  title:
    "Buleje ERP — Sistema de Gestión para Bodegas y Minimarkets",
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
    title: "Buleje ERP — Sistema de Gestión para Bodegas",
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

// Importaciones dinámicas para secciones pesadas que vendrán de otros agentes
const SaasCaracteristicas = dynamic(
  () =>
    import("@/components/saas/SaasCaracteristicas").catch(
      () =>
        function Placeholder() {
          return null;
        }
    ),
  { ssr: true }
);

const SaasComoFunciona = dynamic(
  () =>
    import("@/components/saas/SaasComoFunciona").catch(
      () =>
        function Placeholder() {
          return null;
        }
    ),
  { ssr: true }
);

const SaasScreenshots = dynamic(
  () =>
    import("@/components/saas/SaasScreenshots").catch(
      () =>
        function Placeholder() {
          return null;
        }
    ),
  { ssr: true }
);

const SaasPlanes = dynamic(
  () =>
    import("@/components/saas/SaasPlanes").catch(
      () =>
        function Placeholder() {
          return null;
        }
    ),
  { ssr: true }
);

const SaasTestimonios = dynamic(
  () =>
    import("@/components/saas/SaasTestimonios").catch(
      () =>
        function Placeholder() {
          return null;
        }
    ),
  { ssr: true }
);

const SaasComparativa = dynamic(
  () =>
    import("@/components/saas/SaasComparativa").catch(
      () =>
        function Placeholder() {
          return null;
        }
    ),
  { ssr: true }
);

const SaasFaq = dynamic(
  () =>
    import("@/components/saas/SaasFaq").catch(
      () =>
        function Placeholder() {
          return null;
        }
    ),
  { ssr: true }
);

const SaasCTA = dynamic(
  () =>
    import("@/components/saas/SaasCTA").catch(
      () =>
        function Placeholder() {
          return null;
        }
    ),
  { ssr: true }
);

export default function SaasPage() {
  return (
    <>
      <SaasNavbar />
      <main>
        <SaasHero />

        <section id="caracteristicas">
          <SaasCaracteristicas />
        </section>

        <section id="demo">
          <SaasInteractiveDemo />
        </section>

        <section id="como-funciona">
          <SaasComoFunciona />
        </section>

        <section id="screenshots">
          <SaasScreenshots />
        </section>

        <section id="planes">
          <SaasPlanes />
        </section>

        <section id="testimonios">
          <SaasTestimonios />
        </section>

        <section id="comparativa">
          <SaasComparativa />
        </section>

        <section id="faq">
          <SaasFaq />
        </section>

        <SaasCTA />
      </main>
      <SaasFooter />
    </>
  );
}
