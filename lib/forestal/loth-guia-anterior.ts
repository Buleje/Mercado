/**
 * loth-guia-anterior — la guía nueva del Libro TH arranca con lo de la ÚLTIMA
 * guía del MISMO permiso (Brandon 09-10, FOR-2).
 *
 * En Blas cada dato ya quedó escrito de dos maneras: «CCNN SAN LUIS DE
 * CHINCHIGUANI» y «COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI» son la misma
 * comunidad; «Constitución, Oxapampa, Pasco» y «CONSTITUCION, OXAPAMPA,
 * PASCO», el mismo origen. Copiar lo de la guía anterior del permiso evita la
 * tercera versión. Sólo se llena lo vacío y todo queda editable.
 *
 * Puro (client-safe): lo usan «Anotar una guía» (`LothGtfForm`) y «Despachar
 * con guía» (`use-despacho-guia-loth`).
 */

import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";

/** Lo que la guía corta necesita de una guía anterior (forma de `Gtf` de la lista). */
export interface GuiaCortaPrevia {
  gtfNumber: string;
  planId?: string | null;
  status: string;
  deletedAt?: string | null;
  titularName: string | null;
  origen: string | null;
  destino: string | null;
}

export interface ParteCopiable {
  titularName: string;
  origen: string;
  destino: string;
}

const con = (v: string | null | undefined) => (v ?? "").trim();

/**
 * La última guía viva del permiso que dice origen o destino (si ninguna, la
 * última que dice el titular).
 * `guias` llega como la da `ForestGtfDB.list`: la más nueva primero (por
 * creación; la fecha de la guía no sirve, en Blas hay GTF con el año mal).
 * Sin permiso no se adivina: `null`.
 */
export function ultimaGuiaDelPermiso<G extends GuiaCortaPrevia>(guias: readonly G[], planId: string | null | undefined): G | null {
  if (!planId) return null;
  const vivas = guias.filter((g) => g.planId === planId && g.status !== "anulada" && !g.deletedAt);
  /* El titular casi siempre sale del plan: manda la que dice origen o destino. */
  return vivas.find((g) => con(g.origen) || con(g.destino)) ?? vivas.find((g) => con(g.titularName)) ?? null;
}

const ROTULO: Record<keyof ParteCopiable, string> = { titularName: "titular", origen: "origen", destino: "destino" };

/**
 * Qué casilleros llenar con la guía anterior: sólo los vacíos. `copiados` =
 * los que quedan diciendo lo de la guía anterior (vacíos o ya iguales): así
 * llamarla dos veces —StrictMode, el plan que llega tarde— da la misma línea.
 */
export function copiarDeGuiaAnterior(actual: ParteCopiable, previa: GuiaCortaPrevia): { cambios: Partial<ParteCopiable>; copiados: string[] } {
  const cambios: Partial<ParteCopiable> = {};
  const copiados: string[] = [];
  for (const k of ["titularName", "origen", "destino"] as const) {
    const v = con(previa[k]);
    if (!v) continue;
    const hoy = con(actual[k]);
    if (!hoy) cambios[k] = v;
    if (!hoy || hoy === v) copiados.push(ROTULO[k]);
  }
  return { cambios, copiados };
}

/** «titular, origen y destino». */
export function listaEnFrase(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

// ── «Despachar con guía»: la guía completa (casilleros SERFOR) ─────────────

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Qué trajo de verdad la guía anterior (revisión 09-10): se compara la guía
 * rellenada SIN la anterior (`antes`) contra la rellenada CON ella
 * (`despues`). Así no se cita lo que pone otra regla (transporte privado = el
 * titular) ni lo que la anterior no tenía: sin transporte, no dice «transporte».
 */
export function loCopiadoDelDespacho(antes: GtfDatos, despues: GtfDatos): string[] {
  const a = antes.traslado;
  const d = despues.traslado;
  const partes: [string, boolean][] = [
    ["destinatario", !igual(antes.destinatario, despues.destinatario)],
    ["transporte", !igual(antes.transportista, despues.transportista) || !igual(antes.vehiculo, despues.vehiculo)],
    ["comprobante", !igual(antes.comprobante, despues.comprobante)],
    ["partida", a.puntoPartida !== d.puntoPartida || !igual(a.partida, d.partida)],
    ["llegada", a.puntoLlegada !== d.puntoLlegada || !igual(a.llegada, d.llegada)],
  ];
  return partes.filter(([, cambio]) => cambio).map(([rotulo]) => rotulo);
}

export interface PreviaDelDespacho<D> {
  datos: D;
  gtfNumber: string | null;
  /** `false`: el permiso no tiene guías todavía y se tomó la última del negocio. */
  delPermiso: boolean;
}

/**
 * La guía de la que hereda «Despachar con guía»: la última del MISMO plan;
 * si el plan todavía no tiene ninguna, la última del negocio (lo de antes),
 * avisando que es de otro permiso.
 */
export function guiaAnteriorDelDespacho<D>(
  f: { porPlan?: Record<string, { gtfNumber: string; datos: D }> | null; general: D | null; generalNumero?: string | null },
  planId: string | null | undefined,
): PreviaDelDespacho<D> | null {
  const propia = planId ? f.porPlan?.[planId] : undefined;
  if (propia) return { datos: propia.datos, gtfNumber: propia.gtfNumber, delPermiso: true };
  if (f.general) return { datos: f.general, gtfNumber: f.generalNumero ?? null, delPermiso: false };
  return null;
}
