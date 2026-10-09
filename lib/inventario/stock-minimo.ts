/**
 * Un solo stock mínimo (09-10).
 *
 * `Settings.globalMinStock` (5 por defecto en el schema) es el mínimo del
 * negocio para los productos que no tienen el suyo. Nadie lo leía: el cierre
 * diario ponía `?? 5` a mano, las alertas de inventario y Compras `?? 0`.
 * Con esto las tres superficies usan la misma regla:
 *   mínimo efectivo = el del producto si lo tiene (0 incluido: «sólo cuando se
 *   agote») · si no, el global del negocio.
 * Puro (sin server-only): lo usan los db del servidor y Compras en el cliente.
 */

/** Respaldo cuando el negocio no tiene fila de Settings (mismo default del schema). */
export const STOCK_MINIMO_GLOBAL_POR_DEFECTO = 5;

/** El mínimo global del negocio, saneado (entero ≥ 0). */
export function minimoGlobalDe(settings: { globalMinStock?: number | null } | null | undefined): number {
  const g = settings?.globalMinStock;
  return typeof g === "number" && Number.isFinite(g) && g >= 0 ? Math.floor(g) : STOCK_MINIMO_GLOBAL_POR_DEFECTO;
}

/** Mínimo efectivo de un producto: el suyo si lo tiene; si no, el global. */
export function stockMinimoDe(
  producto: { stockMin?: number | null },
  minimoGlobal: number,
): number {
  const propio = producto.stockMin;
  if (typeof propio === "number" && Number.isFinite(propio) && propio >= 0) return propio;
  return minimoGlobal;
}
