import { redirect } from "next/navigation";

/**
 * /marketplace/explorar → REDIRECT a /marketplace (Brandon 2026-06-08).
 *
 * Oleada de consolidación de navegación: el "hub de descubrimiento" de Explorar
 * duplicaba /marketplace (feed de productos) y /tiendas (directorio de tiendas)
 * y "rebotaba" a ambos sin vender. La navegación se unificó a una sola palabra
 * por concepto: Inicio · Tiendas · Mercado. Esta ruta se fusiona en /marketplace.
 *
 * Seguro: la página NUNCA leyó los `?sort/?delivery` params (los quick-links del
 * sub-nav ya los ignoraban), así que el redirect no rompe ningún filtro.
 *
 * Reversible: los componentes de `components/marketplace/explorar/` siguen en el
 * repo; restaurar el render de <ExplorarClient/> (ver git) para reactivar.
 */
export default function ExplorarPage() {
  redirect("/");
}
