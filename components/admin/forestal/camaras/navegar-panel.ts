/**
 * Navegar dentro del panel SIN recargar la página (un `<a href>` normal
 * remonta todo y corta el video del mosaico).
 *
 * Desde el 09-10 es un envoltorio de `irAEnlace`, la receta única de los
 * hipervínculos del panel: a otro módulo pasa por `admin:navigate` (cuenta en
 * recientes y frecuencia, limpia los parámetros del módulo que se deja) y al
 * mismo módulo hace `pushState`; los dos terminan en `popstate`, que es lo que
 * escuchan `useAdminTabs` (la pestaña) y `useVistaModulo` (la vista).
 */
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";

export function navegarEnElPanel(href: string) {
  irAEnlace(href);
}
