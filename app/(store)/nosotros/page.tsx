import type { Metadata } from "next";
import LandingHeader from "@/components/landing/LandingHeader";
import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { DoniaElena } from "@/components/ui-system/illustrations";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Nosotros — Buleje",
  description:
    "Conocé la historia detrás de Buleje: la bodega de barrio que ahora vive en tu celular. Hecho en Pucallpa, para todo el Perú.",
  alternates: { canonical: "/nosotros" },
  openGraph: {
    title: "Nosotros — Buleje",
    description:
      "La bodega del barrio, ahora digital. Hecho en Pucallpa, pensado para el Perú.",
    type: "website",
  },
};

export default function NosotrosPage() {
  return (
    <>
      <LandingHeader />
      <main id="main-content">
        <UnifiedHero
          kicker="Nosotros"
          title="La bodega del barrio, ahora digital"
          description="Somos una bodega familiar de Pucallpa que decidió construir el software que nos hubiera gustado tener. Pronto contamos nuestra historia completa."
          trustChips={["Hecho en Pucallpa", "Para todo el Perú"]}
          illustration={DoniaElena}
          variant="2col-right"
          theme="canvas"
          ctaPrimary={{ label: "Abrí tu tienda gratis", href: "/vender" }}
          ctaSecondary={{ label: "Ver planes", href: "/precios" }}
          footnote="Contenido próximamente — estamos armando esta página con más detalle."
        />
      </main>
      <Footer />
    </>
  );
}
