/**
 * ¿Cuadran las medidas? — la pieza aserrada contra la troza que la respalda
 * (Brandon, 2026-10-19: «si en piezas registradas hay de largo 20 pies, en la
 * guía tiene que haber por lo mínimo 6 metros a más; en caso de haberlo, poner
 * esa pieza como advertencia o que no cuadra porque la troza no hay de esas
 * medidas; también aplica eso en diámetros»).
 *
 * Es una ADVERTENCIA, nunca un bloqueo: el reparto asigna volumen, no corta
 * tablas, y una troza mal medida en la guía no puede frenar el papel. Lo que
 * dice es «esta pieza no pudo salir de ninguna troza de ese bloque».
 *
 * Reglas (todas con su tolerancia en la UNIDAD DEL NEGOCIO, no en el epsilon):
 *  · LARGO: el largo de la pieza (pies → m) ≤ la troza más larga + 15 cm.
 *  · DIÁMETRO: el lado mayor de la pieza (ancho o espesor, pulgadas → cm) ≤ el
 *    Ø de la troza más gruesa + 1 cm. El Ø de una troza es el MENOR de sus dos
 *    puntas (D1/D2): la punta delgada es la que limita lo que se puede sacar.
 *  · LA MISMA TROZA: si hay trozas largas y trozas gruesas pero ninguna es las
 *    dos cosas a la vez, la pieza tampoco pudo salir.
 *
 * Puro: sin React, sin red, sin localStorage.
 */

import type { BloqueRolliza, Distribucion } from "./cubicacion-reparto";
import { claveEspecie, esAserradaDirecta } from "./cubicacion-reparto";
import { CM_POR_PULGADA, M_POR_PIE } from "./escuadria-del-paquete";

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

export interface AvisoMedida {
  medida: string;
  piezas: number;
  largoM: number;
  ladoCm: number;
  motivos: MotivoMedida[];
  texto: string;
}

export interface RespaldoTrozas {
  /** Trozas con al menos una medida útil (largo o Ø). */
  trozas: number;
  largoMaxM: number | null;
  diametroMaxCm: number | null;
}

export type EstadoCuadreMedidas = "cuadra" | "advertencia" | "sin-medidas" | "sin-piezas";

export interface CuadreBloqueMedidas {
  bloqueId: string;
  etiqueta: string;
  especie: string;
  permiso: string | null;
  /** De dónde salieron las trozas comparadas («sus 12 trozas», «el patio de PLT-…»). */
  fuente: string | null;
  estado: EstadoCuadreMedidas;
  respaldo: RespaldoTrozas;
  avisos: AvisoMedida[];
  piezas: number;
  piezasConAviso: number;
}

export interface CuadreMedidas {
  bloques: CuadreBloqueMedidas[];
  /** Líneas (medidas) con advertencia: el número de la pestaña. */
  avisos: number;
  piezasConAviso: number;
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

/**
 * Revisa UNA medida contra las trozas del bloque. `null` = cuadra (o no hay
 * con qué compararla). `ref` es como se nombra al bloque en el texto.
 */
export function revisarPieza(p: PiezaMedida, trozas: readonly TrozaMedida[], ref: string): AvisoMedida | null {
  const largoM = aMetros(p.largo, p.uLargo);
  const anchoCm = aCm(p.ancho, p.uAncho);
  const espesorCm = aCm(p.espesor, p.uEspesor);
  if (largoM == null && anchoCm == null && espesorCm == null) return null;
  const ladoCm = Math.max(anchoCm ?? 0, espesorCm ?? 0);
  const esAncho = (anchoCm ?? 0) >= (espesorCm ?? 0);
  const r = respaldoDe(trozas);
  if (r.trozas === 0) return null;

  const pideL = largoM != null ? largoM - TOLERANCIA_LARGO_M : null;
  const pideD = ladoCm > 0 ? ladoCm - TOLERANCIA_DIAMETRO_CM : null;
  const faltaLargo = pideL != null && r.largoMaxM != null && r.largoMaxM < pideL;
  const faltaDiam = pideD != null && r.diametroMaxCm != null && r.diametroMaxCm < pideD;

  const piezaLargo = largoM != null ? `${fmtNat(p.largo)}${unidadCorta(p.uLargo)}${p.uLargo === "m" ? "" : ` (${fmt(largoM, 2)} m)`}` : "";
  const lado = esAncho ? p.ancho : p.espesor;
  const uLado = esAncho ? p.uAncho : p.uEspesor;
  const piezaLado = `${fmtNat(lado)}${unidadCorta(uLado)} de ${esAncho ? "ancho" : "espesor"}${uLado === "cm" ? "" : ` (${fmt(ladoCm, 1)} cm)`}`;

  const motivos: MotivoMedida[] = [];
  let texto = "";
  if (faltaLargo && faltaDiam) {
    motivos.push("largo", "diametro");
    texto = `${nPiezas(p.piezas)} de ${piezaLargo} y ${piezaLado}: la troza más larga de ${ref} mide ${fmt(r.largoMaxM!, 2)} m y la más gruesa ${fmt(r.diametroMaxCm!, 0)} cm de Ø`;
  } else if (faltaLargo) {
    motivos.push("largo");
    texto = `${nPiezas(p.piezas)} de ${piezaLargo} y la troza más larga de ${ref} mide ${fmt(r.largoMaxM!, 2)} m`;
  } else if (faltaDiam) {
    motivos.push("diametro");
    texto = `${nPiezas(p.piezas)} de ${piezaLado} y la troza más gruesa de ${ref} mide ${fmt(r.diametroMaxCm!, 0)} cm de Ø en la punta`;
  } else if (pideL != null && pideD != null) {
    /* Cada medida por separado alcanza: ¿alguna troza alcanza en las DOS? Sólo
       se juzga con trozas que traen las dos medidas. */
    const completas = trozas
      .map((t) => ({ l: positivo(t.largoM), d: diametroUtilCm(t) }))
      .filter((t): t is { l: number; d: number } => t.l != null && t.d != null);
    if (completas.length > 0 && !completas.some((t) => t.l >= pideL && t.d >= pideD)) {
      const largas = completas.filter((t) => t.l >= pideL);
      const dMax = largas.length > 0 ? Math.max(...largas.map((t) => t.d)) : null;
      motivos.push("misma-troza");
      texto =
        dMax != null
          ? `${nPiezas(p.piezas)} de ${piezaLargo} y ${piezaLado}: las trozas de ${ref} que llegan a ese largo no pasan de ${fmt(dMax, 0)} cm de Ø`
          : `${nPiezas(p.piezas)} de ${piezaLargo} y ${piezaLado}: ninguna troza de ${ref} es tan larga y tan gruesa a la vez`;
    }
  }
  if (motivos.length === 0) return null;
  return { medida: p.medida, piezas: p.piezas, largoM: largoM ?? 0, ladoCm, motivos, texto };
}

export interface EntradaCuadre {
  bloqueId: string;
  etiqueta: string;
  especie: string;
  permiso: string | null;
  fuente: string | null;
  trozas: readonly TrozaMedida[];
  piezas: readonly PiezaMedida[];
}

/** Una medida una sola vez (el reparto la puede repartir en dos grupos o días). */
function unirMedidas(piezas: readonly PiezaMedida[]): PiezaMedida[] {
  const m = new Map<string, PiezaMedida>();
  for (const p of piezas) {
    if (!(p.piezas > 0)) continue;
    const k = `${p.espesor}${p.uEspesor}|${p.ancho}${p.uAncho}|${p.largo}${p.uLargo}`;
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, piezas: prev.piezas + p.piezas } : { ...p });
  }
  return [...m.values()];
}

export function cuadrarBloque(e: EntradaCuadre): CuadreBloqueMedidas {
  const piezas = unirMedidas(e.piezas);
  const respaldo = respaldoDe(e.trozas);
  const totalPiezas = piezas.reduce((s, p) => s + p.piezas, 0);
  const base = { bloqueId: e.bloqueId, etiqueta: e.etiqueta, especie: e.especie, permiso: e.permiso, fuente: e.fuente, respaldo, piezas: totalPiezas };
  if (piezas.length === 0) return { ...base, estado: "sin-piezas", avisos: [], piezasConAviso: 0 };
  if (respaldo.trozas === 0) return { ...base, estado: "sin-medidas", avisos: [], piezasConAviso: 0 };
  const ref = e.permiso?.trim() || (e.etiqueta.trim() ? `«${e.etiqueta.trim()}»` : e.especie || "este bloque");
  const avisos = piezas
    .map((p) => revisarPieza(p, e.trozas, ref))
    .filter((a): a is AvisoMedida => a != null)
    .sort((a, b) => b.largoM - a.largoM || b.ladoCm - a.ladoCm);
  const piezasConAviso = avisos.reduce((s, a) => s + a.piezas, 0);
  return { ...base, estado: avisos.length > 0 ? "advertencia" : "cuadra", avisos, piezasConAviso };
}

// ── De qué trozas sale cada bloque ─────────────────────────────────────────────

/** Una troza que sabe de dónde viene (patio o lote del Libro). */
export interface TrozaConOrigen extends TrozaMedida {
  id: string;
  especieComun?: string | null;
  permiso?: string | null;
}

export interface FuentesDeTrozas {
  /** Patio + trozas de los lotes del Libro (por id). */
  libro: readonly TrozaConOrigen[];
  /** Trozas de cada lote del Libro. */
  lotes: ReadonlyMap<string, { code: string; trozas: readonly TrozaConOrigen[] }>;
  /** El cubicador de trozas del navegador (Smalian: Ø en cm, largo en m). */
  cubicador: readonly { especie?: string; d1: number; d2: number; largo: number }[];
}

const alfanum = (s: string | null | undefined) => (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

/** Mismo permiso escrito distinto, o uno es la cola del otro («PLT-2021-017» ⊂ «19-SEC/REG-PLT-2021-017»). */
export function coincidePermiso(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = alfanum(a);
  const y = alfanum(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x];
  return corto.length >= 8 && largo.endsWith(corto);
}

const mismaEspecie = (a: string | null | undefined, b: string | null | undefined) => {
  const k = claveEspecie(a);
  return k === "" || claveEspecie(b) === k;
};

/**
 * Las trozas que respaldan un bloque, de la más exacta a la más amplia:
 * sus trozas elegidas → las de su lote → las del cubicador de trozas (si de ahí
 * vino) → las del patio y lotes de SU permiso y especie. Ninguna = `[]`.
 */
export function trozasDelBloque(b: BloqueRolliza, f: FuentesDeTrozas): { trozas: TrozaMedida[]; fuente: string | null } {
  const ids = b.trozaIds ?? [];
  if (ids.length > 0) {
    const set = new Set(ids);
    const t = f.libro.filter((x) => set.has(x.id));
    if (t.length > 0) return { trozas: t, fuente: `sus ${t.length} ${t.length === 1 ? "troza" : "trozas"}` };
  }
  if (b.loteId) {
    const lote = f.lotes.get(b.loteId);
    if (lote && lote.trozas.length > 0) return { trozas: [...lote.trozas], fuente: `las trozas del lote ${lote.code}` };
  }
  if (b.origen === "trozas") {
    const t = f.cubicador
      .filter((x) => claveEspecie(x.especie) === claveEspecie(b.especie))
      .map((x) => ({ largoM: x.largo, d1Cm: x.d1, d2Cm: x.d2 }));
    if (t.length > 0) return { trozas: t, fuente: `el cubicador de trozas (${t.length})` };
  }
  if (b.permiso?.trim()) {
    const vistos = new Set<string>();
    const t = f.libro.filter((x) => {
      if (vistos.has(x.id) || !coincidePermiso(x.permiso, b.permiso) || !mismaEspecie(b.especie, x.especieComun)) return false;
      vistos.add(x.id);
      return true;
    });
    if (t.length > 0) return { trozas: t, fuente: `el Libro, ${t.length} ${t.length === 1 ? "troza" : "trozas"} de ese permiso` };
  }
  return { trozas: [], fuente: null };
}

/** Todo el reparto: un renglón por bloque de rolliza (la aserrada directa no trae troza). */
export function cuadrarMedidasDelReparto(dist: Distribucion, f: FuentesDeTrozas): CuadreMedidas {
  const bloques: CuadreBloqueMedidas[] = [];
  for (const e of dist.especies) {
    for (const bd of e.bloques) {
      const b = bd.bloque;
      if (esAserradaDirecta(b)) continue;
      const { trozas, fuente } = trozasDelBloque(b, f);
      bloques.push(
        cuadrarBloque({
          bloqueId: b.id,
          etiqueta: b.etiqueta ?? "",
          especie: b.especie || e.especie,
          permiso: b.permiso?.trim() || null,
          fuente,
          trozas,
          piezas: bd.asignado.flatMap((g) => g.medidas),
        }),
      );
    }
  }
  return {
    bloques,
    avisos: bloques.reduce((s, b) => s + b.avisos.length, 0),
    piezasConAviso: bloques.reduce((s, b) => s + b.piezasConAviso, 0),
  };
}
