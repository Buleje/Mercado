import type { Metadata } from "next";
import TiendasClient from "./TiendasClient";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Tiendas en Pucallpa | Buleje",
  description:
    "Todas las bodegas, minimarkets y tiendas de Pucallpa en un solo lugar. Busca por zona, categoría y recibe delivery rápido con Yape o efectivo.",
  alternates: {
    canonical: `${BASE_URL}/tiendas`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Tiendas en Pucallpa | Buleje",
    description:
      "Encuentra bodegas y tiendas cerca tuyo en Pucallpa. Delivery rápido, pago Yape o efectivo.",
    url: `${BASE_URL}/tiendas`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

/**
 * /tiendas — Directorio de tiendas del marketplace Buleje.
 *
 * Sin "use cache" — el page renderiza fresh cada nav. El client component
 * trae los datos via fetch (que tiene su propio Cache-Control de 60s
 * en el endpoint /api/marketplace/stores). Next 16 + cacheComponents
 * prohíbe `export const revalidate` (ADR-019).
 */
export default async function TiendasPage() {
  return <TiendasClient />;
}
