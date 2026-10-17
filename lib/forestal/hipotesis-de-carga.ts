/**
 * hipotesis-de-carga.ts — cuando una corrida declara una cifra imposible, ¿qué
 * fue lo que pasó al cargarla? (ADR-417)
 *
 * `produccion-cifras-imposibles.ts` dice QUE está mal; esto ofrece la cuenta
 * alternativa que suele explicarlo, para que quien corrige tenga un número
 * defendible en vez de una corazonada.
 *
 * El caso que lo motivó (tenant real, 2026-09-15): la corrida 24 declara
 * **141 piezas en 0,0090 m³** = 64 cm³ por pieza. Si esos 0,0090 fueran el
 * volumen de UNA pieza, el total sería 1,269 m³ — y 0,0090 por pieza queda al
 * lado de los **0,0106 m³ por pieza** que el propio libro tiene medidos para
 * paquetería corta (15,24 × 15,24 × 0,46 m). La corrida 26, en cambio, declara
 * 0,0010: ni como unitario cierra (sería 1 litro por pieza, 10× menos que la
 * referencia), así que ahí la hipótesis se ofrece como lo que es —una cuenta
 * que tampoco cuadra— y no se propone ningún número.
 *
 * NUNCA corrige sola: el libro es lo que se presenta ante SERFOR y una línea
 * ya declarada se anula y se vuelve a declarar, no se edita en silencio.
 */

/** m³ por pieza que el libro tiene MEDIDOS, por tipo de producto (de los paquetes con escuadría). */
export interface ReferenciaPorPieza {
  productType: string;
  m3PorPieza: number;
}

export type HipotesisDeCarga =
  /** Lo cargado parece el volumen de una pieza, no el de la corrida. */
  | { tipo: "volumen-unitario"; totalPropuesto: number; m3PorPieza: number; referencia: number }
  /** La cuenta alternativa tampoco da contra la referencia medida: no se propone número. */
  | { tipo: "sin-explicacion"; m3PorPiezaSiFueraUnitario: number; referencia: number }
  /**
   * La cuenta se puede hacer, pero el libro no tiene con qué compararla. Se dice
   * la cuenta y se dice que no hay referencia — afirmar que «no cierra» sin nada
   * contra qué medirlo sería inventar un veredicto.
   */
  | { tipo: "sin-referencia"; totalPropuesto: number; m3PorPieza: number };

/** Cuánto puede alejarse de la referencia y seguir siendo creíble: la mitad o el doble. */
const FACTOR = 2;

/**
 * @param volumen  lo que declara la corrida (m³)
 * @param piezas   las piezas declaradas
 * @param referencia  m³ por pieza medidos para ese producto, si el libro tiene alguno
 */
export function hipotesisDeCarga(
  volumen: number,
  piezas: number,
  referencia: number | null,
): HipotesisDeCarga | null {
  if (!Number.isFinite(volumen) || !Number.isFinite(piezas) || volumen <= 0 || piezas <= 1) return null;
  const comoUnitario = volumen; // si lo cargado fuera de UNA pieza, ese es el m³ por pieza
  const total = volumen * piezas;
  if (referencia == null || referencia <= 0) {
    return { tipo: "sin-referencia", totalPropuesto: total, m3PorPieza: comoUnitario };
  }
  const creible = comoUnitario >= referencia / FACTOR && comoUnitario <= referencia * FACTOR;
  return creible
    ? { tipo: "volumen-unitario", totalPropuesto: total, m3PorPieza: comoUnitario, referencia }
    : { tipo: "sin-explicacion", m3PorPiezaSiFueraUnitario: comoUnitario, referencia };
}

/** La referencia del producto, sacada de los paquetes que SÍ tienen escuadría. */
export function referenciaDe(productType: string | null, medidos: readonly ReferenciaPorPieza[]): number | null {
  if (!productType) return null;
  const clave = productType.trim().toUpperCase();
  const iguales = medidos.filter((m) => m.productType.trim().toUpperCase() === clave && m.m3PorPieza > 0);
  if (iguales.length === 0) return null;
  // La mediana, no el promedio: un paquete raro no corre la referencia de todos.
  const orden = iguales.map((m) => m.m3PorPieza).sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio]! : (orden[medio - 1]! + orden[medio]!) / 2;
}

/** La frase para la pantalla. `null` cuando no hay nada útil que decir. */
export function explicarHipotesis(h: HipotesisDeCarga | null, fmt: (n: number) => string): string | null {
  if (!h) return null;
  if (h.tipo === "volumen-unitario") {
    return `Si lo cargado fuera el volumen de UNA pieza, la corrida daría ${fmt(h.totalPropuesto)} m³ — y ${fmt(h.m3PorPieza)} por pieza queda al lado de los ${fmt(h.referencia)} que el libro tiene medidos para este producto.`;
  }
  if (h.tipo === "sin-referencia") {
    return `Si lo cargado fuera el volumen de UNA pieza, la corrida daría ${fmt(h.totalPropuesto)} m³ (${fmt(h.m3PorPieza)} por pieza). El libro todavía no tiene otra corrida de este producto para comparar.`;
  }
  return `Ni tomándolo como volumen de una sola pieza cierra (${fmt(h.m3PorPiezaSiFueraUnitario)} por pieza contra los ${fmt(h.referencia)} medidos): hay que mirar el parte.`;
}
