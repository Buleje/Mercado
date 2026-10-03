/**
 * gtf-redondeo — el redondeo de la GTF de SERFOR, en UN solo lugar (Brandon
 * 2026-10-03, «Alinear TODO el sistema con la GTF»).
 *
 * La regla de oro, como la aplica la guía:
 *  1. Una FILA de la GTF es (nombre científico + tipo de producto).
 *  2. Dentro de la fila se suman las piezas con precisión completa y ESE
 *     subtotal se redondea a 3 decimales, mitad hacia arriba (HALF_UP).
 *  3. Ese valor es el m³ oficial de la fila: se guarda y se muestra así.
 *  4. Todo total (por especie, por hoja, por permiso, por guía, por lote) es la
 *     SUMA de los m³ oficiales de las filas. Nunca la suma de lo crudo.
 *
 * Por qué importa: con la guía real del 2026-10-03 (39 filas) el sistema
 * sumaba crudo y daba 31,185 m³; la GTF, sumando sus filas ya redondeadas,
 * dice 31,188. Tres milésimos que en una fiscalización son una diferencia.
 *
 * Sin `float` para el redondeo ni para las sumas: `decimal.js`. Un
 * `Math.round(x × 1000) / 1000` falla en bordes como 1,0005 según cómo quede
 * el binario; `toFixed` también.
 *
 * PURO y client-safe.
 */

import Decimal from "decimal.js";
import { toFeet, toInches, PT_POR_M3, type PiezaCubicada } from "./cubicacion";

/** Decimales de un volumen en la GTF. */
export const DECIMALES_GTF = 3;

type Valor = Decimal.Value | null | undefined;

/** Un número cualquiera como `Decimal`; lo que no es número cuenta 0. */
function aDecimal(v: Valor): Decimal {
  if (v == null || v === "") return new Decimal(0);
  try {
    const d = new Decimal(v);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/** Un volumen al estándar de la GTF: 3 decimales, mitad hacia arriba. */
export function redondearGTF(valor: Valor, decimales: number = DECIMALES_GTF): number {
  return aDecimal(valor).toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP).toNumber();
}

/** Suma exacta, sin el arrastre del `float`: es la que va DENTRO de una fila. */
export function sumaExacta(valores: Iterable<Valor>): Decimal {
  let s = new Decimal(0);
  for (const v of valores) s = s.plus(aDecimal(v));
  return s;
}

/** El m³ oficial de una fila: Σ exacta de sus piezas, redondeada UNA vez. */
export function m3OficialDeFila(volumenes: Iterable<Valor>, decimales: number = DECIMALES_GTF): number {
  return sumaExacta(volumenes).toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP).toNumber();
}

export interface TotalGTF {
  /** Σ de los m³ oficiales de las filas (cada uno ya a 3 decimales). */
  m3: number;
  /** Σ simple de piezas (enteros). */
  piezas: number;
  filas: number;
}

/**
 * Totaliza filas de la GTF: cada m³ se lleva a su valor oficial (idempotente
 * si ya lo estaba) y recién ahí se suma. Sirve igual para una hoja, una
 * especie, un permiso o la guía entera: el total de un total es la suma de sus
 * filas, nunca un redondeo del crudo.
 */
export function totalizarGTF(
  filas: readonly { m3: Valor; piezas?: number | null }[],
  decimales: number = DECIMALES_GTF,
): TotalGTF {
  const m3 = sumaExacta(filas.map((f) => redondearGTF(f.m3, decimales)));
  return {
    m3: m3.toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP).toNumber(),
    piezas: filas.reduce((a, f) => a + Math.round(Number(f.piezas ?? 0) || 0), 0),
    filas: filas.length,
  };
}

export interface FilaAgrupadaGTF<P> {
  clave: string;
  /** m³ oficial de la fila (3 decimales, HALF_UP). */
  m3: number;
  piezas: number;
  items: P[];
}

/**
 * Agrupa piezas en filas de la GTF por `clave` (científico + tipo, o la que use
 * el documento) y le pone a cada fila su m³ oficial. El orden es el de la
 * primera aparición.
 */
export function filasGTF<P>(
  piezas: readonly P[],
  clave: (p: P) => string,
  volumen: (p: P) => Valor,
  piezasDe: (p: P) => number = () => 0,
  decimales: number = DECIMALES_GTF,
): FilaAgrupadaGTF<P>[] {
  const grupos = new Map<string, P[]>();
  for (const p of piezas) {
    const k = clave(p);
    const g = grupos.get(k);
    if (g) g.push(p);
    else grupos.set(k, [p]);
  }
  return [...grupos.entries()].map(([k, items]) => ({
    clave: k,
    m3: m3OficialDeFila(items.map(volumen), decimales),
    piezas: items.reduce((a, p) => a + Math.round(Number(piezasDe(p)) || 0), 0),
    items,
  }));
}

/**
 * El m³ EXACTO de un renglón aserrado, desde sus medidas: PT = espesor″ ×
 * ancho″ × largo′ / 12 × cantidad, y m³ = PT / 424, sin redondear nada en el
 * camino (decisión 4 del 2026-10-03). Sin medidas, el m³ que trae.
 */
export function m3ExactoDePieza(p: Pick<PiezaCubicada, "cantidad" | "espesor" | "ancho" | "largo" | "uEspesor" | "uAncho" | "uLargo" | "m3">): Decimal {
  const e = toInches(Number(p.espesor) || 0, p.uEspesor);
  const a = toInches(Number(p.ancho) || 0, p.uAncho);
  const l = toFeet(Number(p.largo) || 0, p.uLargo);
  if (!(e > 0 && a > 0 && l > 0)) return aDecimal(p.m3);
  const cant = Number(p.cantidad) > 0 ? Number(p.cantidad) : 1;
  return new Decimal(e).times(a).times(l).times(cant).dividedBy(12).dividedBy(PT_POR_M3);
}

/** El PT exacto de un renglón aserrado (sin el redondeo a 2 decimales por fila). */
export function ptExactoDePieza(p: Pick<PiezaCubicada, "cantidad" | "espesor" | "ancho" | "largo" | "uEspesor" | "uAncho" | "uLargo" | "pieTablar">): Decimal {
  const e = toInches(Number(p.espesor) || 0, p.uEspesor);
  const a = toInches(Number(p.ancho) || 0, p.uAncho);
  const l = toFeet(Number(p.largo) || 0, p.uLargo);
  if (!(e > 0 && a > 0 && l > 0)) return aDecimal(p.pieTablar);
  const cant = Number(p.cantidad) > 0 ? Number(p.cantidad) : 1;
  return new Decimal(e).times(a).times(l).times(cant).dividedBy(12);
}

/** El m³ oficial escrito con sus decimales, para el papel: «0.096» (sin pasar por `toFixed` del float). */
export function textoGTF(valor: Valor, decimales: number = DECIMALES_GTF): string {
  return aDecimal(valor).toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP).toFixed(decimales);
}

const normal = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * La clave de una fila de la GTF: nombre científico + tipo de producto (y la
 * unidad, para no sumar m³ con piezas). Sin científico cae al nombre común:
 * el catálogo de la fase 2 hace que eso no pase.
 */
export function claveFilaGTF(f: {
  cientifico?: string | null;
  comun?: string | null;
  tipo?: string | null;
  unidad?: string | null;
}): string {
  return [normal(f.cientifico) || `comun:${normal(f.comun)}`, normal(f.tipo), normal(f.unidad)].join("|");
}
