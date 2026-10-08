/**
 * Navegar dentro del panel SIN recargar la página (un `<a href>` normal
 * remonta todo y corta el video del mosaico): se cambia la URL y se avisa por
 * `popstate`, que es lo que escuchan `useAdminTabs` (la pestaña) y
 * `useVistaModulo` (la vista).
 */
export function navegarEnElPanel(href: string) {
  const url = new URL(href, window.location.origin);
  if (url.href === window.location.href) return;
  window.history.pushState(null, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}
