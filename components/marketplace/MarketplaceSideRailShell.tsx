"use client";

/**
 * MarketplaceSideRailShell — pone el rail de navegación lateral (estilo YouTube)
 * AL LADO del contenido en TODAS las páginas de la superficie marketplace
 * (Brandon 2026-06-07), no solo en /marketplace. Vive en el (store) layout
 * envolviendo {children}, así es tan reutilizable como el nav y el sub-nav.
 *
 * Comportamiento:
 *   · En rutas de la superficie marketplace (home /marketplace, secciones como
 *     /marketplace/explorar · /ofertas · /en-vivo, /tiendas, /recetas) →
 *     renderiza [rail sticky | contenido flex-1].
 *   · En cualquier otra ruta (landing /, /cuenta, /checkout, storefront
 *     /marketplace/[slug], etc.) → PASSTHROUGH: devuelve {children} sin tocar
 *     nada (cero impacto en esas páginas).
 *
 * Brandon 2026-06-13: rail FIJO y completo (sin hamburguesa). Ancho constante;
 * MarketplaceNavRail muestra TODOS los enlaces compactos. Se eliminó el estado
 * expandido/colapsado y el evento `buleje:toggle-navrail`.
 */

import { usePathname } from "next/navigation";
import MarketplaceNavRail from "@/components/marketplace/MarketplaceNavRail";

// Segmentos de /marketplace/<x> que SON páginas de sección (no storefronts de
// tienda). En esos el rail aparece; en /marketplace/<slug-de-tienda> no.
const MARKETPLACE_SECTION_SEGMENTS = new Set([
  "explorar",
  "ofertas",
  "en-vivo",
  "buscar",
  "comparar",
  "categoria",
  "gift-cards",
  "para-vos",
]);

// Rutas de FLUJO bajo /marketplace que NO son storefronts ni secciones de
// navegación (carrito, cuenta, pago, etc.) → sin rail para no distraer.
const MARKETPLACE_NON_RAIL_SEGMENTS = new Set([
  "apply",
  "carrito",
  "como-pagar",
  "favoritos",
  "mi-cuenta",
  "payment-result",
  "registrar",
  "repartidor",
  "calificar-entrega",
]);

function shouldShowRail(pathname: string): boolean {
  if (!pathname) return false;
  // Brandon 2026-06-08: la HOME (/) es ahora la superficie de compra (absorbió
  // /marketplace) → lleva el mismo rail lateral izquierdo que tenía el marketplace.
  if (pathname === "/") return true;
  if (pathname === "/marketplace") return true;
  if (pathname.startsWith("/tiendas")) return true;
  if (pathname.startsWith("/recetas")) return true;
  // Brandon 2026-06-10: el rail lateral también en Negocios y Abre tu Tienda
  // (estaban como passthrough) → navegación lateral presente en TODAS las
  // páginas del nav (Inicio·Tiendas·En Vivo·Recetas·Ofertas·Negocios·Abre tu Tienda).
  if (pathname.startsWith("/negocios")) return true;
  if (pathname.startsWith("/abrir-tienda")) return true;
  // Brandon 2026-07-04: la membresía Socio Buleje (landing + panel) también
  // lleva el rail lateral, como el resto del nav.
  if (pathname.startsWith("/socio-buleje")) return true;
  if (pathname.startsWith("/cuenta/socio-buleje")) return true;
  const m = pathname.match(/^\/marketplace\/([^/]+)/);
  if (m) {
    // Secciones de navegación del marketplace → rail.
    if (MARKETPLACE_SECTION_SEGMENTS.has(m[1])) return true;
    // Flujos (carrito, cuenta, pago…) → sin rail.
    if (MARKETPLACE_NON_RAIL_SEGMENTS.has(m[1])) return false;
    // El resto = storefront de una tienda (/marketplace/<slug>) y su detalle de
    // producto → llevan el mismo rail (pedido explícito Brandon).
    return true;
  }
  return false;
}

export default function MarketplaceSideRailShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const show = shouldShowRail(pathname);

  // Passthrough total en rutas no-marketplace → cero cambios de layout ahí.
  if (!show) return <>{children}</>;

  return (
    <div className="lg:flex lg:items-start w-full">
      {/* Rail sticky bajo el nav + sub-nav fijos. Flush a la izquierda. Ancho
          fijo (~84px): todos los enlaces compactos siempre visibles. */}
      <aside
        aria-label="Navegación lateral"
        className="hidden lg:block lg:sticky lg:top-28 lg:max-h-[calc(100vh-7.5rem)] lg:w-[84px] lg:overflow-y-auto shrink-0 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <MarketplaceNavRail />
      </aside>

      {/* Contenido de la página — ocupa el resto del ancho. */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
