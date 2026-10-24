/**
 * cubicacion-oxapampa.ts — el pie tablar con el que se paga la madera en troza
 * (Brandon, 2026-09-26).
 *
 * La guía de SERFOR cubica en m³ por Smalian: es el dato del LIBRO y sirve para
 * el proceso interno. Con los dueños del bosque, las compras, las ventas y el
 * flete se trabaja con la **fórmula Oxapampa**: se miden las dos puntas en
 * PULGADAS y el largo en PIES, y
 *
 *     pt = Dp² × L / 24.5        con Dp = promedio de las dos puntas
 *
 * Es una medición propia del aserradero, tomada en el patio — no se deriva de
 * los centímetros de la guía (un número derivado que parece oficial termina
 * pagándose). Por eso el servidor la calcula al guardar y la CONGELA en
 * `WoodEntryTroza.oxPt`: si mañana cambia el divisor, lo ya pagado no se
 * reescribe. `totalPtOxapampa` suma ese valor congelado antes que recalcular.
 *
 * PURO y client-safe: lo usan la pantalla (vista previa mientras se tipea), la
 * DB class (lo que se guarda) y el test — los tres con la misma cuenta.
 */

/** El divisor de la fórmula Oxapampa (pulgadas² × pies → pie tablar). */
export const DIVISOR_OXAPAMPA = 24.5;

/**
 * Topes de lo que se puede tipear. No son de la fórmula sino del mundo: una
 * troza de 120" (3 m de diámetro) o de 100 pies (30 m) ya es un error de dedo.
 * Los usa el Zod del endpoint y los puede usar el formulario.
 */
export const LIMITES_OXAPAMPA = {
  pulgadasMax: 120,
  piesMax: 100,
} as const;

/** Las tres medidas que se toman en el patio. `null`/ausente = no se midió. */
export interface MedidaOxapampa {
  d1Pulg?: number | null;
  d2Pulg?: number | null;
  largoPies?: number | null;
}

/** Una pieza con su cubicación Oxapampa, como la devuelven las lecturas de troza. */
export interface TrozaConOxapampa {
  oxD1Pulg?: number | null;
  oxD2Pulg?: number | null;
  oxLargoPies?: number | null;
  /** El pt que se guardó (congelado). Si está, manda sobre las medidas. */
  oxPt?: number | null;
}

/** Positivo y finito, o `null`. `undefined`, `null`, `NaN`, 0 y negativos no son una medida. */
function positivo(v: number | null | undefined): number | null | "invalido" {
  if (v == null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) return "invalido";
  return v > 0 ? v : "invalido";
}

/** Redondeo a 2 decimales, el que se guarda (`Decimal(12,2)`). */
export function redondearPt(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * El diámetro promedio en pulgadas. Con una sola punta medida, es esa. `null`
 * si no hay ninguna o si alguna vino en cero, negativa o no numérica (una punta
 * mal tipeada no se ignora en silencio: se pide de nuevo).
 */
export function diametroPromedioPulg(m: Pick<MedidaOxapampa, "d1Pulg" | "d2Pulg">): number | null {
  const d1 = positivo(m.d1Pulg);
  const d2 = positivo(m.d2Pulg);
  if (d1 === "invalido" || d2 === "invalido") return null;
  if (d1 == null && d2 == null) return null;
  if (d1 == null) return d2;
  if (d2 == null) return d1;
  return (d1 + d2) / 2;
}

/**
 * El pie tablar Oxapampa de UNA troza, redondeado a 2 decimales (lo mismo que
 * se guarda). `null` si falta el largo, falta CUALQUIERA de las dos puntas, o
 * algún valor medido es ≤ 0 / no numérico.
 *
 * Las dos puntas, siempre: la fórmula del dueño es «el promedio de ambas
 * puntas». Con una sola se congelaba un PT que podía salir 21 % más alto
 * (22″ sola × 12′ = 237 pt contra 196 con 22″ y 18″) y la troza contaba como
 * cubicada (revisión 26-09). Media medida = sin cubicar.
 *
 * Ejemplo del dueño: puntas de 18" y 22" (Dp = 20"), 12 pies de largo →
 * 20 × 20 × 12 / 24.5 = 195.92 pt.
 */
export function ptOxapampa(m: MedidaOxapampa): number | null {
  const largo = positivo(m.largoPies);
  if (largo == null || largo === "invalido") return null;
  if (positivo(m.d1Pulg) == null || positivo(m.d2Pulg) == null) return null;
  const dp = diametroPromedioPulg(m);
  if (dp == null) return null;
  return redondearPt((dp * dp * largo) / DIVISOR_OXAPAMPA);
}

/**
 * El PT del **Cubicador de trozas** (Herramientas, sin libro), con UNO o DOS
 * diámetros: con uno solo es el Ø medido al medio de la troza (Dp = ese Ø); con
 * dos, el promedio de las puntas — la misma cuenta que `ptOxapampa`. Mismo
 * redondeo que ADR-440: cada medida a 2 decimales antes de la fórmula y el PT a 2.
 *
 * NO es la regla del pago: la plata de la guía y el flete siguen exigiendo las
 * dos puntas (`ptOxapampa`). Sin `d2` (o en cero) la troza se toma pareja, igual
 * que `cubicarTroza` de la Smalian. `null` = falta el Ø o el largo.
 *
 * 20″ × 12′ → 195.92 · 18″ y 22″ × 12′ → Dp 20″ → 195.92.
 */
export function ptOxapampaDelCubicador(dPulg: number, largoPies: number, d2Pulg?: number | null): number | null {
  if (!(typeof dPulg === "number" && Number.isFinite(dPulg) && dPulg > 0)) return null;
  const d2 = typeof d2Pulg === "number" && Number.isFinite(d2Pulg) && d2Pulg > 0 ? d2Pulg : dPulg;
  if (!(typeof largoPies === "number" && Number.isFinite(largoPies))) return null;
  return ptOxapampa({ d1Pulg: redondearPt(dPulg), d2Pulg: redondearPt(d2), largoPies: redondearPt(largoPies) });
}

/**
 * El pt de una pieza ya guardada: el CONGELADO (`oxPt`) si existe; si no, el
 * que dan sus medidas. `null` = sin cubicar.
 */
export function ptDeTroza(t: TrozaConOxapampa): number | null {
  if (typeof t.oxPt === "number" && Number.isFinite(t.oxPt) && t.oxPt > 0) return t.oxPt;
  return ptOxapampa({ d1Pulg: t.oxD1Pulg, d2Pulg: t.oxD2Pulg, largoPies: t.oxLargoPies });
}

/** Σ pt Oxapampa de las piezas cubicadas (las sin cubicar no suman ni restan). */
export function totalPtOxapampa(trozas: readonly TrozaConOxapampa[]): number {
  let total = 0;
  for (const t of trozas) total += ptDeTroza(t) ?? 0;
  return redondearPt(total);
}

/**
 * Total + cuántas piezas tienen cubicación y cuántas no. Un total sin la cuenta
 * de las que faltan miente: «1 200 pt» de 30 trozas cuando la guía trae 60.
 */
export function resumenOxapampa(trozas: readonly TrozaConOxapampa[]): {
  pt: number;
  cubicadas: number;
  sinCubicar: number;
} {
  let pt = 0;
  let cubicadas = 0;
  for (const t of trozas) {
    const v = ptDeTroza(t);
    if (v == null) continue;
    pt += v;
    cubicadas += 1;
  }
  return { pt: redondearPt(pt), cubicadas, sinCubicar: trozas.length - cubicadas };
}
