/**
 * cubicacion-trozas.ts — cubicación de madera ROLLIZA (trozas) por Smalian.
 * PURO y client-safe, hermano de `cubicacion.ts` (aserrada).
 *
 * Convención de campo peruana (y lo que espera SERFOR en el ingreso al CTP):
 *   - Diámetros en CENTÍMETROS, medidos en las dos caras de la troza
 *     (menor y mayor); largo en METROS.
 *   - Volumen en m³ por SMALIAN: V = ((A1 + A2) / 2) × L, con A = π/4 × (D/100)².
 *     Es la fórmula de los cubicadores oficiales; con un solo diámetro
 *     (D2 = D1) colapsa al cilindro.
 *
 * El ingreso al Libro CTP registra rolliza EN m³ (`WoodEntry.volumeM3`): esta
 * herramienta sirve para verificar en patio lo que dice la GTF antes de firmar.
 */

export interface TrozaCubicada {
  id: string;
  /** Diámetro menor (cm). */
  d1: number;
  /** Diámetro mayor (cm) — si no se midió, igual a d1. */
  d2: number;
  /** Largo (m). */
  largo: number;
  especie?: string;
  /** m³ Smalian de ESTA troza. */
  m3: number;
  /** Categoría por diámetro forzada a mano — `undefined` = la decide `d1` (ver `tipoDeTroza`). */
  tipo?: TipoTroza;
}

/**
 * Categoría por diámetro MENOR (d1): es el que limita qué se puede sacar de
 * la troza, igual criterio que la cinta diamétrica del patio. Umbrales de
 * referencia (pedido de Brandon 2026-08-20) — el override manual existe
 * porque el negocio clasifica por cliente, no sólo por cinta.
 */
export const DIAMETRO_DELGADA_MAX_CM = 25;
export const DIAMETRO_MEDIA_MAX_CM = 40;

export type TipoTroza = "Delgada" | "Media" | "Gruesa";
export const ORDEN_TIPO_TROZA: readonly TipoTroza[] = ["Delgada", "Media", "Gruesa"];
export const TIPOS_TROZA: { valor: TipoTroza; label: string; hint: string }[] = [
  { valor: "Delgada", label: "Delgada", hint: `Ø menor < ${DIAMETRO_DELGADA_MAX_CM} cm` },
  { valor: "Media", label: "Media", hint: `Ø menor ${DIAMETRO_DELGADA_MAX_CM}-${DIAMETRO_MEDIA_MAX_CM} cm` },
  { valor: "Gruesa", label: "Gruesa", hint: `Ø menor > ${DIAMETRO_MEDIA_MAX_CM} cm` },
];

export function clasificarTrozaPorDiametro(d1: number): TipoTroza {
  if (d1 < DIAMETRO_DELGADA_MAX_CM) return "Delgada";
  if (d1 <= DIAMETRO_MEDIA_MAX_CM) return "Media";
  return "Gruesa";
}

/** Tipo efectivo de una troza: el forzado a mano gana, si no la categoría por
 *  diámetro — single source, mismo patrón que `tipoDePieza` de la aserrada. */
export function tipoDeTroza(t: Pick<TrozaCubicada, "d1" | "tipo">): TipoTroza {
  return t.tipo ?? clasificarTrozaPorDiametro(t.d1);
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Área de la sección circular en m², con el diámetro en cm. */
const areaM2 = (dCm: number) => (Math.PI / 4) * (dCm / 100) ** 2;

/**
 * Volumen Smalian de una troza en m³. `d2` opcional: sin segunda medida se
 * asume troza pareja (cilindro con d1).
 */
export function cubicarTroza(d1Cm: number, largoM: number, d2Cm?: number): number {
  const d2 = d2Cm && d2Cm > 0 ? d2Cm : d1Cm;
  if (!(d1Cm > 0 && largoM > 0)) return 0;
  return r4(((areaM2(d1Cm) + areaM2(d2)) / 2) * largoM);
}

/**
 * Dictado por voz de trozas: los números llegan en TRÍOS «D1 · D2 · largo»
 * (40 45 3.5 = diámetros 40/45 cm, largo 3.5 m). El sobrante se arrastra a la
 * siguiente frase, igual que en el cubicador de aserrada.
 *
 * Heurística de seguridad del dictado: si el TERCER número es mayor que los
 * diámetros, casi seguro el operador dictó «D1 D2 L» al revés o pegó otra
 * troza — un largo de troza no pasa de ~15 m y un diámetro comercial no baja
 * de ~15 cm. No se corrige solo (sería inventar): se marca `sospechosa` para
 * que la fila salga resaltada y se revise.
 */
export interface TrozaParseada {
  d1: number;
  d2: number;
  largo: number;
  sospechosa: boolean;
}

export const LARGO_MAX_M = 15;
export const DIAMETRO_MIN_CM = 10;

export function partirEnTrozas(nums: number[]): { trozas: TrozaParseada[]; resto: number[] } {
  const trozas: TrozaParseada[] = [];
  let i = 0;
  for (; i + 3 <= nums.length; i += 3) {
    const [d1, d2, largo] = nums.slice(i, i + 3);
    if (d1 > 0 && d2 > 0 && largo > 0) {
      const sospechosa = largo > LARGO_MAX_M || d1 < DIAMETRO_MIN_CM || d2 < DIAMETRO_MIN_CM;
      trozas.push({ d1, d2, largo, sospechosa });
    }
  }
  return { trozas, resto: nums.slice(i) };
}

/** Totales de un lote de trozas. */
export function totalesTrozas(rows: TrozaCubicada[]): { trozas: number; m3: number } {
  return {
    trozas: rows.length,
    m3: r4(rows.reduce((a, r) => a + r.m3, 0)),
  };
}

/**
 * Compara el volumen cubicado en patio contra el declarado en la GTF.
 * El delta es (patio − guía) / guía: negativo = llegó MENOS de lo declarado.
 */
export function compararConGtf(m3Patio: number, m3Guia: number): { deltaM3: number; deltaPct: number } | null {
  if (!(m3Guia > 0)) return null;
  const deltaM3 = r4(m3Patio - m3Guia);
  return { deltaM3, deltaPct: Math.round((deltaM3 / m3Guia) * 10000) / 100 };
}
