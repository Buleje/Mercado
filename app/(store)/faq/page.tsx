import type { Metadata } from "next";
import LandingHeader from "@/components/landing/LandingHeader";
import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { MalocaAtardecer } from "@/components/ui-system/illustrations";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Preguntas frecuentes — Buleje",
  description:
    "Las dudas más comunes sobre Buleje: cómo funciona el delivery, qué necesito para empezar, cómo cobrás, qué pasa si cambio de idea.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ — Buleje",
    description:
      "Las respuestas que tu bodega necesita antes de dar el salto digital.",
    type: "website",
  },
};

export default function FaqPage() {
  return (
    <>
      <LandingHeader />
      <main id="main-content">
        <UnifiedHero
          kicker="Preguntas frecuentes"
          title="Lo que nos preguntan las bodegas"
          description="Reunimos las dudas más comunes en un solo lugar. ¿Cuánto cuesta? ¿Cómo cobran mis clientes? ¿Qué pasa si me equivoco? Pronto todas las respuestas acá."
          trustChips={["Respuestas claras", "Sin jerga técnica"]}
          illustration={MalocaAtardecer}
          variant="2col-right"
          theme="sunken"
          ctaPrimary={{ label: "Abrir mi tienda", href: "/vender" }}
          ctaSecondary={{ label: "Ver planes", href: "/precios" }}
          footnote="Contenido próximamente — accordion con 15+ preguntas frecuentes en producción."
        />
      </main>
      <Footer />
    </>
  );
}
