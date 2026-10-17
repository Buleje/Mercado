/**
 * El código SQLSTATE de un error de Postgres, venga como venga con Prisma 7 +
 * `@prisma/adapter-pg`: una consulta cruda llega como P2010 («Raw query failed.
 * Code: `55P03`», el original en `meta.driverAdapterError.cause.originalCode`)
 * y una del modelo como el `DriverAdapterError` sin envolver
 * (`cause.originalCode`). Recorre las dos formas (mismo criterio que
 * `esChoqueDeLocks` de `lib/forestal/ctp-api-errors.ts`). `null` = no es un
 * error de Postgres reconocible.
 */
export function codigoPg(err: unknown): string | null {
  const pendientes: unknown[] = [err];
  for (let paso = 0; paso < 8 && pendientes.length > 0; paso++) {
    const e = pendientes.shift();
    if (!e || typeof e !== "object") continue;
    const o = e as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (typeof o.originalCode === "string" && /^[0-9A-Z]{5}$/.test(o.originalCode)) return o.originalCode;
    if (typeof o.code === "string" && /^[0-9A-Z]{5}$/.test(o.code) && !o.code.startsWith("P")) return o.code;
    if (typeof o.message === "string") {
      const m = /Code: `([0-9A-Z]{5})`/.exec(o.message);
      if (m) return m[1];
    }
    pendientes.push(o.cause);
    if (o.meta && typeof o.meta === "object") pendientes.push((o.meta as { driverAdapterError?: unknown }).driverAdapterError);
  }
  return null;
}

/** 55P03 `lock_not_available`: venció `lock_timeout` esperando un lock. */
export const esEsperaDeLockVencida = (err: unknown): boolean => codigoPg(err) === "55P03";
