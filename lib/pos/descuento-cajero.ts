/**
 * Tope del descuento global de una venta del POS para quien no es admin ni
 * dueño: el 15 % del total, al céntimo hacia abajo.
 *
 * Una sola cuenta para el POS (vista previa) y para `POST /api/sales` (la que
 * decide). Se compara en CÉNTIMOS ENTEROS en los dos lados: con decimales,
 * `9 * 0.15` da 1,3499999999999999 y la ruta rechazaba (403) un descuento de
 * S/ 1,35 que es justo el 15 % de S/ 9,00 (09-10: 277 de cada 100 000 totales
 * caían en ese desfase).
 *
 * Sin `"use client"`: lo usan el modal del trueque y la ruta de ventas.
 */

/** Porcentaje del total que un cajero puede descontar sin el admin. */
export const TOPE_DESCUENTO_CAJERO_PCT = 15;

/** Roles que descuentan hasta el total (los mismos que `isPrivilegedRole` de la ruta). */
export const ROLES_DESCUENTO_SIN_TOPE = ["admin", "owner"] as const;

/** Soles → céntimos enteros (NaN, ±Infinity y negativos cuentan como 0). */
export function aCentimos(soles: number): number {
  return Number.isFinite(soles) && soles > 0 ? Math.round(soles * 100) : 0;
}

/** Tope en céntimos: `⌊ total en céntimos × 15 / 100 ⌋`, todo entero. */
export function topeDescuentoCajeroCentimos(total: number): number {
  return Math.floor((aCentimos(total) * TOPE_DESCUENTO_CAJERO_PCT) / 100);
}

/** Tope en soles (S/ 9,00 → 1,35; S/ 33,33 → 4,99). */
export function topeDescuentoCajero(total: number): number {
  return topeDescuentoCajeroCentimos(total) / 100;
}

/** ¿El descuento pasa el tope de cajero? Compara céntimo contra céntimo. */
export function excedeTopeCajero(descuento: number, total: number): boolean {
  return aCentimos(descuento) > topeDescuentoCajeroCentimos(total);
}

export function rolDescuentaSinTope(rol: string | null | undefined): boolean {
  return rol != null && (ROLES_DESCUENTO_SIN_TOPE as readonly string[]).includes(rol);
}
