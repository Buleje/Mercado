import { redirect } from "next/navigation";

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
export default function MarketplacePage() {
  redirect("/");
}
