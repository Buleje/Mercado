import type { Metadata } from "next";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from "next/cache";
import TiendasClient from "./TiendasClient";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Tiendas en Pucallpa | Buleje",
  description:
    "Todas las bodegas, minimarkets y tiendas de Pucallpa en un solo lugar. Buscá por zona, categoría y recibí delivery rápido con Yape o efectivo.",
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
      "Encontrá bodegas y tiendas cerca tuyo en Pucallpa. Delivery rápido, pago Yape o efectivo.",
    url: `${BASE_URL}/tiendas`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

/**
 * /tiendas — Directorio de tiendas del marketplace Buleje.
 *
 * Movido desde /marketplace (ronda A) donde era una vista secundaria
 * toggleada con el modo "Tiendas". Ahora es página independiente con
 * URL canónica, SEO propio y foco 100% en descubrimiento de tiendas.
 *
 * Hereda el layout raíz (app/layout.tsx) — sin MarketplaceNavbar para
 * mantenerlo como ruta top-level. Si se quiere navbar de marketplace,
 * mover a app/marketplace/tiendas/ en ronda B.
 */
export default async function TiendasPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("tiendas-directorio");
  return <TiendasClient />;
}
