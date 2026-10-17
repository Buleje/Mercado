/**
 * navegacion.ts — ¿la página se está yendo?
 *
 * Sin `"use client"`: lo importa `lib/errores/sin-dato.ts`, que también corre en
 * rutas del servidor. Los listeners van detrás de `typeof window`; en el
 * servidor la bandera queda en `false`.
 *
 * Al navegar, el navegador corta los pedidos en vuelo y cada uno rechaza con
 * «TypeError: Failed to fetch». Los best-effort del panel lo registraban como
 * falla, así que salir de una pantalla dejaba seis warnings en la consola
 * —doce en desarrollo, por el doble montaje de React— y el ruido tapaba las
 * fallas de verdad (Brandon, 2026-09-11: «resolvé estos errores»).
 *
 * El orden está MEDIDO en Chrome: `beforeunload` → `pagehide` → el rechazo del
 * fetch. Con la bandera puesta en `pagehide`, quien atiende el error ya sabe que
 * el pedido no fracasó: nadie está esperando esa respuesta. Un `AbortController`
 * no alcanza para este caso: en una navegación completa React no corre los
 * cleanups de los efectos, así que nadie llega a abortar nada.
 *
 * `pageshow` la baja: con bfcache la misma página puede volver viva, y dejarla
 * encendida silenciaría fallas reales por el resto de la sesión.
 *
 * Nació en `lib/forestal/ctp-fetch.ts` y se mudó acá cuando el prefetch del
 * panel y el menú de mensajes necesitaron lo mismo: no es del libro forestal.
 */

let seVaLaPagina = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    seVaLaPagina = true;
  });
  window.addEventListener("pageshow", () => {
    seVaLaPagina = false;
  });
}

/**
 * `true` si el pedido se cortó porque la página se está yendo.
 *
 * Para los `catch` best-effort: `if (laPaginaSeEstaYendo()) return;` antes de
 * avisar. Nunca para decidir la lógica — sólo si vale la pena loguear.
 */
export function laPaginaSeEstaYendo(): boolean {
  return seVaLaPagina;
}
