/**
 * loth-despacho-medidas — las medidas de una troza despachada, leídas de SU
 * línea de Trozado (Brandon 08-10: «D1, D2, Largo y m³ en despacho»).
 *
 * La línea de Despacho de trozas sólo guarda el código y la GTF (medido: 0 de
 * 22 en Blas con medidas, 22 de 22 con su trozado). La medida de la troza es
 * la del trozado: se lee de ahí, no se copia — una corrección del trozado se ve
 * en el despacho sin tocarlo.
 *
 * El código de troza se puede repetir en OTRO permiso: se busca en el mismo
 * plan; si no, en el trozado sin plan (líneas viejas); y si el despacho no
 * tiene plan, sólo cuando todas las candidatas son del mismo plan. Antes que
 * adivinar entre dos permisos, «—».
 *
 * PURO y client-safe: lo usan la API (lo pega en cada línea y suma el m³ de
 * los indicadores) y la tabla (columnas, filtros, orden y pie).
 */

import type { LothEntryDTO, TrozadoDelDespacho } from "./loth-constants";

type Decimalish = string | number | { toString(): string } | null;

/** Una línea de trozado tal como la trae la base (Decimals sin convertir). */
export interface TrozadoCandidato {
  id: string;
  planId: string | null;
  trozaCode: string | null;
  lineNo: number;
  status: string;
  createdAt: Date | string;
  treeCode: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
  cites: boolean;
  diamMayorM: Decimalish;
  diamMenorM: Decimalish;
  lengthM: Decimalish;
  volumeM3: Decimalish;
}

const dec = (v: Decimalish): string | null => (v == null ? null : String(v));
const ms = (v: Date | string) => (v instanceof Date ? v.getTime() : Date.parse(v) || 0);

/**
 * La línea de trozado de la troza de un despacho, o `null` si no hay una sola
 * respuesta segura. Entre varias del mismo plan gana la vigente y, entre
 * vigentes, la más nueva (la que corrige a la otra).
 */
export function elegirTrozado(
  despacho: { planId?: string | null; trozaCode: string | null },
  candidatos: readonly TrozadoCandidato[],
): TrozadoCandidato | null {
  const codigo = despacho.trozaCode?.trim();
  if (!codigo) return null;
  const mismos = candidatos.filter((c) => c.trozaCode?.trim() === codigo);
  if (mismos.length === 0) return null;
  const plan = despacho.planId ?? null;
  let pool = mismos.filter((c) => (c.planId ?? null) === plan);
  if (pool.length === 0 && plan) pool = mismos.filter((c) => c.planId == null);
  if (pool.length === 0 && !plan && new Set(mismos.map((c) => c.planId)).size === 1) pool = mismos;
  if (pool.length === 0) return null;
  return [...pool].sort(
    (a, b) =>
      Number(b.status === "registrado") - Number(a.status === "registrado") ||
      ms(b.createdAt) - ms(a.createdAt) ||
      b.lineNo - a.lineNo,
  )[0];
}

/** De la fila de la base a lo que viaja en el JSON (whitelist). */
export function trozadoDelDespacho(c: TrozadoCandidato): TrozadoDelDespacho {
  return {
    lineaId: c.id,
    lineNo: c.lineNo,
    treeCode: c.treeCode,
    speciesCommon: c.speciesCommon,
    speciesScientific: c.speciesScientific,
    cites: c.cites,
    diamMayorM: dec(c.diamMayorM),
    diamMenorM: dec(c.diamMenorM),
    lengthM: dec(c.lengthM),
    volumeM3: dec(c.volumeM3),
    anulada: c.status !== "registrado",
  };
}

/** Los códigos de troza de los despachos de una lista (lo que hay que pedirle a la base). */
export function codigosDespachados(entries: readonly { section: string; trozaCode: string | null }[]): string[] {
  return [
    ...new Set(
      entries
        .filter((e) => e.section === "despacho_troza")
        .map((e) => e.trozaCode?.trim())
        .filter((c): c is string => !!c),
    ),
  ];
}

/** Cada despacho con su `trozado`; las demás líneas pasan tal cual. */
export function conTrozado<T extends { section: string; planId?: string | null; trozaCode: string | null }>(
  entries: readonly T[],
  candidatos: readonly TrozadoCandidato[],
): (T & { trozado?: TrozadoDelDespacho | null })[] {
  return entries.map((e) => {
    if (e.section !== "despacho_troza") return e;
    const t = elegirTrozado(e, candidatos);
    return { ...e, trozado: t ? trozadoDelDespacho(t) : null };
  });
}

/** m³ de los despachos según su trozado (4 decimales, como el libro). Sin trozado, no suma. */
export function m3DeDespachos(
  despachos: readonly { planId?: string | null; trozaCode: string | null }[],
  candidatos: readonly TrozadoCandidato[],
): number {
  let total = 0;
  for (const d of despachos) {
    const t = elegirTrozado(d, candidatos);
    total += t?.volumeM3 == null ? 0 : Number(String(t.volumeM3)) || 0;
  }
  return Math.round(total * 10000) / 10000;
}

// ── Lectura en la tabla ──────────────────────────────────────────────────────

type Medible = Pick<
  LothEntryDTO,
  "speciesCommon" | "speciesScientific" | "cites" | "treeCode" | "diamMayorM" | "diamMenorM" | "lengthM" | "volumeM3" | "trozado"
>;

export interface MedidasDeLinea {
  especie: string | null;
  cientifico: string | null;
  cites: boolean;
  /** El árbol de origen. */
  arbol: string | null;
  d1: string | null;
  d2: string | null;
  largo: string | null;
  m3: string | null;
  /** Las medidas salieron del trozado (despacho), no de la línea. */
  delTrozado: boolean;
}

/**
 * Lo que se lee de una línea: lo suyo y, si no lo tiene, lo de su trozado.
 * En las secciones que miden (tala, trozado) `trozado` no viene: es la línea.
 */
export function medidasDeLinea(e: Medible): MedidasDeLinea {
  const t = e.trozado ?? null;
  return {
    especie: e.speciesCommon?.trim() || t?.speciesCommon?.trim() || null,
    cientifico: e.speciesScientific?.trim() || t?.speciesScientific?.trim() || null,
    cites: e.cites || (t?.cites ?? false),
    arbol: e.treeCode?.trim() || t?.treeCode?.trim() || null,
    d1: e.diamMayorM ?? t?.diamMayorM ?? null,
    d2: e.diamMenorM ?? t?.diamMenorM ?? null,
    largo: e.lengthM ?? t?.lengthM ?? null,
    m3: e.volumeM3 ?? t?.volumeM3 ?? null,
    delTrozado: !!t && e.volumeM3 == null,
  };
}

/** El volumen que cuenta una línea (el suyo o el de su trozado). */
export const volumenDeLinea = (e: Pick<LothEntryDTO, "volumeM3" | "trozado">): string | null =>
  e.volumeM3 ?? e.trozado?.volumeM3 ?? null;

/** La especie que se lee de una línea (la suya o la de su trozado). */
export const especieDeLinea = (e: Pick<LothEntryDTO, "speciesCommon" | "trozado">): string | null =>
  e.speciesCommon?.trim() || e.trozado?.speciesCommon?.trim() || null;

/**
 * La troza despachada como si fuera su línea de trozado: para imprimir su
 * etiqueta (código, especie, medidas, árbol). No se guarda: sólo se imprime.
 */
export function comoLineaDeTrozado(e: LothEntryDTO): LothEntryDTO {
  const m = medidasDeLinea(e);
  return {
    ...e,
    section: "trozado",
    treeCode: m.arbol,
    speciesCommon: m.especie,
    speciesScientific: m.cientifico,
    cites: m.cites,
    diamMayorM: m.d1,
    diamMenorM: m.d2,
    lengthM: m.largo,
    volumeM3: m.m3,
  };
}
