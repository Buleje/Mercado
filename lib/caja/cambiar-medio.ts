/**
 * lib/caja/cambiar-medio.ts — corregir el medio de un movimiento ya anotado.
 *
 * EL HUECO. Desde F4 el esperado cuenta sólo el efectivo del cajón
 * (`saldoEsperadoDeCaja`), y el alta de un adelanto ya deja elegir el medio.
 * Pero lo anotado ANTES quedó como «efectivo»: medido 2026-09-28 en el negocio
 * real, la caja abierta desde el 11/06 espera −S/ 6 424 porque tres adelantos
 * (3 642 + 3 217 + 1 000) se restaron del cajón aunque varios se pagaron por
 * transferencia o Yape. No había cómo corregirlo sin tocar la base a mano.
 *
 * Sólo ingresos y egresos: una venta trae su medio del POS (y de `Sale`), y
 * apertura/cierre/arqueo no mueven plata.
 *
 * La diferencia sobre el esperado sale de LA cuenta del arqueo
 * (`saldoEsperadoDeCaja`) aplicada al movimiento solo, antes y después: si la
 * regla del efectivo cambia, esto cambia con ella.
 *
 * PURO y client-safe: la pantalla lo usa para PREVISUALIZAR el nuevo esperado
 * en la confirmación; el número que vale es el que devuelve el servidor.
 */
import { METODOS_DE_CAJA, medioDeMovimiento, saldoEsperadoDeCaja, type MovimientoDeCaja } from "@/lib/caja/saldo-esperado";

export type MedioDeCaja = (typeof METODOS_DE_CAJA)[number];

/** Los tipos de movimiento cuyo medio se puede corregir. */
export const TIPOS_CON_MEDIO_CORREGIBLE = ["ingreso", "egreso"] as const;

export function medioCorregible(type: string): boolean {
  return (TIPOS_CON_MEDIO_CORREGIBLE as readonly string[]).includes(type);
}

/** Cómo se nombra cada medio en la pantalla y en el registro de auditoría. */
export const NOMBRE_DEL_MEDIO_DE_CAJA: Readonly<Record<MedioDeCaja, string>> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

/** El nombre de un medio cualquiera (también uno viejo fuera de la lista, tal cual). */
export function nombreDelMedio(method: string | null | undefined): string {
  const m = medioDeMovimiento(method);
  return (NOMBRE_DEL_MEDIO_DE_CAJA as Readonly<Record<string, string>>)[m] ?? m;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Cuánto cambia el efectivo esperado si `mov` pasa a `nuevo`:
 *   egreso  efectivo → Yape: +monto (la plata nunca salió del cajón);
 *   egreso  Yape → efectivo: −monto;
 *   ingreso efectivo → Yape: −monto;
 *   entre dos medios que no son efectivo: 0.
 */
export function efectoEnElEsperado(mov: MovimientoDeCaja, nuevo: string): number {
  const antes = saldoEsperadoDeCaja(0, [mov]).esperado;
  const despues = saldoEsperadoDeCaja(0, [{ ...mov, method: nuevo }]).esperado;
  return r2(despues - antes);
}

export interface CambioDelEsperado {
  antes: number;
  despues: number;
}

/** El esperado de la caja antes y después de cambiar el medio de `mov`. */
export function esperadoTrasCambiarMedio(esperadoActual: number, mov: MovimientoDeCaja, nuevo: string): CambioDelEsperado {
  const antes = r2(Number.isFinite(esperadoActual) ? esperadoActual : 0);
  return { antes, despues: r2(antes + efectoEnElEsperado(mov, nuevo)) };
}

/**
 * La frase de la confirmación: «El esperado pasa de S/ −6.424,00 a S/ −2.782,00.»
 * Si el cambio no toca el cajón (Yape → transferencia), lo dice en vez de
 * mostrar dos números iguales.
 */
export function textoCambioDelEsperado(cambio: CambioDelEsperado, formato: (n: number) => string): string {
  if (cambio.antes === cambio.despues) {
    return `El efectivo esperado no cambia: sigue en ${formato(cambio.antes)} (ninguno de los dos medios pasa por el cajón).`;
  }
  return `El esperado pasa de ${formato(cambio.antes)} a ${formato(cambio.despues)}.`;
}
