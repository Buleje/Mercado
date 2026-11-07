import { redirect } from "next/navigation";
import { connection } from "next/server";

/**
 * /marketplace → REDIRECT a / (Brandon 2026-06-08).
 *
 * Fusión de superficies: la HOME (`/`) es ahora la única superficie de compra
 * (search-first), y /tiendas el directorio de negocios. /marketplace se fusiona
 * en la home → "Inicio" y "Mercado" ya no son dos destinos distintos.
 *
 * Reversible: el feed (`MarketplaceContent`, catálogo, bestsellers, right-rail)
 * sigue en el repo. Si se decide mover el grid de catálogo a la home, restaurar
 * el render de este page o embeber `<MarketplaceContent/>` en `/`.
 */
export default async function MarketplacePage() {
  // 04-11: los metadatos del layout de la tienda leen el negocio en runtime
  // (`resolveStoreContext`); con la página «fija» Next 16 avisaba en cada
  // visita «uncached data in generateMetadata()». La página también es de
  // runtime (redirige), así que se declara.
  await connection();
  redirect("/");
}
