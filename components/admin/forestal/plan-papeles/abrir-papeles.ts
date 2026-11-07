/**
 * Abrir «Papeles» de un plan desde fuera del libro (la carpeta del plan en el
 * Archivo). El libro recuerda el permiso elegido y la pestaña del plan en
 * localStorage: se dejan las dos elegidas con el formato de `useLocalStorage`
 * (JSON + su evento `local-storage`, por si el libro ya está montado) y recién
 * ahí se navega.
 *
 * Liviano a propósito: lo importa el Archivo, que no debe cargar el libro.
 * Las claves de la pestaña viven acá y `loth-plan-view-shared` las reexporta.
 */

import type { PestanaPlan } from "../LothPlanPestanas";
import { claveDelPermiso } from "../hooks/use-loth-libro-permiso";
import { LOTH_TAB_ID } from "../loth-mapa-tala-url";

/** Clave de la pestaña elegida. Exportada: la prueba en navegador la lee. */
export const CLAVE_PESTANA_PLAN = "loth:plan:pestana";
/**
 * La de una plantación va aparte: quien miraba el censo de un PO no tiene que
 * caer en «Árboles marcados» al abrir una plantación — ahí manda el registro.
 */
export const CLAVE_PESTANA_PLANTACION = "loth:plan:pestana-plantacion";

/** La pestaña «Papeles» (id histórico: era «Documentos»). */
export const PESTANA_PAPELES: PestanaPlan = "documentos";

/** La vista Plan del Libro TH. */
export const URL_VISTA_PLAN = `/admin?tab=${LOTH_TAB_ID}&vista=plan`;

function guardar(clave: string, valor: string): void {
  window.localStorage.setItem(clave, JSON.stringify(valor));
  window.dispatchEvent(new CustomEvent("local-storage", { detail: { key: clave, value: valor } }));
}

/**
 * Deja elegido el plan en el libro (del negocio `slug`) y su pestaña Papeles,
 * en bosque y en plantación (el tipo no se sabe desde el Archivo). Devuelve
 * false si el navegador no deja escribir (modo privado lleno): se navega igual
 * y el libro abre en el permiso que tenía.
 */
export function dejarElegidosLosPapeles(slug: string, planId: string): boolean {
  try {
    guardar(claveDelPermiso(slug), planId);
    guardar(CLAVE_PESTANA_PLAN, PESTANA_PAPELES);
    guardar(CLAVE_PESTANA_PLANTACION, PESTANA_PAPELES);
    return true;
  } catch (err) {
    console.warn("[papeles] no se pudo dejar elegido el plan", err);
    return false;
  }
}
