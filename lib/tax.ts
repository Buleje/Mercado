/**
 * lib/tax.ts — Single source of truth para el IGV (impuesto general a las ventas, Perú).
 *
 * ¿Por qué existe esto? Antes el factor 1.18 estaba hardcodeado en el POS, en el
 * desglose de cotizaciones y en el pipeline SUNAT. Si un tenant está en RUS o
 * vende productos exonerados/inafectos, ese 18% mágico descuadra. Centralizar la
 * tasa en un solo lugar elimina la duplicación y deja UN punto para cambiarla.
 *
 * NOTA sobre formato: el campo `Settings.taxRate` (Prisma) guarda la tasa como
 * PORCENTAJE (ej. 18, default 18), no como fracción. Usar `igvRateFromSettings()`
 * para normalizar ese valor a fracción (0.18) antes de pasarlo a los helpers.
 */

/** Tasa de IGV por defecto, como fracción (0.18 = 18%). */
export const IGV_RATE = 0.18;

/** Factor para agregar IGV a una base gravada (1 + IGV_RATE). */
export const IGV_FACTOR = 1 + IGV_RATE;

/**
 * Normaliza la tasa guardada en settings (porcentaje, ej. 18) a fracción (0.18).
 * Acepta `null`/`undefined` (settings sin valor) y cae a `IGV_RATE`.
 * Tolera que ya venga como fracción (≤ 1) por seguridad.
 */
export function igvRateFromSettings(taxRate?: number | null): number {
  if (taxRate == null || !Number.isFinite(taxRate) || taxRate < 0) return IGV_RATE;
  // Si viene como porcentaje (> 1, ej. 18) lo pasamos a fracción.
  return taxRate > 1 ? taxRate / 100 : taxRate;
}

/**
 * Extrae el desglose de un total que YA incluye IGV (precio de venta al público).
 * Ejemplo: extractIgv(118) → { base: 100, igv: 18, total: 118 } con rate=0.18.
 *
 * Si `rate` es 0 (tenant exonerado/inafecto), `igv = 0` y `base = total`.
 */
export function extractIgv(
  totalConIgv: number,
  rate: number = IGV_RATE,
): { base: number; igv: number; total: number } {
  const base = totalConIgv / (1 + rate);
  const igv = totalConIgv - base;
  return { base, igv, total: totalConIgv };
}

/**
 * Agrega IGV a una base gravada (precio sin impuesto).
 * Ejemplo: addIgv(100) → { base: 100, igv: 18, total: 118 } con rate=0.18.
 */
export function addIgv(
  base: number,
  rate: number = IGV_RATE,
): { base: number; igv: number; total: number } {
  const igv = base * rate;
  return { base, igv, total: base + igv };
}
