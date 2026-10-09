import { z } from "zod";

/**
 * El monto que alguien CONTÓ en el cajón, validado igual en todas las rutas que
 * cierran una caja (`PATCH /api/cash-registers/[id]` y `close-shift`).
 *
 * Vivía dentro de la ruta `[id]`: una ruta de Next sólo puede exportar sus
 * métodos, así que la segunda ruta habría tenido que copiarlo — y dos copias de
 * un tope terminan distintas.
 */

/** Tope de un monto de caja: Decimal(12,2) aguanta más, pero un movimiento de diez millones es un error de tipeo. */
export const TOPE_CAJA = 10_000_000;

export const montoContado = z
  .number()
  .finite()
  .min(0, "El monto contado no puede ser negativo.")
  .max(TOPE_CAJA, "Monto fuera de rango.");
