import type { Metadata } from "next";
import TiendasClient from "./TiendasClient";
import { getInitialMarketplaceStores } from "@/lib/marketplace/initial-stores";

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
 * Fix bug back-nav cross-layout (Next 16): pre-fetch de stores en el server
 * vía `getInitialMarketplaceStores` (con Cache Components + cacheTag) y los
 * pasamos como prop initial al client. El HTML server-rendered ya tiene la
 * lista materializada, así que aunque la hidratación cliente quede frozen
 * tras un back nav, los items siguen visibles.
 *
 * El client sigue haciendo su useEffect fetch para refrescar/filtrar; el prop
 * solo cubre el render inicial.
 */
export default async function TiendasPage() {
  const initialStores = await getInitialMarketplaceStores();
  return <TiendasClient initialStores={initialStores} />;
}
