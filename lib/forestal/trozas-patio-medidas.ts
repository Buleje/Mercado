/**
 * Las medidas de una troza del patio y las cifras que salen de ellas.
 *
 * Brandon, 05-10: «en la tabla, en D1 y D2 quiero que estén los datos». La
 * columna leía SÓLO `d1Cm`/`d2Cm` (lo que declara la guía o lo que la planta
 * cargó encima de un NULL), pero la pieza puede traer sus puntas por otros dos
 * caminos que la tabla ignoraba:
 *   · `recibida{D1,D2}Cm` — lo medido al RECIBIRLA cuando llegó distinta a la
 *     guía (ADR-450 L1);
 *   · `ox{D1,D2}Pulg` — la cubicación Oxapampa del aserradero (ADR-440), en
 *     pulgadas: se pasan a cm (× 2,54) y se dice que vienen de ahí.
 * Cada medida sale con su FUENTE: un número sin saber de dónde viene no se
 * puede defender en una fiscalización.
 *
 * Lo que NO hace: inventar un diámetro. El «≈» que sale del volumen y el largo
 * (`diametroEquivalenteCm`) es una pista para quien anota, nunca un D1/D2.
 *
 * PURO: sin JSX ni estado.
 */

import { estaEnPatio, estadoDeTroza, type TrozaPatio } from "./trozas-patio";

export const CM_POR_PULGADA = 2.54;

export type FuenteMedida = "guia" | "planta" | "recibida" | "oxapampa";

/** Cómo se dice de dónde salió cada medida (la marca va al lado del número). */
export const FUENTE_MEDIDA_META: Record<FuenteMedida, { marca: string; label: string }> = {
  guia: { marca: "", label: "Declarado en la guía" },
  planta: { marca: "P", label: "Medido en planta (la guía no lo traía)" },
  recibida: { marca: "R", label: "Medido al recibirla: llegó distinta a la guía" },
  oxapampa: { marca: "Ox", label: "De la cubicación Oxapampa (pulgadas pasadas a cm)" },
};

/** Lo que una pieza puede traer sobre sus puntas. Todo opcional: lo lee el JSON. */
export interface PiezaConMedidas {
  d1Cm?: number | null;
  d2Cm?: number | null;
  d1d2MedidoEnPlanta?: boolean | null;
  recibidaD1Cm?: number | null;
  recibidaD2Cm?: number | null;
  oxD1Pulg?: number | null;
  oxD2Pulg?: number | null;
  largoM?: number | null;
  volumenM3?: number | null;
}

export interface MedidasPieza {
  d1: number | null;
  d2: number | null;
  fuente: FuenteMedida | null;
}

const valida = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * D1 y D2 de la pieza, de la fuente que primero los tenga.
 *
 * El orden es el del libro: lo declarado (guía o planta sobre un NULL) manda;
 * lo recibido distinto viene después porque la columna del libro es la de la
 * guía; Oxapampa al final porque es un dato comercial convertido de unidad.
 * Una fuente cuenta si trae AL MENOS una punta: mezclar el D1 de una con el D2
 * de otra sería un tronco que nadie midió.
 */
export function medidasDePieza(t: PiezaConMedidas): MedidasPieza {
  if (valida(t.d1Cm) || valida(t.d2Cm)) {
    return {
      d1: valida(t.d1Cm) ? t.d1Cm : null,
      d2: valida(t.d2Cm) ? t.d2Cm : null,
      fuente: t.d1d2MedidoEnPlanta ? "planta" : "guia",
    };
  }
  if (valida(t.recibidaD1Cm) || valida(t.recibidaD2Cm)) {
    return {
      d1: valida(t.recibidaD1Cm) ? t.recibidaD1Cm : null,
      d2: valida(t.recibidaD2Cm) ? t.recibidaD2Cm : null,
      fuente: "recibida",
    };
  }
  if (valida(t.oxD1Pulg) || valida(t.oxD2Pulg)) {
    return {
      d1: valida(t.oxD1Pulg) ? r1(t.oxD1Pulg * CM_POR_PULGADA) : null,
      d2: valida(t.oxD2Pulg) ? r1(t.oxD2Pulg * CM_POR_PULGADA) : null,
      fuente: "oxapampa",
    };
  }
  return { d1: null, d2: null, fuente: null };
}

/** ¿Le falta alguna punta? (la que tiene una sola también se ofrece a completar). */
export const faltanMedidas = (t: PiezaConMedidas): boolean => {
  const m = medidasDePieza(t);
  return m.d1 == null || m.d2 == null;
};

/**
 * Volumen por Huber sobre el diámetro medio: π/4 · Dm² · L (D en cm, L en m).
 *
 * Es la fórmula con la que la guía de SERFOR reproduce sus volúmenes al
 * milésimo (ADR-312), así que sirve para avisar un D1/D2 mal tipeado.
 */
/** Huber con las puntas vs volumen declarado: más de esto de diferencia = revisar la pieza.
 *  Una sola cifra para la planilla «Anotar D1 y D2» y la ficha de la troza (05-10). */
export const UMBRAL_HUBER = 0.1;

export function volumenHuberM3(d1: number | null, d2: number | null, largoM: number | null | undefined): number | null {
  if (!valida(d1) || !valida(d2) || !valida(largoM)) return null;
  const dm = (d1 + d2) / 2 / 100;
  return Math.round((Math.PI / 4) * dm * dm * largoM * 10_000) / 10_000;
}

/**
 * El diámetro medio que haría cuadrar el volumen declarado con el largo
 * (Huber al revés). DERIVADO: es una pista para anotar, no una medida.
 */
export function diametroEquivalenteCm(volumenM3: number | null | undefined, largoM: number | null | undefined): number | null {
  if (!valida(volumenM3) || !valida(largoM)) return null;
  return Math.round(Math.sqrt((4 * volumenM3) / (Math.PI * largoM)) * 100);
}

/** Las piezas con su chapa y su cubicación comercial. */
export interface PiezaDelPatio extends TrozaPatio, Omit<PiezaConMedidas, "volumenM3"> {
  etiquetadaEn?: string | null;
  oxPt?: number | null;
}

export interface CifrasExtraPatio {
  /** Piezas EN PATIO con sus dos puntas, de cualquier fuente. */
  conMedidas: number;
  /** Piezas EN PATIO a las que les falta alguna punta. */
  sinMedidas: number;
  /** Promedio de (D1+D2)/2 sobre las que tienen las dos, en cm. */
  calibrePromedioCm: number | null;
  /** La punta más gruesa del patio, en cm. */
  calibreMayorCm: number | null;
  largoPromedioM: number | null;
  largoMayorM: number | null;
  m3PromedioPorPieza: number | null;
  m3MayorPieza: number | null;
  /** Piezas en patio con etiqueta QR impresa (ADR-436). */
  etiquetadas: number;
  /** Piezas en patio con cubicación Oxapampa y el pt que suman. */
  cubicadasOx: number;
  ptOx: number;
  /** Las piezas en patio sobre las que se contó todo lo anterior. */
  enPatio: number;
}

/**
 * Las cifras del patio que el panorama no contaba: calibre, largo, tamaño de
 * pieza, etiquetas y cubicación. Sólo sobre lo que SIGUE parado (libre o
 * apartada): el calibre de lo ya aserrado no ayuda a programar la sierra.
 */
export function cifrasExtraPatio(trozas: readonly PiezaDelPatio[]): CifrasExtraPatio {
  let conMedidas = 0;
  let sinMedidas = 0;
  let sumaCalibre = 0;
  let calibreMayor: number | null = null;
  let sumaLargo = 0;
  let conLargo = 0;
  let largoMayor: number | null = null;
  let sumaM3 = 0;
  let conM3 = 0;
  let m3Mayor: number | null = null;
  let etiquetadas = 0;
  let cubicadasOx = 0;
  let ptOx = 0;
  let enPatio = 0;

  for (const t of trozas) {
    if (!estaEnPatio(estadoDeTroza(t))) continue;
    enPatio += 1;
    const m = medidasDePieza(t);
    if (m.d1 != null && m.d2 != null) {
      conMedidas += 1;
      sumaCalibre += (m.d1 + m.d2) / 2;
      const mayor = Math.max(m.d1, m.d2);
      calibreMayor = calibreMayor == null ? mayor : Math.max(calibreMayor, mayor);
    } else {
      sinMedidas += 1;
    }
    if (valida(t.largoM)) {
      conLargo += 1;
      sumaLargo += t.largoM;
      largoMayor = largoMayor == null ? t.largoM : Math.max(largoMayor, t.largoM);
    }
    if (valida(t.volumenM3)) {
      conM3 += 1;
      sumaM3 += t.volumenM3;
      m3Mayor = m3Mayor == null ? t.volumenM3 : Math.max(m3Mayor, t.volumenM3);
    }
    if (t.etiquetadaEn) etiquetadas += 1;
    if (valida(t.oxPt)) {
      cubicadasOx += 1;
      ptOx += t.oxPt;
    }
  }

  return {
    conMedidas,
    sinMedidas,
    calibrePromedioCm: conMedidas > 0 ? r1(sumaCalibre / conMedidas) : null,
    calibreMayorCm: calibreMayor,
    largoPromedioM: conLargo > 0 ? Math.round((sumaLargo / conLargo) * 100) / 100 : null,
    largoMayorM: largoMayor,
    m3PromedioPorPieza: conM3 > 0 ? Math.round((sumaM3 / conM3) * 1000) / 1000 : null,
    m3MayorPieza: m3Mayor,
    etiquetadas,
    cubicadasOx,
    ptOx: Math.round(ptOx * 100) / 100,
    enPatio,
  };
}

/** Las piezas EN PATIO sin título habilitante: el mismo predicado que `resumirPatio().sinTitulo`. */
export function piezasSinTitulo<T extends TrozaPatio>(trozas: readonly T[]): T[] {
  return trozas.filter((t) => estaEnPatio(estadoDeTroza(t)) && !(t.permiso ?? "").trim());
}
