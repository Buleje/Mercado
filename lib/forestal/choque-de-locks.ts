/**
 * ¿Dos transacciones se pisaron? Sin dependencias a propósito: lo usan las rutas
 * (vía `ctp-api-errors.ts`) y las DB classes (el vaciado del libro, que corre en
 * `Serializable`), y una DB class no puede arrastrar `next/server` ni otra DB class.
 */

/**
 * Códigos de «dos transacciones se pisaron; reintentar sirve»: el deadlock de
 * Postgres (40P01), la falla de serialización (40001) y el P2034 con que Prisma
 * nombra a las dos.
 */
const CODIGOS_CHOQUE = new Set(["40P01", "40001", "P2034"]);

/**
 * ¿El error es un choque de locks entre dos transacciones?
 *
 * Repartir un mixto (mixto → trozas → lotes) y vincular una corrida (corrida →
 * lotes → trozas) toman los locks en orden inverso: si los dos caen a la vez
 * sobre las mismas trozas, Postgres aborta a uno con 40P01. No es un error del
 * servidor ni del dato: es un turno perdido.
 *
 * Con `@prisma/adapter-pg` el código llega por tres caminos según quién tomó el
 * lock (medido 26-09 contra la base real en `__tests__/forestal-choque-de-locks.test.ts`):
 *  · `$queryRaw … FOR UPDATE` → P2010 «Raw query failed. Code: `40P01`», con el
 *    original en `meta.driverAdapterError.cause.originalCode`;
 *  · una consulta del modelo → el `DriverAdapterError` sin envolver, con
 *    `cause.originalCode` y sin `code` propio;
 *  · 40001 → P2034 directo (lo dice el código del adaptador; éste no se provocó).
 * Se recorre la cadena (`cause`, `meta.driverAdapterError`) con un tope, y el
 * texto de Postgres queda de último recurso.
 */
export function esChoqueDeLocks(err: unknown): boolean {
  const pendientes: unknown[] = [err];
  for (let paso = 0; paso < 8 && pendientes.length > 0; paso++) {
    const e = pendientes.shift();
    if (!e || typeof e !== "object") continue;
    const o = e as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (typeof o.code === "string" && CODIGOS_CHOQUE.has(o.code)) return true;
    if (typeof o.originalCode === "string" && CODIGOS_CHOQUE.has(o.originalCode)) return true;
    if (typeof o.message === "string" && /deadlock detected|could not serialize access|Code: `40P01`/i.test(o.message)) {
      return true;
    }
    pendientes.push(o.cause);
    if (o.meta && typeof o.meta === "object") pendientes.push((o.meta as { driverAdapterError?: unknown }).driverAdapterError);
  }
  return false;
}
