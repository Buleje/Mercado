"use client";

import { useEffect } from "react";

/**
 * Una ficha abierta por enlace (`?proveedor=`, `?oc=`) la lee UNA sección de la
 * vista (la lista de proveedores, las órdenes). Si el enlace llega con la vista
 * ya montada en otra sección — Proveedores › Comparar → tocar un proveedor —,
 * hay que pasar a la que la lee. `useSubvistaModulo` no lo hace solo: el enlace
 * borra `?sub=` y su `popstate` no trae sección que seguir, así que la pantalla
 * se quedaba en Comparar y la ficha no abría (revisión ola 3, 10-10).
 *
 * `pedido` = `useParamPedido(param)`: cambia en cada navegación (enlace,
 * atrás/adelante), no con lo que se elige adentro.
 *
 * `sub` se escribe con `replaceState` antes de `irA`, que así no apila otra
 * entrada: queda la del enlace, con su marca, y un solo «atrás» vuelve a la
 * sección donde estabas (medido 10-10: Comparar → ficha → «atrás» = Comparar).
 * Se copian sólo las claves propias del estado: con `__NA` adentro, Next 16 no
 * sincroniza `useSearchParams`.
 */
export function useSeccionDeLaFicha(
  pedido: string | null,
  seccion: string,
  irA: (seccion: string) => void,
): void {
  useEffect(() => {
    if (!pedido) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("sub") !== seccion) {
        url.searchParams.set("sub", seccion);
        window.history.replaceState(estadoPropio(window.history.state), "", url.toString());
      }
    } catch {
      // Sin history: `irA` igual cambia la sección (y apila la entrada).
    }
    irA(seccion);
  }, [pedido, seccion, irA]);
}

/** Las claves propias del estado de la entrada (la marca de la ficha), sin las de Next. */
function estadoPropio(estado: unknown): Record<string, unknown> | null {
  if (!estado || typeof estado !== "object") return null;
  const propio = Object.fromEntries(Object.entries(estado).filter(([k]) => !k.startsWith("__")));
  return Object.keys(propio).length > 0 ? propio : null;
}
