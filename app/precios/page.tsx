import type { Metadata } from "next";
import LandingHeader from "@/components/landing/LandingHeader";
import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { CuadernoFiadoReal } from "@/components/ui-system/illustrations";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Precios — Buleje",
  description:
    "Planes claros, sin letra chica. Empezá gratis y escalá cuando tu bodega lo necesite. Sin comisiones escondidas.",
  alternates: { canonical: "/precios" },
  openGraph: {
    title: "Precios — Buleje",
    description:
      "Planes transparentes para bodegas y minimarkets del Perú. Gratis el primer mes.",
    type: "website",
  },
};

export default function PreciosPage() {
  return (
    <>
      <LandingHeader />
      <main id="main-content">
        <UnifiedHero
          kicker="Precios"
          title="Planes claros, sin letra chica"
          description="Empezá gratis y escalá cuando tu bodega lo necesite. Sin comisiones escondidas, sin permanencia, sin sorpresas. Estamos ultimando los detalles de los planes."
          trustChips={["Sin permanencia", "Cancelá cuando quieras", "Soporte en español"]}
          illustration={CuadernoFiadoReal}
          variant="2col-right"
          theme="sunken"
          ctaPrimary={{ label: "Empezar gratis", href: "/vender/registro" }}
          ctaSecondary={{ label: "Hablar con ventas", href: "/nosotros" }}
          footnote="Contenido próximamente — tabla comparativa de planes en construcción."
        />
      </main>
      <Footer />
    </>
  );
}
