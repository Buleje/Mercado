/**
 * La base de una simulación de «Soltar trozas» (ADR-447 §6), guardada un rato
 * en el proceso para que cada cambio de casillas no relea el patio entero.
 *
 * Medido en Blas (28-09, desde WSL por el pooler): la simulación son ~3,2 s de
 * LECTURAS (el diagnóstico de la bandeja, 2,4 s; la corrida, 0,75 s) y ~15 ms
 * de cuentas. El modal pide una al abrirse (la sugerencia) y otra cada vez que
 * la selección se queda quieta: con esto la primera lee y las siguientes
 * cuentan sobre lo leído.
 *
 * Qué la mantiene honesta:
 *  · la pedida SIN selección (la del abrir) siempre lee fresco: la base nunca
 *    es más vieja que el modal que la muestra;
 *  · dura `TTL_MS` y se olvida al escribir (soltar o vincular llaman a
 *    `olvidarSimulaciones`);
 *  · es una vista previa: la escritura decide otra vez bajo lock.
 *
 * En el proceso y no en `lib/cache`: la base lleva filas de Prisma (Decimal,
 * Date) que un store Redis no devolvería iguales. Otra instancia simplemente
 * no la tiene y lee.
 */
const TTL_MS = 60_000;
/** Tope de corridas guardadas: un modal abierto por negocio es lo normal. */
const MAX_ENTRADAS = 50;

const memo = new Map<string, { en: number; valor: unknown }>();
const clave = (tenantId: string, corridaId: string) => `${tenantId}:${corridaId}`;

/** La base guardada de esa corrida, si todavía vale. */
export function baseGuardada<T>(tenantId: string, corridaId: string): T | null {
  const k = clave(tenantId, corridaId);
  const e = memo.get(k);
  if (!e) return null;
  if (Date.now() - e.en > TTL_MS) {
    memo.delete(k);
    return null;
  }
  return e.valor as T;
}

export function guardarBase<T>(tenantId: string, corridaId: string, valor: T): void {
  const ahora = Date.now();
  for (const [k, e] of memo) if (ahora - e.en > TTL_MS) memo.delete(k);
  while (memo.size >= MAX_ENTRADAS) {
    const primera = memo.keys().next().value;
    if (primera === undefined) break;
    memo.delete(primera);
  }
  memo.set(clave(tenantId, corridaId), { en: ahora, valor });
}

/** Se escribió madera en el libro de este negocio: ninguna simulación guardada vale. */
export function olvidarSimulaciones(tenantId: string): void {
  for (const k of memo.keys()) if (k.startsWith(`${tenantId}:`)) memo.delete(k);
}
