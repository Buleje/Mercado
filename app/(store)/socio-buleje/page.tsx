import type { Metadata } from "next";
import { SocioHero } from "@/components/socio-buleje/SocioHero";
import { SocioBeneficios } from "@/components/socio-buleje/SocioBeneficios";
import { SocioCalculadora } from "@/components/socio-buleje/SocioCalculadora";
import { SocioComparacion } from "@/components/socio-buleje/SocioComparacion";
import { SocioTestimonios } from "@/components/socio-buleje/SocioTestimonios";
import { SocioFAQ } from "@/components/socio-buleje/SocioFAQ";
import { SocioCTAFinal } from "@/components/socio-buleje/SocioCTAFinal";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";

/**
 * /socio-buleje — Landing pública de la membresía Socio Buleje.
 *
 * Estructura:
 * 1. Hero 2-col (copy + ilustración + CTA)
 * 2. Beneficios (6 cards)
 * 3. Calculadora de ahorro
 * 4. Comparación Invitado vs Socio
 * 5. Testimonios (3 cards)
 * 6. FAQ (8 items)
 * 7. CTA Final
 */

export const metadata: Metadata = {
  title: "Socio Buleje — tu bodega de confianza todo el mes",
  description:
    "Delivery gratis ilimitado, 5% cashback en cada compra y precios exclusivos en las bodegas de tu barrio. Desde S/ 19/mes. 30 días gratis sin tarjeta.",
  alternates: {
    canonical: "https://www.buleje.pe/socio-buleje",
  },
  openGraph: {
    title: "Socio Buleje — Ahorrá todo el año en tu bodega",
    description:
      "Delivery gratis, cashback 5%, precios exclusivos. Suscripción mensual o anual, sin permanencia.",
    url: "https://www.buleje.pe/socio-buleje",
    type: "website",
    locale: "es_PE",
    siteName: "Buleje",
  },
  twitter: {
    card: "summary_large_image",
    title: "Socio Buleje — Ahorrá todo el año en tu bodega",
    description:
      "Delivery gratis, cashback 5%, precios exclusivos. 30 días gratis.",
  },
};

export default function SocioBulejePage() {
  return (
    <>
      <main id="main-content" className="bg-[var(--surface-canvas)]">
        <SocioHero />
        <SocioBeneficios />
        <SocioCalculadora />
        <SocioComparacion />
        <SocioTestimonios />
        <SocioFAQ />
        <SocioCTAFinal />
        <RelatedFeatures features={relatedFor("socio-buleje")} />
      </main>
    </>
  );
}
