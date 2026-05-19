import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import ExplorarClient from "@/components/marketplace/explorar/ExplorarClient";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Explorar — Todo el catálogo de Buleje",
  description:
    "Descubri bodegas, ofertas, categorias y ocasiones en un solo lugar. Tu hub de compras en Pucallpa con delivery rápido y pago Yape o efectivo.",
  alternates: {
    canonical: `${BASE_URL}/marketplace/explorar`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Explorar — Todo el catálogo de Buleje",
    description:
      "Descubri bodegas, ofertas y categorias de todo Pucallpa en un solo lugar. Delivery rápido, pago Yape o efectivo.",
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
 *
 * Audit 2026-05-17 02-P2-1 (TD-055): `"use cache"` aquí caché el shell
 * del page (metadata + JSX) pero el contenido real es <ExplorarClient />
 * client-side (306 LOC). El cache reduce la latencia inicial del render
 * pero NO elimina el bundle JS que se hidrata. Para verdadero beneficio
 * server-cache:
 *   1. Mover los fetches de datos a server (categorías, deals, banners)
 *   2. Pasar data como props serializable al client component
 *   3. ExplorarClient queda como island reducido (solo interactividad)
 * Refactor pendiente — requiere coordinación con design system (illustration
 * components ya son client). Defer a sprint dedicado.
 */
export default async function ExplorarPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace-explorar");
  return <ExplorarClient />;
}
