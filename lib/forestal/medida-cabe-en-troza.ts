/**
 * ¿Esta pieza aserrada cabe en estas trozas? — la ÚNICA regla (ADR-505).
 *
 * La usan dos lectores que tienen que decir lo mismo:
 *  · el reparto (`distribuirPorCapacidad`): una medida sólo va a un bloque si
 *    cabe en sus trozas (Brandon, 2026-10-20: «que se distribuya de acuerdo a
 *    ello»);
 *  · «¿Cuadran las medidas?» (`cuadre-medidas-rolliza.ts`): la advertencia
 *    de lo que quedó mal puesto (con la regla activa, sólo las entradas a mano).
 *
 * Reglas (todas con su tolerancia en la UNIDAD DEL NEGOCIO, no en el epsilon):
 *  · LARGO: el largo de la pieza (pies → m) ≤ la troza más larga + 15 cm.
 *  · DIÁMETRO: la SECCIÓN de la pieza tiene que entrar en el círculo de la
 *    punta delgada: la diagonal √(ancho² + espesor²) ≤ Ø menor (D1/D2) + 1 cm.
 *    Una tabla de 2×12″ pide 30,9 cm de Ø, no 30,5: las esquinas también salen
 *    de la troza.
 *  · LA MISMA TROZA: si hay trozas largas y trozas gruesas pero ninguna es las
 *    dos cosas a la vez, la pieza tampoco pudo salir (sólo se juzga con trozas
 *    que traen las dos medidas).
 *
 * Puro: sin React, sin red, sin localStorage. NO importa `cubicacion-reparto`
 * (es al revés: el reparto importa esto).
 */

import { CM_POR_PULGADA, M_POR_PIE } from "./escuadria-del-paquete";
import { medidasDePieza } from "./trozas-patio-medidas";

/**
 * 15 cm de holgura en el largo. Una pieza «de 20 pies» mide 6,096 m en la
 * cuenta, pero el aserradero la corta de una troza de 6,00 m: el pie comercial
 * se redondea a 30 cm y la wincha del patio mide al centímetro. 15 cm ≈ medio
 * pie, y es el 2,5 % de una troza de 6 m.
 */
export const TOLERANCIA_LARGO_M = 0.15;
/** 1 cm de holgura en el Ø: lo que se equivoca la cinta diamétrica en una troza con corteza. */
export const TOLERANCIA_DIAMETRO_CM = 1;

export interface TrozaMedida {
  largoM?: number | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  diametroCm?: number | null;
  /** Volumen de la guía/libro; sin él se usa Smalian con D1/D2 y el largo. */
  volumenM3?: number | null;
  /** Cuándo llegó (ISO): sólo informativo, viaja con la copia del bloque. */
  llegaISO?: string | null;
}

/** Una medida aserrada (la `AsignacionMedida` del reparto encaja tal cual). */
export interface PiezaMedida {
  medida: string;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: string;
  uAncho: string;
  uLargo: string;
  piezas: number;
}

export type MotivoMedida = "largo" | "diametro" | "misma-troza";

const numPositivo = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Lo que una troza del patio puede traer para medirla (la API: Decimal como texto o número). */
export interface TrozaConMedidasAPI {
  largoM?: unknown;
  d1Cm?: unknown;
  d2Cm?: unknown;
  diametroCm?: unknown;
  volumenM3?: unknown;
  /** Lo medido al recibirla (ADR-450 L1) y la cubicación Oxapampa en pulgadas (ADR-440). */
  recibidaD1Cm?: unknown;
  recibidaD2Cm?: unknown;
  oxD1Pulg?: unknown;
  oxD2Pulg?: unknown;
}

/**
 * La copia de una troza que se guarda con la hoja (ADR-505): sólo números
 * (la API puede traer un Decimal como texto) y sin id ni permiso. `null` si no
 * trae ni largo ni Ø: no hay nada que comparar.
 *
 * Las puntas salen de `medidasDePieza` —la MISMA que dibuja D1/D2 en el patio—:
 * guía o planta, después lo medido al recibirla y al final Oxapampa (pulgadas
 * → cm). Antes sólo se leían `d1Cm`/`d2Cm` y una troza con sus puntas cubicadas
 * en Oxapampa se veía medida en el patio y «diámetro sin comprobar» en la
 * distribución (20-10).
 */
export function medidaDeTroza(t: TrozaConMedidasAPI): TrozaMedida | null {
  const largoM = numPositivo(t.largoM);
  const puntas = medidasDePieza({
    d1Cm: numPositivo(t.d1Cm),
    d2Cm: numPositivo(t.d2Cm),
    recibidaD1Cm: numPositivo(t.recibidaD1Cm),
    recibidaD2Cm: numPositivo(t.recibidaD2Cm),
    oxD1Pulg: numPositivo(t.oxD1Pulg),
    oxD2Pulg: numPositivo(t.oxD2Pulg),
  });
  const d1Cm = puntas.d1;
  const d2Cm = puntas.d2;
  const diametroCm = numPositivo(t.diametroCm);
  if (largoM == null && d1Cm == null && d2Cm == null && diametroCm == null) return null;
  const volumenM3 = numPositivo(t.volumenM3);
  return { largoM, d1Cm, d2Cm, diametroCm, ...(volumenM3 != null ? { volumenM3 } : {}) };
}

export interface AvisoMedida {
  medida: string;
  piezas: number;
  largoM: number;
  /** El lado mayor (ancho o espesor) en cm. */
  ladoCm: number;
  /** La diagonal de la sección en cm: el Ø que pide la pieza. */
  diagonalCm: number;
  motivos: MotivoMedida[];
  texto: string;
}

export interface RespaldoTrozas {
  /** Trozas con al menos una medida útil (largo o Ø). */
  trozas: number;
  largoMaxM: number | null;
  diametroMaxCm: number | null;
}

const positivo = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

/** Largo a metros. Unidad desconocida = `null` (no se adivina). */
export function aMetros(valor: number, unidad: string): number | null {
  const v = positivo(valor);
  if (v == null) return null;
  if (unidad === "pies") return v * M_POR_PIE;
  if (unidad === "m") return v;
  if (unidad === "cm") return v / 100;
  if (unidad === "pulg") return (v * CM_POR_PULGADA) / 100;
  return null;
}

/** Ancho o espesor a centímetros. */
export function aCm(valor: number, unidad: string): number | null {
  const v = positivo(valor);
  if (v == null) return null;
  if (unidad === "pulg") return v * CM_POR_PULGADA;
  if (unidad === "cm") return v;
  if (unidad === "m") return v * 100;
  if (unidad === "pies") return v * M_POR_PIE * 100;
  return null;
}

/** El Ø que limita: el MENOR de las dos puntas; sin puntas, el Ø declarado. */
export function diametroUtilCm(t: TrozaMedida): number | null {
  const puntas = [positivo(t.d1Cm), positivo(t.d2Cm)].filter((d): d is number => d != null);
  if (puntas.length > 0) return Math.min(...puntas);
  return positivo(t.diametroCm);
}

export function respaldoDe(trozas: readonly TrozaMedida[]): RespaldoTrozas {
  let n = 0;
  let largoMaxM: number | null = null;
  let diametroMaxCm: number | null = null;
  for (const t of trozas) {
    const l = positivo(t.largoM);
    const d = diametroUtilCm(t);
    if (l == null && d == null) continue;
    n++;
    if (l != null) largoMaxM = Math.max(largoMaxM ?? 0, l);
    if (d != null) diametroMaxCm = Math.max(diametroMaxCm ?? 0, d);
  }
  return { trozas: n, largoMaxM, diametroMaxCm };
}

const fmt = (v: number, dec: number) => v.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtNat = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const unidadCorta = (u: string) => (u === "pulg" ? "″" : u === "pies" ? " pies" : ` ${u}`);
const nPiezas = (n: number) => `${fmtNat(n)} ${n === 1 ? "pieza" : "piezas"}`;

/** Lo que pide una pieza, ya en m y cm. */
interface Pide {
  largoM: number | null;
  ladoCm: number;
  diagonalCm: number;
  /** Con la holgura descontada: lo mínimo que tiene que medir la troza. */
  minL: number | null;
  minD: number | null;
}

function pideDe(p: PiezaMedida): Pide | null {
  const largoM = aMetros(p.largo, p.uLargo);
  const anchoCm = aCm(p.ancho, p.uAncho);
  const espesorCm = aCm(p.espesor, p.uEspesor);
  if (largoM == null && anchoCm == null && espesorCm == null) return null;
  const ladoCm = Math.max(anchoCm ?? 0, espesorCm ?? 0);
  const diagonalCm = Math.hypot(anchoCm ?? 0, espesorCm ?? 0);
  return {
    largoM,
    ladoCm,
    diagonalCm,
    minL: largoM != null ? largoM - TOLERANCIA_LARGO_M : null,
    minD: diagonalCm > 0 ? diagonalCm - TOLERANCIA_DIAMETRO_CM : null,
  };
}

function textoLargo(p: PiezaMedida, largoM: number): string {
  return `${fmtNat(p.largo)}${unidadCorta(p.uLargo)}${p.uLargo === "m" ? "" : ` (${fmt(largoM, 2)} m)`}`;
}

/** «2×12″ (31 cm de diagonal)»: la sección y el Ø que pide. */
function textoSeccion(p: PiezaMedida, diagonalCm: number): string {
  const e = positivo(p.espesor);
  const a = positivo(p.ancho);
  const sec =
    e != null && a != null
      ? p.uEspesor === p.uAncho
        ? `${fmtNat(e)}×${fmtNat(a)}${unidadCorta(p.uAncho)}`
        : `${fmtNat(e)}${unidadCorta(p.uEspesor)} × ${fmtNat(a)}${unidadCorta(p.uAncho)}`
      : `${fmtNat(a ?? e ?? 0)}${unidadCorta(a != null ? p.uAncho : p.uEspesor)}`;
  return `${sec} (pide ${fmt(diagonalCm, 1)} cm de Ø)`;
}

/** ¿Esta troza sola da la pieza? Una medida que la troza no trae no la descarta. */
function trozaDa(t: TrozaMedida, minL: number | null, minD: number | null): boolean {
  const l = positivo(t.largoM);
  const d = diametroUtilCm(t);
  if (l == null && d == null) return false;
  return (minL == null || l == null || l >= minL) && (minD == null || d == null || d >= minD);
}

/**
 * Revisa UNA medida contra las trozas del bloque. `null` = cuadra (o no hay
 * con qué compararla). `ref` es como se nombra al bloque en el texto.
 */
export function revisarPieza(p: PiezaMedida, trozas: readonly TrozaMedida[], ref: string): AvisoMedida | null {
  const pide = pideDe(p);
  if (!pide) return null;
  const r = respaldoDe(trozas);
  if (r.trozas === 0) return null;
  const { largoM, ladoCm, diagonalCm, minL, minD } = pide;

  const faltaLargo = minL != null && r.largoMaxM != null && r.largoMaxM < minL;
  const faltaDiam = minD != null && r.diametroMaxCm != null && r.diametroMaxCm < minD;
  const piezaLargo = largoM != null ? textoLargo(p, largoM) : "";
  const piezaSec = textoSeccion(p, diagonalCm);

  const motivos: MotivoMedida[] = [];
  let texto = "";
  if (faltaLargo && faltaDiam) {
    motivos.push("largo", "diametro");
    texto = `${nPiezas(p.piezas)} de ${piezaLargo} y ${piezaSec}: la troza más larga de ${ref} mide ${fmt(r.largoMaxM!, 2)} m y la más gruesa ${fmt(r.diametroMaxCm!, 0)} cm de Ø`;
  } else if (faltaLargo) {
    motivos.push("largo");
    texto = `${nPiezas(p.piezas)} de ${piezaLargo} y la troza más larga de ${ref} mide ${fmt(r.largoMaxM!, 2)} m`;
  } else if (faltaDiam) {
    motivos.push("diametro");
    texto = `${nPiezas(p.piezas)} de ${piezaSec} y la troza más gruesa de ${ref} mide ${fmt(r.diametroMaxCm!, 0)} cm de Ø en la punta`;
  } else if (minL != null && minD != null) {
    const completas = trozas
      .map((t) => ({ l: positivo(t.largoM), d: diametroUtilCm(t) }))
      .filter((t): t is { l: number; d: number } => t.l != null && t.d != null);
    if (completas.length > 0 && !completas.some((t) => t.l >= minL && t.d >= minD)) {
      const largas = completas.filter((t) => t.l >= minL);
      const dMax = largas.length > 0 ? Math.max(...largas.map((t) => t.d)) : null;
      motivos.push("misma-troza");
      texto =
        dMax != null
          ? `${nPiezas(p.piezas)} de ${piezaLargo} y ${piezaSec}: las trozas de ${ref} que llegan a ese largo no pasan de ${fmt(dMax, 0)} cm de Ø`
          : `${nPiezas(p.piezas)} de ${piezaLargo} y ${piezaSec}: ninguna troza de ${ref} es tan larga y tan gruesa a la vez`;
    }
  }
  if (motivos.length === 0) return null;
  return { medida: p.medida, piezas: p.piezas, largoM: largoM ?? 0, ladoCm, diagonalCm, motivos, texto };
}

export type Elegibilidad = { cabe: true; comprobado: boolean } | { cabe: false; aviso: AvisoMedida };

/**
 * La regla única: ¿la medida puede salir de estas trozas? `comprobado` = había
 * trozas con medidas para juzgarla (sin ellas cabe, pero «sin comprobar»).
 */
export function elegibilidad(p: PiezaMedida, trozas: readonly TrozaMedida[], ref: string): Elegibilidad {
  const aviso = revisarPieza(p, trozas, ref);
  if (aviso) return { cabe: false, aviso };
  return { cabe: true, comprobado: pideDe(p) != null && respaldoDe(trozas).trozas > 0 };
}

/**
 * Lo que le sobra a la troza más justa que da la pieza (en m de largo; si la
 * pieza no dice largo, el Ø sobrante en m). Menor = el bloque que mejor la
 * aprovecha: las piezas exigentes van primero ahí. Ninguna troza la da = ∞.
 */
export function holguraM(p: PiezaMedida, trozas: readonly TrozaMedida[]): number {
  const pide = pideDe(p);
  if (!pide) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const t of trozas) {
    if (!trozaDa(t, pide.minL, pide.minD)) continue;
    const l = positivo(t.largoM);
    const d = diametroUtilCm(t);
    const h =
      pide.largoM != null && l != null
        ? l - pide.largoM
        : pide.diagonalCm > 0 && d != null
          ? (d - pide.diagonalCm) / 100
          : Number.POSITIVE_INFINITY;
    if (h < min) min = h;
  }
  return min;
}

/** Smalian (m³): la media de las secciones de las puntas × el largo. */
export function volumenTrozaM3(t: TrozaMedida): number | null {
  const v = positivo(t.volumenM3);
  if (v != null) return v;
  const l = positivo(t.largoM);
  if (l == null) return null;
  const puntas = [positivo(t.d1Cm), positivo(t.d2Cm)].filter((d): d is number => d != null);
  const ds = puntas.length > 0 ? puntas : [positivo(t.diametroCm)].filter((d): d is number => d != null);
  if (ds.length === 0) return null;
  const area = ds.reduce((s, d) => s + (Math.PI / 4) * (d / 100) ** 2, 0) / ds.length;
  return area * l;
}

/**
 * Hasta cuánto de la capacidad del bloque (m³ aserrados) puede ir en piezas de
 * esta medida: la parte de SUS trozas que la dan (por volumen; si las trozas no
 * traen volumen ni medidas para calcularlo, por cantidad). Si ninguna la da, 0.
 */
export function subcapacidadM3(p: PiezaMedida, trozas: readonly TrozaMedida[], capacidadM3: number): number {
  if (!(capacidadM3 > 0)) return 0;
  const pide = pideDe(p);
  const conMedida = trozas.filter((t) => positivo(t.largoM) != null || diametroUtilCm(t) != null);
  if (!pide || conMedida.length === 0) return capacidadM3;
  const dan = conMedida.filter((t) => trozaDa(t, pide.minL, pide.minD));
  if (dan.length === 0) return 0;
  const vol = (ts: readonly TrozaMedida[]) => ts.reduce((s, t) => s + (volumenTrozaM3(t) ?? 0), 0);
  const total = vol(conMedida);
  const frac = total > 0 ? vol(dan) / total : dan.length / conMedida.length;
  return capacidadM3 * Math.min(1, frac);
}

/**
 * El porqué de una medida que NINGÚN bloque puede dar, para «Falta por
 * distribuir»: «ninguna troza de Tornillo alcanza 32 pies: la más larga mide
 * 9,75 m». `trozas` = las de todos los bloques con medidas de la especie.
 */
export function motivoSinTroza(
  p: PiezaMedida,
  trozas: readonly TrozaMedida[],
  especie: string,
): { motivos: MotivoMedida[]; texto: string } {
  const pide = pideDe(p);
  const quien = `ninguna troza${especie.trim() ? ` de ${especie.trim()}` : ""}`;
  if (!pide) return { motivos: [], texto: `${quien} da esa medida` };
  const r = respaldoDe(trozas);
  const piezaLargo = pide.largoM != null ? textoLargo(p, pide.largoM) : "";
  const piezaSec = textoSeccion(p, pide.diagonalCm);
  const faltaLargo = pide.minL != null && r.largoMaxM != null && r.largoMaxM < pide.minL;
  const faltaDiam = pide.minD != null && r.diametroMaxCm != null && r.diametroMaxCm < pide.minD;
  if (faltaLargo && faltaDiam)
    return {
      motivos: ["largo", "diametro"],
      texto: `${quien} alcanza ${piezaLargo} ni da ${piezaSec}: la más larga mide ${fmt(r.largoMaxM!, 2)} m y la más gruesa ${fmt(r.diametroMaxCm!, 0)} cm de Ø`,
    };
  if (faltaLargo) return { motivos: ["largo"], texto: `${quien} alcanza ${piezaLargo}: la más larga mide ${fmt(r.largoMaxM!, 2)} m` };
  if (faltaDiam)
    return { motivos: ["diametro"], texto: `${quien} da ${piezaSec}: la más gruesa mide ${fmt(r.diametroMaxCm!, 0)} cm de Ø en la punta` };
  return { motivos: ["misma-troza"], texto: `${quien} es a la vez tan larga (${piezaLargo || "ese largo"}) y tan gruesa (${piezaSec})` };
}
