/**
 * ctp-pnl — decisión PURA del margen (ADR-141), client-safe y testeable.
 *
 * Regla de oro (ADR-134): si falta la venta O el costo, el margen es null —
 * NUNCA 0. Un 0 fingiría margen 100%/pérdida total, peor que "no sé".
 */

export type MargenMotivo =
  | "ok"
  | "sin_venta"
  | "sin_costo"
  | "sin_atribucion"
  | "falta_costo"
  | "monedas_mezcladas"
  | "sin_cantidad";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Decide el margen de un despacho a partir de la venta y el COGS (ambos pueden
 * ser null) + el motivo por el que el COGS es null (para propagarlo).
 */
export function decidirMargen(
  venta: number | null,
  cogs: number | null,
  cogsMotivo: string,
): { margen: number | null; margenPct: number | null; motivo: MargenMotivo } {
  if (venta == null) return { margen: null, margenPct: null, motivo: "sin_venta" };
  if (cogs == null) return { margen: null, margenPct: null, motivo: cogsMotivo === "ok" ? "sin_costo" : (cogsMotivo as MargenMotivo) };
  const margen = r2(venta - cogs);
  return { margen, margenPct: venta > 0 ? r2((margen / venta) * 100) : null, motivo: "ok" };
}
