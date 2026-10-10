/**
 * Cuánto lleva cada pedido en su estado, en UN lugar: la tarjeta del tablero,
 * la columna «Sin avanzar» de la lista, los indicadores y el detalle lo leen de
 * acá (10-10, Brandon: «algo nuevo útil con datos reales»).
 *
 * Antes la tarjeta sólo decía «+1h» o «+2h sin avanzar»: en `main` los 18
 * pedidos en marcha llevan meses parados y todos decían lo mismo, «+2h». Ahora
 * se dice el tiempo de verdad («177 días») y se ordena por él.
 *
 * La referencia es `updatedAt`: cambia con cada paso de estado (también con una
 * nota o un repartidor nuevo, así que es una aproximación; el paso exacto vive
 * en el historial del pedido). Sin React y sin `window`: se prueba sola.
 */
import type { DbOrder } from "@/lib/jsondb";

const MINUTO = 60_000;
export const UNA_HORA = 60 * MINUTO;
const DIA = 24 * UNA_HORA;

/** al-dia < 1 h · aviso 1-2 h · tarde ≥ 2 h (los mismos cortes que el tablero tenía). */
export type NivelDeEspera = "al-dia" | "aviso" | "tarde";

type ConFechas = Pick<DbOrder, "createdAt" | "updatedAt">;

/** Desde cuándo está en su estado (ms epoch). */
export function entroAlEstado(o: ConFechas): number {
  return new Date(o.updatedAt || o.createdAt).getTime();
}

/** Cuánto lleva en su estado, en ms (nunca negativo: relojes desfasados). */
export function msEnEstado(o: ConFechas, ahoraMs: number): number {
  return Math.max(0, ahoraMs - entroAlEstado(o));
}

export function nivelDeEspera(ms: number): NivelDeEspera {
  if (ms >= 2 * UNA_HORA) return "tarde";
  if (ms >= UNA_HORA) return "aviso";
  return "al-dia";
}

/** «recién» · «40 min» · «3 h» · «1 día» · «45 días» · «5 meses». */
export function textoDeEspera(ms: number): string {
  if (ms < MINUTO) return "recién";
  if (ms < UNA_HORA) return `${Math.floor(ms / MINUTO)} min`;
  if (ms < DIA) return `${Math.floor(ms / UNA_HORA)} h`;
  const dias = Math.floor(ms / DIA);
  if (dias < 60) return `${dias} ${dias === 1 ? "día" : "días"}`;
  const meses = Math.floor(dias / 30);
  return `${meses} meses`;
}

/** El que más espera, primero (para la columna del tablero: primero lo que se atrasa). */
export function masEsperaPrimero(a: ConFechas, b: ConFechas): number {
  return entroAlEstado(a) - entroAlEstado(b);
}

export interface CifrasDeEspera {
  /** Cuántos llevan 1 h o más sin pasar al estado siguiente. */
  sinAvanzar: number;
  /** El que más espera y cuánto (null si no hay pedidos). */
  elQueMasEspera: { pedido: DbOrder; ms: number } | null;
}

export function cifrasDeEspera(pedidos: readonly DbOrder[], ahoraMs: number): CifrasDeEspera {
  let sinAvanzar = 0;
  let elQueMasEspera: CifrasDeEspera["elQueMasEspera"] = null;
  for (const p of pedidos) {
    const ms = msEnEstado(p, ahoraMs);
    if (nivelDeEspera(ms) !== "al-dia") sinAvanzar += 1;
    if (!elQueMasEspera || ms > elQueMasEspera.ms) elQueMasEspera = { pedido: p, ms };
  }
  return { sinAvanzar, elQueMasEspera };
}
