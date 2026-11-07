/**
 * Filtros «Sin firma» y «Sin enviar» de la lista de Adelantos (23-10).
 *
 * Puro: usa el estado de recibos que la tabla ya trae (una llamada,
 * `GET /api/adelantos/estado-recibos`) y lo que la lista ya sabe de cada fila.
 *  - Sin firma = sin firma NI huella vigente (con una de las dos, el recibo está respaldado).
 *  - Sin enviar = el recibo nunca se mandó (WhatsApp o PDF compartido).
 * Los anulados quedan fuera de los dos: no hay recibo que perseguir.
 * Si se activan los dos, se piden a la vez (AND).
 */

import type { DbAdelanto } from "@/lib/db/adelantos.db";
import type { EstadoRecibos } from "./recibo-whatsapp";

export interface FiltroRecibos {
  sinFirma: boolean;
  sinEnviar: boolean;
}

export const SIN_FILTRO_RECIBOS: FiltroRecibos = { sinFirma: false, sinEnviar: false };

export const CLAVE_FILTRO_RECIBOS = "adelantos-filtro-recibos";

export const hayFiltroRecibos = (f: FiltroRecibos): boolean => f.sinFirma || f.sinEnviar;

/** Lo que se guarda en el navegador, leído de vuelta sin confiar en él. */
export function leerFiltroRecibos(crudo: string | null | undefined): FiltroRecibos {
  try {
    const j: unknown = JSON.parse(crudo ?? "null");
    if (j && typeof j === "object") {
      const o = j as Record<string, unknown>;
      return { sinFirma: o.sinFirma === true, sinEnviar: o.sinEnviar === true };
    }
  } catch {
    /* valor roto: sin filtro */
  }
  return SIN_FILTRO_RECIBOS;
}

export function esSinFirma(a: DbAdelanto, estados: EstadoRecibos): boolean {
  if (a.status === "CANCELADO") return false;
  const e = estados[a.id];
  const firma = !!e?.firma || !!a.firmas?.firma;
  const huella = !!e?.huella || !!a.firmas?.huella;
  return !firma && !huella;
}

export function esSinEnviar(a: DbAdelanto, estados: EstadoRecibos): boolean {
  return a.status !== "CANCELADO" && !estados[a.id]?.envio;
}

export function pasaFiltroRecibos(a: DbAdelanto, estados: EstadoRecibos, f: FiltroRecibos): boolean {
  if (f.sinFirma && !esSinFirma(a, estados)) return false;
  if (f.sinEnviar && !esSinEnviar(a, estados)) return false;
  return true;
}

/** Cuántos quedarían con cada chip, sobre lo que ya pasa estado y búsqueda (suma el otro chip si está puesto). */
export function contarRecibos(base: readonly DbAdelanto[], estados: EstadoRecibos, f: FiltroRecibos): { sinFirma: number; sinEnviar: number } {
  let sinFirma = 0;
  let sinEnviar = 0;
  for (const a of base) {
    if (esSinFirma(a, estados) && (!f.sinEnviar || esSinEnviar(a, estados))) sinFirma++;
    if (esSinEnviar(a, estados) && (!f.sinFirma || esSinFirma(a, estados))) sinEnviar++;
  }
  return { sinFirma, sinEnviar };
}
