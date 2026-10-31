/**
 * Tope del descuento de una venta del POS para quien no es admin ni dueño.
 *
 * El dueño lo elige en Ajustes › Cobros › Caja («Descuento máximo del
 * cajero», columna `Settings.maxDiscountPercent`). Sin valor elegido rige el
 * 15 % de siempre. Vale para los dos descuentos que manda el POS:
 *  - el GLOBAL (trueque): hasta ese % del total, al céntimo hacia abajo;
 *  - el POR PRODUCTO: hasta ese % sobre el precio de la base.
 *
 * Una sola cuenta para el POS (vista previa) y para `POST /api/sales` (la que
 * decide). Se compara en CÉNTIMOS ENTEROS en los dos lados: con decimales,
 * `9 * 0.15` da 1,3499999999999999 y la ruta rechazaba (403) un descuento de
 * S/ 1,35 que es justo el 15 % de S/ 9,00 (09-10: 277 de cada 100 000 totales
 * caían en ese desfase). El % también va entero, en centésimas (12,5 % = 1250).
 *
 * Sin `"use client"`: lo usan el modal del trueque, el carrito y la ruta de ventas.
 */

/** Tope de fábrica: lo que rige mientras el dueño no elija otro en Ajustes. */
export const TOPE_DESCUENTO_CAJERO_PCT = 15;

/** Roles que descuentan hasta el total (los mismos que `isPrivilegedRole` de la ruta). */
export const ROLES_DESCUENTO_SIN_TOPE = ["admin", "owner"] as const;

/**
 * Lo guardado en Ajustes (`Settings.maxDiscountPercent`) → % del tope del cajero.
 *
 * - Vacío, texto o no numérico → 15 (fábrica).
 * - **100 o más → 15**: la columna nace con `@default(100)` y así está en los
 *   14 negocios (medido 09-10, nadie la eligió: no tenía pantalla ni lector).
 *   Leer ese 100 como «el cajero descuenta todo» le habría abierto el 100 % a
 *   todos los cajeros el día del deploy. Por eso la pantalla ofrece de 0 a 99.
 * - Negativo → 0 (el cajero no descuenta nada). Se redondea a 2 decimales.
 */
export function topeCajeroPct(guardado: unknown): number {
  const n =
    typeof guardado === "number"
      ? guardado
      : typeof guardado === "string" && guardado.trim() !== ""
        ? Number(guardado)
        : Number.NaN;
  // Redondear ANTES de comparar: 99,995 redondea a 100 y sería «descuenta todo».
  const r = Math.round(n * 100) / 100;
  if (!Number.isFinite(r) || r >= 100) return TOPE_DESCUENTO_CAJERO_PCT;
  return r <= 0 ? 0 : r;
}

/** Lo que guarda la pantalla de Ajustes: 0 a 99 con 2 decimales (el 100 se lee como 15). */
export function topeCajeroParaGuardar(pct: number): number {
  if (!Number.isFinite(pct)) return TOPE_DESCUENTO_CAJERO_PCT;
  return Math.min(99, Math.max(0, Math.round(pct * 100) / 100));
}

/** % → centésimas enteras, acotado 0-100 (15 → 1500; 12,5 → 1250). */
function centesimas(pct: number): number {
  const p = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : TOPE_DESCUENTO_CAJERO_PCT;
  return Math.round(p * 100);
}

/** Soles → céntimos enteros (NaN, ±Infinity y negativos cuentan como 0). */
export function aCentimos(soles: number): number {
  return Number.isFinite(soles) && soles > 0 ? Math.round(soles * 100) : 0;
}

/** Tope en céntimos: `⌊ total en céntimos × pct / 100 ⌋`, todo entero. */
export function topeDescuentoCajeroCentimos(total: number, pct: number = TOPE_DESCUENTO_CAJERO_PCT): number {
  return Math.floor((aCentimos(total) * centesimas(pct)) / 10_000);
}

/** Tope en soles (15 %: S/ 9,00 → 1,35; S/ 33,33 → 4,99). */
export function topeDescuentoCajero(total: number, pct: number = TOPE_DESCUENTO_CAJERO_PCT): number {
  return topeDescuentoCajeroCentimos(total, pct) / 100;
}

/** ¿El descuento global pasa el tope del cajero? Compara céntimo contra céntimo. */
export function excedeTopeCajero(descuento: number, total: number, pct: number = TOPE_DESCUENTO_CAJERO_PCT): boolean {
  return aCentimos(descuento) > topeDescuentoCajeroCentimos(total, pct);
}

/** ¿El % de descuento de UN producto pasa el tope? Centésima contra centésima (15,004 no pasa 15). */
export function excedeTopeItemCajero(descuentoPct: number, pct: number = TOPE_DESCUENTO_CAJERO_PCT): boolean {
  const d = Number.isFinite(descuentoPct) && descuentoPct > 0 ? Math.round(descuentoPct * 100) : 0;
  return d > centesimas(pct);
}

/** El % tal como se le muestra al cajero: «15», «12.5» (sin `Intl`: cambia con la versión de ICU). */
export function pctLegible(pct: number): string {
  return String(centesimas(pct) / 100);
}

export function rolDescuentaSinTope(rol: string | null | undefined): boolean {
  return rol != null && (ROLES_DESCUENTO_SIN_TOPE as readonly string[]).includes(rol);
}
