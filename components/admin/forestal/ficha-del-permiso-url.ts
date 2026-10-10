/**
 * La ficha de un permiso, direccionable (ADR-432).
 *
 * `?contrato=<id>` abre la ficha de ESE permiso dentro de Libro CTP → Contratos
 * y `?seccion=` dice en cuál de sus tres secciones. Así «mirá el volumen del
 * permiso X» es un link, el botón «atrás» vuelve de la ficha a la lista, y el
 * chip de la banda puede saltar directo a la ficha del permiso activo.
 *
 * `seccion` es el MISMO parámetro que usa Saldos para su pestaña interna: cada
 * pantalla valida contra su propia lista, así que un `?seccion=patio` que quedó
 * de Saldos se lee acá como «ninguna» (y al revés). `navigateTab` borra los dos
 * al cambiar de módulo (`PARAMS_DE_VISTA`).
 */

import { CTP_MODULE_TAB_ID } from "./ctp-shared";

export const SECCIONES_FICHA = ["volumen", "trazabilidad", "plata"] as const;
export type SeccionFicha = (typeof SECCIONES_FICHA)[number];
export const SECCION_FICHA_DEFAULT: SeccionFicha = "volumen";

export const PARAM_CONTRATO = "contrato";
export const PARAM_SECCION_FICHA = "seccion";

function params(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search);
}

/** El permiso que pide la URL, o null. */
export function contratoDeUrl(): string | null {
  const v = params()?.get(PARAM_CONTRATO)?.trim();
  return v ? v : null;
}

/** La sección que pide la URL, validada; null si no dice o dice otra cosa. */
export function seccionDeUrl(): SeccionFicha | null {
  const v = params()?.get(PARAM_SECCION_FICHA);
  return v && (SECCIONES_FICHA as readonly string[]).includes(v) ? (v as SeccionFicha) : null;
}

function escribir(mutar: (u: URL) => void, modo: "push" | "replace") {
  try {
    const url = new URL(window.location.href);
    const antes = url.toString();
    mutar(url);
    if (url.toString() === antes) return;
    if (modo === "push") window.history.pushState(null, "", url.toString());
    else window.history.replaceState(null, "", url.toString());
  } catch {
    // history no disponible: la ficha se abre igual, sólo no queda en el link.
  }
}

/**
 * Abrir (push: el «atrás» vuelve a la lista) o cerrar la ficha en la URL. Al
 * cerrar se va también la sección: si no, el próximo permiso que se abra
 * heredaría la del anterior.
 */
export function escribirContratoEnUrl(contratoId: string | null) {
  escribir((u) => {
    if (contratoId) {
      u.searchParams.set(PARAM_CONTRATO, contratoId);
    } else {
      u.searchParams.delete(PARAM_CONTRATO);
      u.searchParams.delete(PARAM_SECCION_FICHA);
    }
  }, "push");
}

/** Cambiar de sección no es navegar: `replace`, como las pestañas de Saldos. */
export function escribirSeccionEnUrl(seccion: SeccionFicha) {
  escribir((u) => u.searchParams.set(PARAM_SECCION_FICHA, seccion), "replace");
}

/**
 * Salta a Libro CTP → Contratos → ese permiso → esa sección, desde cualquier
 * módulo del panel (el chip de la banda vive en cinco).
 *
 * Desde OTRO módulo: `admin:navigate`, como todo el panel (historial,
 * recientes, limpieza de los parámetros del módulo que se deja), y recién
 * después se agregan `contrato` y `seccion` (antes, `navigateTab` los borraría).
 *
 * Desde el MISMO libro: `navigateTab` al tab en el que ya se está REEMPLAZA la
 * entrada del historial (está pensado para el clic en el módulo abierto), y el
 * «atrás» ya no volvía a Saldos (medido por el revisor, 25-09: `history.length`
 * no cambiaba). Acá sí es navegar: `pushState` propio.
 *
 * En los dos casos, un `popstate` al final: con el libro ya montado nada se
 * remonta, y `useVistaModulo` y la lista de contratos sólo releen la URL al
 * montar o con el «atrás». Es el mismo camino que el botón atrás del navegador.
 */
export function abrirFichaDelPermiso(
  contratoId: string,
  seccion: SeccionFicha = SECCION_FICHA_DEFAULT,
) {
  const destino = (u: URL) => {
    /* `tab` y `vista` también: desde otro módulo ya los escribió
       `navigateTab`, pero así el popstate lleva igual al libro si nadie oyó el
       evento. */
    u.searchParams.set("tab", CTP_MODULE_TAB_ID);
    u.searchParams.set("vista", "contratos");
    u.searchParams.set(PARAM_CONTRATO, contratoId);
    u.searchParams.set(PARAM_SECCION_FICHA, seccion);
  };
  const yaEnElLibro = params()?.get("tab") === CTP_MODULE_TAB_ID;
  if (yaEnElLibro) {
    escribir(destino, "push");
  } else {
    window.dispatchEvent(
      new CustomEvent("admin:navigate", { detail: { tab: CTP_MODULE_TAB_ID, vista: "contratos" } }),
    );
    escribir(destino, "replace");
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}
