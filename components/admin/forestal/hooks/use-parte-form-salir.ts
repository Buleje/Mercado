/**
 * Salir de la ficha del Directorio hacia otra pantalla: cerrar PRIMERO y
 * navegar DESPUÉS de que el cierre terminó.
 *
 * La ficha vive en la URL (`useFichaEnUrl`, `?parte=<id>`) y cerrarla suele
 * ser un `history.back()`, que es asíncrono. Navegar en el mismo tick deja que
 * ese «atrás» llegue después y deshaga la navegación: medido 26-10, «Crear plan
 * de manejo para este titular» cerraba la ficha y el panel se quedaba en el
 * Directorio. Por eso se espera su `popstate`.
 *
 * Si el cierre ya cambió la URL (fue un `replaceState`, síncrono) se navega al
 * toque; si no la tocó (ficha abierta sin `?parte=`), no llega ningún
 * `popstate` y un respaldo corto navega igual.
 */
export function navegarTrasCerrar(hrefAntes: string, accion: () => void, respaldoMs = 600): void {
  if (window.location.href !== hrefAntes) {
    accion();
    return;
  }
  let hecho = false;
  let respaldo = 0;
  const correr = () => {
    if (hecho) return;
    hecho = true;
    window.removeEventListener("popstate", correr);
    window.clearTimeout(respaldo);
    accion();
  };
  window.addEventListener("popstate", correr);
  respaldo = window.setTimeout(correr, respaldoMs);
}
