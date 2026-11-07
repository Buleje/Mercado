/**
 * Qué se le escribe a cada quien — port de `lib/adelantos/plantillas-cobranza.ts`.
 *
 * El tono lo decide el tramo de atraso. Las plantillas se guardan en el
 * navegador (son de quien atiende, no del negocio) con key propia de tenant.
 */

import { tenantCacheKey } from "@/lib/tenant-cache";
import type { TramoId } from "./gestion-cobranza";

export const CLAVE_PLANTILLAS = "buleje:fiados-cobranza-plantillas";

export type DatosMensaje = {
  nombre: string;
  saldo: string;
  dias: number;
  /** `{ultimo_contacto}`: «Te escribí el martes 14/10.» — vacío si no hay gestiones (ver `lib/fiados/ultimo-contacto.ts`). */
  ultimoContacto?: string;
  /** `{promesa}`: «Quedamos en que pagabas el viernes 17/10.» — vacío si no prometió. */
  promesa?: string;
};

/** Los huecos que entiende la plantilla, con lo que significan (para la ayuda del editor). */
export const VARIABLES_PLANTILLA = [
  { clave: "{nombre}", ayuda: "su nombre" },
  { clave: "{saldo}", ayuda: "lo que debe" },
  { clave: "{dias}", ayuda: "días de atraso" },
  { clave: "{ultimo_contacto}", ayuda: "«Te escribí el martes 14/10.» (vacío si no hay gestiones)" },
  { clave: "{promesa}", ayuda: "«Quedamos en que pagabas el viernes 17/10.» (vacío si no prometió)" },
] as const;
export type Plantillas = Record<TramoId, string>;

/** Ninguno amenaza: en una bodega de pueblo el deudor es el vecino. */
export const PLANTILLAS_POR_DEFECTO: Plantillas = {
  corriente: "Hola {nombre}, ¿cómo estás? Te recuerdo que tienes {saldo} pendiente de tu fiado. Cuando puedas lo vemos. ¡Gracias!",
  t30: "Hola {nombre}, te recuerdo que tienes {saldo} pendiente de tu fiado desde hace {dias} días. ¿Cuándo lo puedes pasar?",
  t60: "Hola {nombre}, ya van {dias} días de los {saldo} pendientes de tu fiado. Necesito que me digas para cuándo lo tienes.",
  t90: "Hola {nombre}, tienes {saldo} de tu fiado sin liquidar hace {dias} días. Vamos a tener que acordar una fecha firme esta semana.",
  t90mas:
    "Hola {nombre}, tu fiado de {saldo} lleva {dias} días sin pagarse. Necesito que nos sentemos a resolverlo — dime cuándo puedes pasar.",
};

/**
 * Reemplaza los huecos. Lo que no se reconoce se deja tal cual, no se borra.
 * `{ultimo_contacto}` y `{promesa}` sin dato quedan vacíos y se limpian los
 * espacios dobles que dejan (el texto no dice «Hola Juan,  te recuerdo»).
 */
export function armarMensaje(plantilla: string, datos: DatosMensaje): string {
  const usaContexto = /\{(ultimo_contacto|promesa)\}/.test(plantilla);
  const texto = plantilla
    .replace(/\{nombre\}/g, datos.nombre)
    .replace(/\{saldo\}/g, datos.saldo)
    .replace(/\{dias\}/g, String(Math.max(0, datos.dias)))
    .replace(/\{ultimo_contacto\}/g, datos.ultimoContacto?.trim() ?? "")
    .replace(/\{promesa\}/g, datos.promesa?.trim() ?? "");
  return usaContexto ? texto.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1").trim() : texto;
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
