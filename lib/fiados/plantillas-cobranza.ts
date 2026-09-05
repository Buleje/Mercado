/**
 * Qué se le escribe a cada quien — port de `lib/adelantos/plantillas-cobranza.ts`.
 *
 * El tono lo decide el tramo de atraso. Las plantillas se guardan en el
 * navegador (son de quien atiende, no del negocio) con key propia de tenant.
 */

import { tenantCacheKey } from "@/lib/tenant-cache";
import type { TramoId } from "./gestion-cobranza";

export const CLAVE_PLANTILLAS = "buleje:fiados-cobranza-plantillas";

export type DatosMensaje = { nombre: string; saldo: string; dias: number };
export type Plantillas = Record<TramoId, string>;

/** Ninguno amenaza: en una bodega de pueblo el deudor es el vecino. */
export const PLANTILLAS_POR_DEFECTO: Plantillas = {
  corriente: "Hola {nombre}, ¿cómo estás? Te recuerdo que tenés {saldo} pendiente de tu fiado. Cuando puedas lo vemos. ¡Gracias!",
  t30: "Hola {nombre}, te recuerdo que tenés {saldo} pendiente de tu fiado desde hace {dias} días. ¿Cuándo lo podés pasar?",
  t60: "Hola {nombre}, ya van {dias} días de los {saldo} pendientes de tu fiado. Necesito que me digas para cuándo lo tenés.",
  t90: "Hola {nombre}, tenés {saldo} de tu fiado sin liquidar hace {dias} días. Vamos a tener que acordar una fecha firme esta semana.",
  t90mas:
    "Hola {nombre}, tu fiado de {saldo} lleva {dias} días sin pagarse. Necesito que nos sentemos a resolverlo — decime cuándo podés pasar.",
};

/** Reemplaza los huecos. Lo que no se reconoce se deja tal cual, no se borra. */
export function armarMensaje(plantilla: string, datos: DatosMensaje): string {
  return plantilla
    .replace(/\{nombre\}/g, datos.nombre)
    .replace(/\{saldo\}/g, datos.saldo)
    .replace(/\{dias\}/g, String(Math.max(0, datos.dias)));
}

export function leerPlantillas(): Plantillas {
  if (typeof window === "undefined") return PLANTILLAS_POR_DEFECTO;
  try {
    const raw = window.localStorage.getItem(tenantCacheKey(CLAVE_PLANTILLAS));
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
    window.localStorage.setItem(tenantCacheKey(CLAVE_PLANTILLAS), JSON.stringify(p));
  } catch {
    // sin persistencia, sin bug: la sesión igual las usa
  }
}
