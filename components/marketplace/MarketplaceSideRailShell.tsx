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
 * Estado colapsado/expandido: localStorage `buleje-navrail-expanded`; la
 * hamburguesa del navbar lo togglea vía el evento cancelable
 * `buleje:toggle-navrail` (preventDefault marca que lo manejó el rail).
 */

import { useEffect, useRef, useState } from "react";
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
  const m = pathname.match(/^\/marketplace\/([^/]+)/);
  if (m) return MARKETPLACE_SECTION_SEGMENTS.has(m[1]);
  return false;
}

export default function MarketplaceSideRailShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const show = shouldShowRail(pathname);

  const asideRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  // Brandon 2026-06-10: el rail es FIJO. Expande/colapsa SOLO con el botón ☰;
  // no se auto-colapsa al sacar el mouse, click-fuera ni Escape. El estado
  // persiste en localStorage. (El rail vive en la columna del flex, no es un
  // overlay: expandido empuja el contenido, no lo tapa.)
  const toggle = () =>
    setExpanded((v) => {
      const next = !v;
      try { localStorage.setItem("buleje-navrail-expanded", next ? "1" : "0"); } catch {}
      return next;
    });

  useEffect(() => {
    try { setExpanded(localStorage.getItem("buleje-navrail-expanded") === "1"); } catch {}
    const onToggle = (e: Event) => {
      e.preventDefault(); // marca al navbar que el rail manejó el toggle
      toggle();
    };
    window.addEventListener("buleje:toggle-navrail", onToggle as EventListener);
    return () => window.removeEventListener("buleje:toggle-navrail", onToggle as EventListener);
  }, []);

  // Passthrough total en rutas no-marketplace → cero cambios de layout ahí.
  if (!show) return <>{children}</>;

  return (
    <div className="lg:flex lg:items-start w-full">
      {/* Rail sticky bajo el nav + sub-nav fijos. Flush a la izquierda. */}
      <aside
        ref={asideRef}
        aria-label="Navegación lateral"
        className={`hidden lg:block lg:sticky lg:top-28 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto shrink-0 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-[width] duration-200 ${
          expanded ? "lg:w-[224px]" : "lg:w-[76px]"
        }`}
      >
        <MarketplaceNavRail expanded={expanded} onToggle={toggle} />
      </aside>

      {/* Contenido de la página — se expande sobre el espacio del rail. */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
