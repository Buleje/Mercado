import type { Metadata } from "next";
import ComoPagarClient from "@/components/marketplace/como-pagar/ComoPagarClient";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Cómo pagar — Yape, efectivo, transferencia",
  description:
    "Pagá tu pedido como prefieras: Yape, Plin, transferencia o efectivo al recibir. Sin tarjetas, sin complicaciones. Buleje, hecho en Pucallpa · Ucayali · Perú.",
  alternates: {
    canonical: `${BASE_URL}/marketplace/como-pagar`,
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Cómo pagar tu pedido | Buleje",
    description:
      "Yape, Plin, transferencia o efectivo al recibir. Pagá como te quede más cómodo.",
    url: `${BASE_URL}/marketplace/como-pagar`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

export default function ComoPagarPage() {
  return <ComoPagarClient />;
}
