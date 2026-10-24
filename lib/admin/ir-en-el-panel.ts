import type { MouseEvent } from "react";

/**
 * Clic en un enlace `/admin?tab=…` DENTRO del panel: cambia de módulo como lo
 * hace la barra de pestañas (`pushState` + `popstate`, que escuchan
 * `useAdminTabs` y `useVistaModulo`).
 *
 * Por qué: la pestaña del panel es estado propio que sólo se resincroniza con
 * la URL en `popstate`. Un `<Link>` de Next cambia la URL y la pantalla se
 * queda donde estaba (medido 09-10: el aviso «1 producto en su mínimo» dejaba
 * `?tab=inventario` en la barra con Inicio a la vista). Un `<a>` sin esto
 * recarga la página entera.
 *
 * Clic con Ctrl/⌘/Shift/rueda: lo deja pasar (abrir en otra pestaña sigue
 * funcionando porque el elemento es un `<a href>` de verdad). El `pushState`
 * también cierra el «Cargando…» de NavProgress, que arranca en captura.
 */
export function irEnElPanel(e: MouseEvent<HTMLAnchorElement>): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const href = e.currentTarget.getAttribute("href");
  if (!href || !href.startsWith("/admin")) return;
  e.preventDefault();
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
}
