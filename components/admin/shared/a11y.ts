import type { KeyboardEvent, SyntheticEvent } from "react";

/**
 * activateProps — hace accesible por teclado un elemento NO-nativo (div/span/li)
 * que tiene un onClick de "activar" (abrir detalle, seleccionar fila, etc.).
 *
 * Raíz del fix de los warnings `jsx-a11y/click-events-have-key-events` que son
 * elementos GENUINAMENTE interactivos (cards/filas clickeables) — NO backdrops
 * de modal (esos se dejan: Radix ya maneja Escape/focus-trap; hacerlos tabbables
 * empeora el orden de tabulación).
 *
 * Devuelve role="button" + tabIndex=0 + onClick + onKeyDown (Enter/Espacio) con
 * UNA sola fuente de la lógica de teclado. Uso:
 *
 *   <div {...activateProps(() => openDetail(c))} className="...">
 *
 * NO usar cuando el elemento ya contiene un <button>/<a> propio (sería
 * interactivo-anidado): en ese caso el control nativo interno es el path de
 * teclado y el onClick externo es solo una conveniencia de mouse.
 */
export function activateProps(onActivate: (e: SyntheticEvent) => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(e);
      }
    },
  };
}
