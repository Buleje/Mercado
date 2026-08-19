/**
 * Qué se le escribe a cada quien.
 *
 * Había UN solo texto para todos: el mismo mensaje al que se pasó tres días y
 * al que debe hace tres meses. El primero se ofende y el segundo no se da por
 * aludido. El tono lo decide el tramo de atraso, que es el dato que ya
 * teníamos.
 *
 * Las plantillas se guardan en el navegador, como las notas rápidas del alta:
 * son de quien atiende, no del negocio, y cada bodega escribe distinto.
 */

import type { TramoId } from "./gestion-cobranza";

export const CLAVE_PLANTILLAS = "buleje:cobranza-plantillas";

/** Lo que se puede intercalar en el texto. */
export type DatosMensaje = {
  nombre: string;
  saldo: string;
  dias: number;
};

export type Plantillas = Record<TramoId, string>;

/**
 * Los textos por defecto, del más amable al más firme.
 *
 * Ninguno amenaza: en una bodega de pueblo el deudor es el vecino, y un mensaje
 * agresivo cuesta el cliente además de la plata.
 */
export const PLANTILLAS_POR_DEFECTO: Plantillas = {
  corriente: "Hola {nombre}, ¿cómo estás? Te recuerdo que tenés {saldo} pendiente. Cuando puedas lo vemos. ¡Gracias!",
  t30: "Hola {nombre}, te recuerdo que tenés {saldo} pendiente desde hace {dias} días. ¿Cuándo lo podés pasar?",
  t60: "Hola {nombre}, ya van {dias} días de los {saldo} que quedaron pendientes. Necesito que me digas para cuándo lo tenés.",
  t90: "Hola {nombre}, tenés {saldo} sin liquidar hace {dias} días. Vamos a tener que acordar una fecha firme esta semana.",
  t90mas:
    "Hola {nombre}, la deuda de {saldo} lleva {dias} días. Necesito que nos sentemos a resolverlo — decime cuándo podés pasar.",
};

/** Reemplaza los huecos. Lo que no se reconoce se deja tal cual, no se borra. */
export function armarMensaje(plantilla: string, datos: DatosMensaje): string {
  return plantilla
    .replace(/\{nombre\}/g, datos.nombre)
    .replace(/\{saldo\}/g, datos.saldo)
    .replace(/\{dias\}/g, String(Math.max(0, datos.dias)));
}

/**
 * Las plantillas guardadas, completando con las de fábrica lo que falte.
 *
 * Si alguien editó sólo un tramo, los otros cuatro tienen que seguir
 * funcionando: un `localStorage` a medias no puede dejar mensajes vacíos.
 */
export function leerPlantillas(): Plantillas {
  if (typeof window === "undefined") return PLANTILLAS_POR_DEFECTO;
  try {
    const raw = window.localStorage.getItem(CLAVE_PLANTILLAS);
    if (!raw) return PLANTILLAS_POR_DEFECTO;
    const guardadas = JSON.parse(raw) as Partial<Plantillas>;
    const out = { ...PLANTILLAS_POR_DEFECTO };
    for (const k of Object.keys(out) as TramoId[]) {
      const v = guardadas?.[k];
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
    return out;
  } catch {
    return PLANTILLAS_POR_DEFECTO;
  }
}

export function guardarPlantillas(p: Plantillas): void {
  try {
    window.localStorage.setItem(CLAVE_PLANTILLAS, JSON.stringify(p));
  } catch {
    // sin persistencia, sin bug: la sesión igual las usa
  }
}
