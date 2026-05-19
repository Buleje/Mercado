"use client";

/**
 * ConditionalGlobalChrome — oculta en mobile el chrome global del marketplace
 * (promo bar + navbar + secondary nav) cuando la ruta es un storefront
 * `/marketplace/[slug]/*`, porque el storefront tiene su propio top fixed
 * nav diseñado específicamente para ese contexto.
 *
 * Brandon mayo 15 2026: antes el chrome global se apilaba con mi nav fijo
 * del storefront y dejaba un espacio en blanco de ~106px arriba.
 *
 * Desktop: siempre visible (mi nav del storefront es lg:hidden).
 */

import { usePathname } from "next/navigation";

// Rutas reservadas: primer segmento debajo de /marketplace que NO es un
// slug de tienda (storefront).
const RESERVED_FIRST_SEGMENTS = new Set([
  "explorar",
  "ofertas",
  "categoria",
  "buscar",
  "mi-cuenta",
  "recetas",
  "carrito",
  "repartidor",
  "registrar",
  "apply",
  "negocios",
  "favoritos",
  "para-vos",
  "en-vivo",
  "payment-result",
  "calificar-entrega",
  "comparar",
  "gift-cards",
  "como-pagar",
]);

function isStorefrontRoute(pathname: string): boolean {
  // /marketplace/{slug}[/...]  →  m[1] = "{slug}"
  const m = pathname.match(/^\/marketplace\/([^/]+)(\/.*)?$/);
  if (!m) return false;
  return !RESERVED_FIRST_SEGMENTS.has(m[1]);
}

export default function ConditionalGlobalChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const hideOnMobile = isStorefrontRoute(pathname);
  return (
    <div className={hideOnMobile ? "hidden lg:block" : ""}>
      {children}
    </div>
  );
}
