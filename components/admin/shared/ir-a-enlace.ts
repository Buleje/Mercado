/**
 * Ir a un destino del panel SIN recargar: la receta única de los hipervínculos.
 *
 * Un `<a href>` normal recarga el panel entero (y corta el video de las
 * cámaras). Hasta el 09-10 había tres recetas para evitarlo; ésta es la buena
 * (la de `irAlOrigen` y `abrirFichaDelPermiso`), generalizada a un `href`:
 *
 *  - a OTRO módulo: `admin:navigate` (historial, recientes, frecuencia, limpia
 *    los `PARAMS_DE_VISTA` del módulo que se deja) y DESPUÉS se escriben los
 *    parámetros del destino con `replaceState` — antes, `navigateTab` los
 *    borraría;
 *  - al MISMO módulo: `navigateTab` al tab abierto REEMPLAZA la entrada y el
 *    «atrás» no volvería, así que va un `pushState` propio: fuera los
 *    parámetros de la vista que se deja, adentro los del destino.
 *
 * En los dos casos un `popstate` al final: con el módulo montado nada se
 * remonta, y `useVistaModulo` / `useFichaEnUrl` releen la URL.
 *
 * La entrada del mismo módulo lleva en `history.state` la URL de la que salió
 * (`MARCA_FICHA_DESDE`): si «Cerrar» de la ficha deja la URL igual a ésa,
 * `useFichaEnUrl` hace «atrás» en vez de `replaceState` — si no, quedaban dos
 * entradas iguales y el primer «atrás» después no hacía nada.
 *
 * Fuera del panel (otra ruta u otro origen) navega de verdad: ahí no hay
 * `navigateTab` que escuche el evento.
 */

import { PARAMS_DE_VISTA } from "@/hooks/use-vista-modulo";

/** ¿Esta ruta es la del panel? (`/admin` o `/admin/`; `/admin/patio` no). */
const esRutaDelPanel = (pathname: string) => /^\/admin\/?$/.test(pathname);

/**
 * Clave de `history.state` en una entrada que abrió una ficha ENCIMA de otra
 * del mismo módulo: guarda la URL de esa otra. La escriben `irAEnlace` y
 * `useFichaEnUrl.abrir`; la lee `useFichaEnUrl.cerrar`.
 */
export const MARCA_FICHA_DESDE = "bsmFichaDesde";

export type ResultadoIrAEnlace = "mismo-modulo" | "otro-modulo" | "fuera-del-panel" | "ya-estabas";

/** Navega al `href` (ruta del panel o URL completa). Devuelve qué camino tomó (para tests y medición). */
export function irAEnlace(href: string): ResultadoIrAEnlace {
  if (typeof window === "undefined") return "fuera-del-panel";
  let destino: URL;
  try {
    destino = new URL(href, window.location.href);
  } catch {
    return "fuera-del-panel";
  }
  if (
    destino.origin !== window.location.origin ||
    !esRutaDelPanel(destino.pathname) ||
    !esRutaDelPanel(window.location.pathname)
  ) {
    window.location.assign(destino.toString());
    return "fuera-del-panel";
  }

  const tab = destino.searchParams.get("tab");
  const escribirDestino = (u: URL) => {
    destino.searchParams.forEach((valor, clave) => u.searchParams.set(clave, valor));
  };
  let camino: ResultadoIrAEnlace;
  try {
    const actual = new URL(window.location.href);
    if (!tab || actual.searchParams.get("tab") === tab) {
      const nueva = new URL(actual.toString());
      /* Una `?seccion=` o una ficha de otra vista no debe viajar. */
      for (const p of PARAMS_DE_VISTA) nueva.searchParams.delete(p);
      escribirDestino(nueva);
      if (nueva.toString() === actual.toString()) return "ya-estabas";
      window.history.pushState({ [MARCA_FICHA_DESDE]: actual.toString() }, "", nueva.toString());
      camino = "mismo-modulo";
    } else {
      window.dispatchEvent(
        new CustomEvent("admin:navigate", {
          detail: {
            tab,
            vista: destino.searchParams.get("vista") ?? undefined,
            sub: destino.searchParams.get("sub") ?? undefined,
          },
        }),
      );
      const despues = new URL(window.location.href);
      escribirDestino(despues);
      window.history.replaceState(null, "", despues.toString());
      camino = "otro-modulo";
    }
  } catch {
    /* Sin history (iframe restringido): el evento ya pidió el cambio de módulo. */
    camino = tab ? "otro-modulo" : "mismo-modulo";
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
  return camino;
}
