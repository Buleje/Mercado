import type { Metadata } from "next";
import LandingHeader from "@/components/landing/LandingHeader";
import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { MotorizadoUcayali } from "@/components/ui-system/illustrations";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Cómo funciona — Buleje",
  description:
    "Tu bodega online en 4 pasos: registrás, cargás productos, recibís pedidos y cobrás. Todo desde tu celular, sin necesidad de computadora.",
  alternates: { canonical: "/como-funciona" },
  openGraph: {
    title: "Cómo funciona Buleje",
    description:
      "De bodega física a tienda online en menos de una tarde. Mirá cómo.",
    type: "website",
  },
};

export default function ComoFuncionaPage() {
  return (
    <>
      <LandingHeader />
      <main id="main-content">
        <UnifiedHero
          kicker="Cómo funciona"
          title="De tu bodega al celular de tus clientes"
          description="Registrás, cargás productos, recibís pedidos y cobrás con Yape o efectivo. Todo desde tu teléfono. Pronto explicamos cada paso con detalle."
          trustChips={["4 pasos simples", "Sin computadora", "Delivery incluido"]}
          illustration={MotorizadoUcayali}
          variant="2col-left"
          theme="canvas"
          ctaPrimary={{ label: "Quiero abrir mi tienda", href: "/vender" }}
          ctaSecondary={{ label: "Ver precios", href: "/precios" }}
          footnote="Contenido próximamente — video y stepper interactivo en producción."
        />
      </main>
      <Footer />
    </>
  );
}
