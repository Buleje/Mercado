/**
 * Un enlace (`EnlacePanel`) dentro de una ventana forestal: el clic normal
 * navega a la ficha en la MISMA pestaña, así que la ventana tiene que cerrarse
 * antes (si no, queda encima de la ficha). Ctrl/cmd + clic, shift o la rueda
 * abren otra pestaña: ahí la ventana se queda como estaba.
 *
 *   <EnlacePanel cosa="troza" id={t.id} onClick={cerrarAlNavegar(onClose)}>…
 */

import type { MouseEvent } from "react";

/** ¿El navegador abre el enlace en otra pestaña o ventana (y esta página se queda)? */
export function abreEnOtraPestana(e: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/** `onClick` del enlace: cierra la ventana sólo si el clic navega en esta pestaña. */
export function cerrarAlNavegar(cerrar: () => void) {
  return (e: MouseEvent) => {
    if (!abreEnOtraPestana(e)) cerrar();
  };
}
