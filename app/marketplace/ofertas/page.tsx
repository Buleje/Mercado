import type { Metadata } from "next";
import OfertasClient from "@/components/marketplace/ofertas/OfertasClient";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Ofertas — Precios que no te puedes perder",
  description:
    "Descuentos reales en bodegas cerca tuyo. Hoy ahorrás en lo que mas usas. Ofertas de esta semana en Pucallpa — delivery rápido, pago Yape o efectivo.",
  alternates: {
    canonical: `${BASE_URL}/marketplace/ofertas`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Ofertas — Precios que no te puedes perder",
    description:
      "Descuentos reales en bodegas de Pucallpa. Ahorra en abarrotes, frescos, bebidas y mas. Termina pronto.",
    url: `${BASE_URL}/marketplace/ofertas`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

/**
 * /marketplace/ofertas — Pagina de ofertas estilo Amazon "Today's Deals".
 * MVP: datos mock de lib/mock-deals.ts. Sin DB, sin Prisma.
 * Hereda layout con MarketplaceNavbar del layout padre.
 */
export default function OfertasPage() {
  return <OfertasClient />;
}
