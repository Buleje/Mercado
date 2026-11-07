/**
 * «Registrar tala» desde el mapa: el enlace que lleva a la sección Tala del
 * Libro TH con el árbol ya elegido.
 *
 *   ?tab=loth-libro-operaciones&vista=secciones&seccion=tala&nuevaTala=<código>
 *
 * Quien lee `nuevaTala` y abre el alta de tala es el libro (no el mapa): acá
 * sólo se arma la dirección y se navega. Hoy el libro lo lee AL MONTAR
 * (`LothLibroOperaciones`), y el mapa está adentro del libro ya montado: por
 * eso, si nadie recogió el parámetro, se entra por la dirección (ver abajo).
 *
 * El mapa vive DENTRO del libro, así que navegar es `pushState` propio + un
 * `popstate` (la receta de `ficha-del-permiso-url`): `admin:navigate` al tab en
 * el que ya se está reemplaza la entrada del historial y el «atrás» ya no
 * volvería al mapa. Con el `popstate`, `useVistaModulo` relee la URL y pasa a
 * «secciones» sin remontar nada.
 *
 * Desde el MAPA (29-09) el alta se abre ENCIMA del mapa (`vista=mapa`): el
 * formulario es un modal del libro, no de la sección. Al guardar, el libro
 * avisa (`reloadSignal`) y la etiqueta del árbol pasa a «Talado» ahí mismo,
 * sin volver al mapa ni recargar — antes el mapa se desmontaba y la etiqueta
 * nueva recién se veía al volver. Sin entrada nueva en el historial: el
 * parámetro se borra al abrir y el «atrás» sería la misma pantalla.
 */

export const LOTH_TAB_ID = "loth-libro-operaciones";
export const PARAM_NUEVA_TALA = "nuevaTala";
/** Cuánto se espera a que el libro montado recoja el parámetro antes de entrar por la URL. */
const ESPERA_LECTURA_MS = 400;

/** La dirección del alta de tala de ese árbol (sobre la vista que se pida: la sección Tala o el mapa). */
export function urlRegistrarTala(codigo: string, pathname = "/admin", vista: "secciones" | "mapa" = "secciones"): string {
  const q = new URLSearchParams({ tab: LOTH_TAB_ID, vista, seccion: "tala", [PARAM_NUEVA_TALA]: codigo });
  return `${pathname}?${q.toString()}`;
}

/**
 * Ir al alta de tala de ese árbol, sin recargar el panel si el libro lo
 * recoge en caliente. `entrar` es la navegación de respaldo (inyectable para
 * la prueba: jsdom no navega).
 */
export function irARegistrarTala(codigo: string, entrar: (url: string) => void = (url) => window.location.replace(url)): void {
  const actual = new URLSearchParams(window.location.search);
  const yaEnElLibro = actual.get("tab") === LOTH_TAB_ID;
  const enElMapa = yaEnElLibro && actual.get("vista") === "mapa";
  const destino = urlRegistrarTala(codigo, window.location.pathname, enElMapa ? "mapa" : "secciones");
  if (enElMapa) {
    window.history.replaceState(null, "", destino);
  } else if (yaEnElLibro) {
    window.history.pushState(null, "", destino);
  } else {
    // Desde otro módulo: el panel navega (historial, recientes) y después se
    // escriben los parámetros propios, que `navigateTab` borraría.
    window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: LOTH_TAB_ID, vista: "secciones" } }));
    window.history.replaceState(null, "", destino);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
  // El libro recoge `nuevaTala` y lo BORRA de la URL al abrir el alta. Si sigue
  // ahí, el libro ya estaba montado (el mapa vive dentro de él) y sólo lo lee al
  // montar: se entra por la dirección, como un enlace. `replace`, para que el
  // «atrás» vuelva al mapa en un paso y no pase dos veces por la misma URL.
  window.setTimeout(() => {
    if (new URLSearchParams(window.location.search).get(PARAM_NUEVA_TALA) === codigo) entrar(destino);
  }, ESPERA_LECTURA_MS);
}
