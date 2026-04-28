import type { Metadata } from "next";
import TiendasClient from "./TiendasClient";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Tiendas — Ciudad Constitución y Pucallpa | Buleje Perú",
  description:
    "Bodegas, minimarkets y tiendas locales en Ciudad Constitución (Pasco) y Pucallpa (Ucayali). Hecho en Ciudad Constitución. Delivery rápido, pago Yape o efectivo.",
  alternates: {
    canonical: `${BASE_URL}/tiendas`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Tiendas — Ciudad Constitución y Pucallpa | Buleje Perú",
    description:
      "Bodegas y tiendas de Ciudad Constitución y Pucallpa. Hecho en Perú · Delivery rápido · Yape o efectivo.",
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
