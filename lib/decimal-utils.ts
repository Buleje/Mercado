/**
 * lib/decimal-utils.ts
 *
 * Helper canónico para convertir `Prisma.Decimal` a `number` de forma segura.
 *
 * Contexto TD-018: después de migrar 71 campos monetarios de Float a
 * Decimal(12,2), Prisma devuelve esos campos como instancias de
 * `Prisma.Decimal` (de decimal.js). Para las capas UI, DTOs y API
 * responses necesitamos convertirlos a `number` primitivo.
 *
 * Este archivo reemplaza las 4 variantes dispersas del helper:
 *   - lib/db/fiados.db.ts       function toNum(d: Prisma.Decimal...)
 *   - lib/db/prestamos.db.ts    function toNum(d: Prisma.Decimal...)
 *   - lib/db/recetas.db.ts      function toNum(d: Prisma.Decimal...)
 *   - lib/db/turnos.db.ts       function toNum(d: Prisma.Decimal...)
 *   - lib/db/treasury.db.ts     const toNum = (v: unknown)
 *   - lib/db/cotizaciones.db.ts function dec(...)
 *   - lib/db/notas-credito.db.ts function dec(...)
 *   - lib/db/sponsored-boosts.db.ts function toDecimalNum(...)
 *
 * Ver ADR-018 y docs/td018-consolidated-plan-2026-04-09.md
 *
 * Uso:
 *   import { toNum, toNumOrZero, toFixedStr } from "@/lib/decimal-utils";
 *   const price: number = toNum(product.price);        // number | null
 *   const price: number = toNumOrZero(product.price);  // siempre number (0 si null)
 *   const display: string = toFixedStr(product.price); // "19.99" para UI
 */

/**
 * Tipo estructural del Decimal de Prisma (compatible con decimal.js).
 * Se define local en vez de importar `Prisma.Decimal` para que este
 * archivo compile incluso mientras el schema todavía tiene algunos
 * campos Float durante la migración TD-018.
 */
type PrismaDecimalLike = {
  toNumber: () => number;
  toFixed: (decimals?: number) => string;
  toString: () => string;
};

type DecimalLike = PrismaDecimalLike | number | string | null | undefined;

/**
 * Convierte un Decimal (o number/string) a number primitivo.
 * Devuelve null si el input es null/undefined.
 *
 * IMPORTANTE: para montos muy grandes (>Number.MAX_SAFE_INTEGER) puede
 * perder precisión. Con Decimal(12,2) el máximo es 99.999.999.999,99
 * que sí entra en MAX_SAFE_INTEGER (9.007.199.254.740.992) → seguro
 * para soles peruanos.
 */
export function toNum(value: DecimalLike): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isNaN(n) ? null : n;
  }
  // Prisma.Decimal tiene .toNumber() y .toString()
  if (typeof (value as { toNumber?: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return null;
}

/**
 * Convierte un Decimal a number, devolviendo 0 si es null/undefined.
 * Útil para sumas y aritmética donde null debería tratarse como cero.
 */
export function toNumOrZero(value: DecimalLike): number {
  return toNum(value) ?? 0;
}

/**
 * Convierte un Decimal a string formateado con 2 decimales.
 * Útil para UI, logs y respuestas JSON que quieren "19.99" en vez de
 * `[object Object]` o `19.9`.
 *
 * Devuelve "0.00" si el input es null/undefined.
 */
export function toFixedStr(value: DecimalLike, decimals = 2): string {
  const n = toNum(value);
  if (n === null) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}

/**
 * Serializa un Decimal a number para JSON responses.
 * Equivalente a toNumOrZero pero con nombre más semántico.
 */
export function toJsonNumber(value: DecimalLike): number {
  return toNumOrZero(value);
}

/**
 * Suma segura de valores Decimal. Convierte todos a number y suma.
 * Para precisión exacta en operaciones contables, usar directamente
 * Prisma.Decimal.sum(...).
 */
export function sumDecimals(...values: DecimalLike[]): number {
  return values.reduce((acc: number, v) => acc + toNumOrZero(v), 0);
}
