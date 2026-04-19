import type { Metadata } from "next";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from "next/cache";
import ExplorarClient from "@/components/marketplace/explorar/ExplorarClient";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Explorar — Todo el catalogo de Buleje",
  description:
    "Descubri bodegas, ofertas, categorias y ocasiones en un solo lugar. Tu hub de compras en Pucallpa con delivery rapido y pago Yape o efectivo.",
  alternates: {
    canonical: `${BASE_URL}/marketplace/explorar`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Explorar — Todo el catalogo de Buleje",
    description:
      "Descubri bodegas, ofertas y categorias de todo Pucallpa en un solo lugar. Delivery rapido, pago Yape o efectivo.",
    url: `${BASE_URL}/marketplace/explorar`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

/**
 * /marketplace/explorar — Hub centro de descubrimiento.
 *
 * Pagina estilo Amazon homepage adaptada a Buleje (minimalista Holded).
 * Hereda el MarketplaceNavbar del layout padre, que expone el link
 * "Explorar" entre "Bodegas" y "Recetas".
 *
 * Ilustraciones exclusivamente del DS (25+ componentes monoline) — cero
 * fotos stock, cero emojis, cero colores saturados.
 */
export default async function ExplorarPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace-explorar");
  return <ExplorarClient />;
}
