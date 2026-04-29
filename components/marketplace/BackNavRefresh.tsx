"use client";

/**
 * BackNavRefresh — Fix del bug "página de listado estática al volver de un detalle".
 *
 * Causa raíz:
 *   En Next 16 al volver de `/marketplace/[slug]` a `/tiendas` o `/marketplace`,
 *   los componentes client del listado (TiendasDestacadas, etc.) hacen fetch
 *   en useEffect SOLO al montar. Si Next reusa el árbol cliente (cache router),
 *   los useEffect no re-corren → state queda "loading" → skeletons eternos.
 *
 * Solución:
 *   Detectar transición Detail → Listado vía `usePathname()` + `sessionStorage`.
 *   Cuando entramos a un listado y la nav previa fue un detail, disparar
 *   `window.location.reload()`. Funciona para back-nav (botón ←, swipe móvil)
 *   y también para click en "Volver a Tiendas" desde el detalle.
 *
 *   No depende de `popstate` (que en algunos browsers/CDP no se dispara
 *   confiablemente con SPA navigation).
 *
 *   Marker `__bsm_just_reloaded` evita loops infinitos.
 *
 * Trade-off:
 *   El reload pierde state "in-flight" (ej. modal abierto), pero los providers
 *   persisten via localStorage (cart, theme, customer). Para el flujo típico
 *   de Brandon (entrar tienda → volver al listado) es transparente.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const FROM_DETAIL_KEY = "__bsm_from_detail";
const RELOAD_KEY = "__bsm_just_reloaded";

/** Rutas de listado que se "rompen" al volver. */
const LIST_PATHS = new Set<string>(["/tiendas", "/marketplace"]);

/** Pathnames bajo /marketplace/* que NO son detail pages (rutas reservadas). */
const MARKETPLACE_RESERVED = new Set([
  "explorar","buscar","ofertas","en-vivo","como-pagar","carrito","comparar",
  "favoritos","mi-cuenta","para-vos","recetas","gift-cards","negocios",
  "registrar","apply","calificar-entrega","payment-result","repartidor",
]);

function isStoreDetailPath(p: string | null): boolean {
  if (!p) return false;
  // /marketplace/[slug] (no sub-segments) o /tiendas/[zona]
  const mkt = p.match(/^\/marketplace\/([^\/]+)\/?$/);
  if (mkt && !MARKETPLACE_RESERVED.has(mkt[1])) return true;
  const tdz = p.match(/^\/tiendas\/([^\/]+)\/?$/);
  return Boolean(tdz);
}

function isListPath(p: string | null): boolean {
  if (!p) return false;
  return LIST_PATHS.has(p);
}

export default function BackNavRefresh() {
  const pathname = usePathname();
  const initRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Si acabamos de recargar, limpiar marker para no loopear.
    if (sessionStorage.getItem(RELOAD_KEY) === "1") {
      sessionStorage.removeItem(RELOAD_KEY);
      sessionStorage.removeItem(FROM_DETAIL_KEY);
      initRef.current = true;
      return;
    }

    // Skip first mount (página inicial — no es navegación)
    if (!initRef.current) {
      initRef.current = true;
      if (isStoreDetailPath(pathname)) {
        sessionStorage.setItem(FROM_DETAIL_KEY, pathname ?? "");
      }
      return;
    }

    // Estamos navegando a un detail → guardar marker
    if (isStoreDetailPath(pathname)) {
      sessionStorage.setItem(FROM_DETAIL_KEY, pathname ?? "");
      return;
    }

    // Estamos navegando a un listado → si veníamos de un detail, recargar.
    if (isListPath(pathname) && sessionStorage.getItem(FROM_DETAIL_KEY)) {
      sessionStorage.removeItem(FROM_DETAIL_KEY);
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    }
  }, [pathname]);

  return null;
}
