/**
 * ctp-rendimiento.ts — coeficientes referenciales de rendimiento (SERFOR) y el
 * predicado de sobre-declaración.
 *
 * POR QUÉ IMPORTA (fiscalización): el rendimiento = volumen aserrado / volumen
 * en troza. SERFOR publica coeficientes referenciales; declarar un rendimiento
 * MUY por encima del referencial es la señal clásica de **blanqueo**: se está
 * "produciendo" más madera de la que la troza puede físicamente dar, para
 * colar madera de origen ilegal como salida legal del CTP.
 *
 * Fuente: RDE N° D000259-2024-MIDAGRI-SERFOR-DE — coeficiente referencial de
 * rendimiento de troza a madera aserrada = 56 % (especies NO CITES, todo uso) y
 * de troza a tablillas no perfiladas para piso = 41 %.
 *
 * Es una ADVERTENCIA (señal), no un bloqueo: hay especies y equipos que rinden
 * distinto, y existe el "coeficiente de rendimiento superior" que justifica
 * valores más altos. Por eso se marca, no se prohíbe.
 */

/** Troza → madera aserrada (RDE D000259-2024, no CITES, todo uso). */
export const RENDIMIENTO_REF_ASERRADA = 56;
/** Troza → tablillas no perfiladas para piso. */
export const RENDIMIENTO_REF_TABLILLAS = 41;
/** Margen de medición antes de marcar "alto": el ruido normal de un aserrío. */
export const RENDIMIENTO_TOLERANCIA_PP = 3;

/** Coeficiente referencial para un tipo de producto, o null si no hay estándar
 *  (carbón, leña, otros: no aplica el coeficiente de aserrío). */
export function rendimientoReferencial(productType: string | null | undefined): number | null {
  const p = (productType ?? "").toLowerCase();
  if (!p) return null;
  if (p.includes("tablilla") || p.includes("piso") || p.includes("parquet")) return RENDIMIENTO_REF_TABLILLAS;
  if (/aserr|tabl|list[oó]n|durmiente|pulgada|madera|viga|tirante|escuadr/.test(p)) return RENDIMIENTO_REF_ASERRADA;
  return null;
}

export type RendimientoEstado = "ok" | "alto" | "sin_referencia";

/** Evalúa un rendimiento contra el referencial SERFOR del producto. */
export function evaluarRendimiento(
  productType: string | null | undefined,
  rendimientoPct: number | null | undefined,
): { estado: RendimientoEstado; ref: number | null } {
  const ref = rendimientoReferencial(productType);
  if (ref == null || rendimientoPct == null || Number.isNaN(rendimientoPct)) {
    return { estado: "sin_referencia", ref };
  }
  return { estado: rendimientoPct > ref + RENDIMIENTO_TOLERANCIA_PP ? "alto" : "ok", ref };
}
