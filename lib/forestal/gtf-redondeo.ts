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
import { cubicarPieza, toFeet, toInches, PT_POR_M3, type PiezaCubicada } from "./cubicacion";

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

type LineaAserrada = Pick<PiezaCubicada, "cantidad" | "espesor" | "ancho" | "largo" | "uEspesor" | "uAncho" | "uLargo">;

/**
 * El PT EXACTO de una línea (espesor″ × ancho″ × largo′ / 12 × cantidad), sin
 * redondear: el que imprime la columna (10) del Anexo 04 en pie tablar, donde
 * una pieza 2″×5″×7′ es 5,833 y no 5,83. Sin medidas, el PT que trae.
 */
export function ptExactoDeLinea(p: LineaAserrada & Pick<PiezaCubicada, "pieTablar">): Decimal {
  const e = toInches(Number(p.espesor) || 0, p.uEspesor);
  const a = toInches(Number(p.ancho) || 0, p.uAncho);
  const l = toFeet(Number(p.largo) || 0, p.uLargo);
  if (!(e > 0 && a > 0 && l > 0)) return aDecimal(p.pieTablar);
  const cant = Number(p.cantidad) > 0 ? Number(p.cantidad) : 1;
  return new Decimal(e).times(a).times(l).times(cant).dividedBy(12);
}

/*
 * ADR-531 (Brandon 2026-11-03: «sumar todo normal y al último hacer el
 * redondeo»): lo que SE SUMA de una línea es su valor EXACTO; el PT a 2
 * decimales y el m³ a 4 de `cubicarPieza` quedan solo para MOSTRAR la pieza.
 * Redondear cada pieza antes de sumar empujaba la fila hacia arriba (Rivers,
 * 649 piezas: 23,487 m³ = 9.958,49 pt para 9.956,75 pt reales; exacto 23,483).
 * Antes (2026-10-03) se sumaba lo redondeado para cuadrar una GTF que llegó de
 * otro aserradero (31,188 contra 31,183): las guías de otros se copian con el
 * m³ de SU papel (`volumeM3`) y no pasan por acá.
 *
 * Un PT/m³ guardado en la línea que NO es el de `cubicarPieza` es un
 * prorrateo a propósito (el reparto parte la línea entre bloques y días) o un
 * dato sin medidas: ese se respeta tal cual.
 */

const tieneMedidas = (p: LineaAserrada): boolean =>
  Number(p.espesor) > 0 && Number(p.ancho) > 0 && Number(p.largo) > 0;

/** ¿El PT/m³ guardado es el que `cubicarPieza` le pone a esas medidas (y no un prorrateo)? */
function esElDeCubicar(p: LineaAserrada, campo: "pieTablar" | "m3", guardado: number): boolean {
  if (!tieneMedidas(p)) return false;
  const c = cubicarPieza({
    cantidad: Number(p.cantidad) > 0 ? Number(p.cantidad) : 1,
    espesor: Number(p.espesor),
    ancho: Number(p.ancho),
    largo: Number(p.largo),
    uEspesor: p.uEspesor,
    uAncho: p.uAncho,
    uLargo: p.uLargo,
  });
  return Math.abs(c[campo] - guardado) < 1e-9;
}

/** El PT de UNA línea para SUMAR: el exacto. Un PT guardado que no sale de sus medidas (prorrateo, sin medidas), ese. */
export function ptDeLinea(p: LineaAserrada & Pick<PiezaCubicada, "pieTablar">): Decimal {
  const guardado = Number(p.pieTablar);
  if (guardado > 0 && !esElDeCubicar(p, "pieTablar", guardado)) return aDecimal(p.pieTablar);
  return ptExactoDeLinea({ ...p, pieTablar: 0 });
}

/**
 * El m³ de UNA línea para SUMAR: PT exacto ÷ 424, sin redondear (la fila se
 * redondea UNA vez, `m3OficialDeFila`). Si la línea trae un m³ que no es el de
 * sus medidas —el reparto lo prorratea al partirla entre bloques y días—, ese.
 */
export function m3DeLinea(p: LineaAserrada & Pick<PiezaCubicada, "m3" | "pieTablar">): Decimal {
  const guardado = Number(p.m3);
  if (guardado > 0 && !esElDeCubicar(p, "m3", guardado)) return aDecimal(p.m3);
  return ptExactoDeLinea({ ...p, pieTablar: 0 }).dividedBy(PT_POR_M3);
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

// ─── Repartir las filas oficiales entre otras tablas ────────────────────────
//
// Brandon 2026-10-03: «todo el volumen en todas las tablas tiene que cuadrar el
// mismo volumen; de ahí se sacan los tres primeros decimales». Una fila de la
// GTF (especie × tipo) tiene UN m³ oficial; cualquier otra tabla del mismo
// lote (por medida, por largo, por bloque, por permiso, lo que falta…) parte
// esas mismas filas. Para que todas sumen EXACTO lo mismo, cada fila oficial se
// reparte en milésimos ENTEROS entre sus partes, en proporción a lo exacto de
// cada una y dando los milésimos que sobran a los restos más grandes (método
// del mayor resto). Así ninguna tabla «pierde» ni «gana» un milésimo.

/** La fila de la GTF de una pieza: especie (sin mayúsculas ni espacios de más) × tipo. */
export const filaGtf = (especie: string | null | undefined, tipo: string | null | undefined): string =>
  `${normal(especie) || "sin especie"}|${normal(tipo)}`;

/**
 * Reparte `total` (ya oficial) entre partes con sus valores exactos, en
 * unidades enteras de 10^-decimales, por mayor resto: Σ de lo devuelto = total.
 * Empates: la parte más grande y después la primera.
 */
export function repartirAlTotal(exactos: readonly Valor[], total: Valor, decimales: number = DECIMALES_GTF): number[] {
  const n = exactos.length;
  if (n === 0) return [];
  const unidad = new Decimal(10).pow(-decimales);
  const T = aDecimal(total).dividedBy(unidad).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const e = exactos.map((v) => Decimal.max(aDecimal(v), 0));
  const suma = e.reduce((a, v) => a.plus(v), new Decimal(0));
  if (suma.isZero()) {
    // Sin pesos: todo a la primera (no se inventa una proporción).
    return e.map((_, i) => (i === 0 ? T.times(unidad).toNumber() : 0));
  }
  const cuotas = e.map((v) => v.dividedBy(suma).times(T));
  const pisos = cuotas.map((q) => q.floor());
  let resto = T.minus(pisos.reduce((a, v) => a.plus(v), new Decimal(0))).toNumber();
  const orden = cuotas
    .map((q, i) => ({ i, r: q.minus(pisos[i]), v: e[i] }))
    .sort((a, b) => b.r.comparedTo(a.r) || b.v.comparedTo(a.v) || a.i - b.i);
  for (let k = 0; resto > 0 && k < orden.length; k++, resto--) pisos[orden[k].i] = pisos[orden[k].i].plus(1);
  return pisos.map((p) => p.times(unidad).toNumber());
}

/**
 * Las filas de un documento cuadradas a su TOTAL (Brandon 03-11: «pies ÷ 424
 * manda en todo»). El total es la Σ exacta de TODO redondeada una sola vez —en
 * aserrada, los pies tablares ÷ 424— y cada fila recibe su parte por mayor resto.
 * Cada fila queda a lo sumo 0,001 de su propio redondeo y Σ filas = total
 * siempre: el encabezado, las tarjetas y las tablas dicen el mismo número.
 * Medido: «802 pzas · 24-jul.» de Mario, filas sueltas 18,225 → 18,224 (sus pies
 * ÷ 424). Con valores que ya vienen a 3 decimales (papeles de otros) no cambia
 * nada: la suma ya es exacta.
 */
export function filasAlTotal(exactosPorFila: readonly Valor[], decimales: number = DECIMALES_GTF): number[] {
  return repartirAlTotal(exactosPorFila, m3OficialDeFila(exactosPorFila, decimales), decimales);
}

export interface ParteGTF {
  /** La fila GTF a la que pertenece (`filaGtf`). */
  fila: string;
  /** La parte de la otra tabla (una medida, un bloque, un largo…). */
  parte: string;
  exacto: Valor;
}

export interface RepartoGTF {
  /** Σ de las filas oficiales: el volumen del lote. */
  total: number;
  /** m³ oficial de cada fila. */
  porFila: Map<string, number>;
  /** m³ de cada parte (Σ de lo que le tocó de cada fila); suman `total`. */
  porParte: Map<string, number>;
  /** Lo que le tocó a cada parte DENTRO de cada fila: clave `${fila}␟${parte}`. */
  porFilaParte: Map<string, number>;
}

/** Separador de `porFilaParte` (no aparece en especies, tipos ni medidas). */
export const SEP_FILA_PARTE = "␟";

/**
 * El total del lote (Σ exacta de todo, redondeada UNA vez: pies ÷ 424) repartido
 * entre las filas (`filasAlTotal`) y cada fila entre sus partes, por mayor resto.
 * Cualquier tabla armada con `porParte` o `porFila` suma exactamente `total`.
 */
export function repartirFilasGTF(
  partes: readonly ParteGTF[],
  decimales: number = DECIMALES_GTF,
  /** El total OFICIAL de una fila cuando ya está dicho en otro lado (la Distribución: Σ por permiso + falta). */
  totalesDeFila?: ReadonlyMap<string, number> | null,
): RepartoGTF {
  const filas = new Map<string, Map<string, Decimal>>();
  for (const p of partes) {
    const f = filas.get(p.fila) ?? new Map<string, Decimal>();
    f.set(p.parte, (f.get(p.parte) ?? new Decimal(0)).plus(aDecimal(p.exacto)));
    filas.set(p.fila, f);
  }
  const porFila = new Map<string, number>();
  const porParte = new Map<string, Decimal>();
  const porFilaParte = new Map<string, number>();
  /* Sin totales dichos en otro lado, las filas se cuadran al total del lote. */
  const lista = [...filas];
  const alTotal = totalesDeFila
    ? null
    : filasAlTotal(lista.map(([, ps]) => sumaExacta(ps.values())), decimales);
  for (const [n, [fila, ps]] of lista.entries()) {
    const claves = [...ps.keys()];
    const exactos = claves.map((k) => ps.get(k) as Decimal);
    const oficial = alTotal ? alTotal[n] : (totalesDeFila?.get(fila) ?? m3OficialDeFila(exactos, decimales));
    porFila.set(fila, oficial);
    repartirAlTotal(exactos, oficial, decimales).forEach((v, i) => {
      porParte.set(claves[i], (porParte.get(claves[i]) ?? new Decimal(0)).plus(v));
      porFilaParte.set(`${fila}${SEP_FILA_PARTE}${claves[i]}`, v);
    });
  }
  return {
    total: totalizarGTF([...porFila.values()].map((m3) => ({ m3 })), decimales).m3,
    porFila,
    porParte: new Map([...porParte].map(([k, v]) => [k, v.toDecimalPlaces(decimales).toNumber()])),
    porFilaParte,
  };
}
