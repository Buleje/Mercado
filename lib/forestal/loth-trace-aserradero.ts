/**
 * loth-trace-aserradero — «Por árbol» sigue la troza hasta el aserradero
 * (backlog L13, 08-10).
 *
 * Desde ADR-450 (29-09) la troza del Libro CTP guarda su línea de Trozado del
 * Libro TH (`lothTrozadoId`). Hasta hoy nadie leía ese enlace de vuelta: la
 * vista del árbol llegaba al despacho con GTF y ahí se cortaba. Acá se arma,
 * para cada árbol, qué pasó con sus trozas en la planta.
 *
 * Nada se deduce de nuevo:
 *   · el ESTADO de cada pieza es `estadoDeFicha` —la misma regla del patio y de
 *     la ficha de la troza—: una corrida o un despacho anulado no cuenta, la
 *     guía en bandeja es «por recepcionar», la madre retrozada no se cuenta
 *     (van sus pedazos, T1);
 *   · la fecha de llegada es la de la pieza; si no la tiene, la de su guía, y
 *     si tampoco, la del asiento —y `fuente` lo dice: un derivado nunca se
 *     presenta como el dato—;
 *   · los m³ son los de la GTF de cada pieza (el consumo por pieza usa ese),
 *     sumados por árbol: es una SUMA de sus trozas, y la pantalla lo rotula así.
 *
 * Una troza del Trozado sin pieza enlazada NO se busca por código: las
 * recibidas antes del 29-09 o ingresadas a mano no guardan el enlace, y
 * adivinarlas por un código que se repite entre permisos sería inventar. Lo
 * que sí se mira es SU despacho en el Libro TH (por `trozaCode`, no por el
 * árbol): sin despacho no salió; despachada antes del 29-09, «sin enlace»;
 * desde ese día, «por recibir en el CTP» (`TrozaSinPieza`).
 *
 * «Recibida» y «aserrada» de una troza del Trozado salen de `trozadoEnPlanta`:
 * la MISMA regla para «Por árbol» y para «Extracción».
 *
 * PURO y client-safe: lo usa el endpoint (`piezaDeFilaCtp`) y la vista.
 */

import type { TraceOperation } from "./loth-trace";
import { estadoDeFicha } from "./troza-ficha-recorrido";
import { ESTADO_META, ORDEN_ESTADOS, estaEnPatio, type EstadoTroza } from "./trozas-patio";

type Fecha = Date | string | null | undefined;

const diaDe = (v: Fecha): string | null => {
  if (!v) return null;
  const s = typeof v === "string" ? v : Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const numero = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** El día en que se fija el enlace troza ↔ árbol (ADR-450): lo de antes no lo guarda. */
export const DIA_DEL_ENLACE = "2026-09-29";

// ─── Lo que lee el endpoint ──────────────────────────────────────────────────

interface LineaDelLibroCtp {
  id: string;
  tenantId: string;
  lineNo: number;
  entryDate: Fecha;
  status: string;
  deletedAt: Fecha;
}

/** Una fila de `WoodEntriesDB.trozasDeTrozados` (Decimal y Date tal cual llegan de Prisma). */
export interface FilaCtpDeTrozado {
  id: string;
  lothTrozadoId: string | null;
  arbolCodigo: string | null;
  codificacion: string | null;
  codigoPlanta: string | null;
  especieComun: string | null;
  volumenM3: unknown;
  noRecepcionada: boolean;
  fechaRecepcion: Fecha;
  descarte: boolean;
  trozaOrigenId: string | null;
  _count: { retrozos: number };
  entry: {
    id: string;
    libroNro: number | null;
    gtfNumber: string;
    providerName: string;
    entryDate: Fecha;
    fechaRecepcion: Fecha;
    status: string;
    originCode: string | null;
  };
  loteAserrio: { code: string; status: string } | null;
  consumidaEn:
    | (LineaDelLibroCtp & { productType: string | null; presentacion: string | null; quantity: unknown; unit: string | null })
    | null;
  despachadaEn: (LineaDelLibroCtp & { gtfNumber: string | null }) | null;
}

/** De dónde sale el día de llegada: la pieza, su guía, o el asiento del ingreso (derivado). */
export type FuenteLlegada = "pieza" | "guia" | "asiento";

/** Una pieza del Libro CTP enlazada a una troza del Trozado, ya leída con las reglas del patio. */
export interface PiezaCtp {
  id: string;
  trozadoId: string;
  codigo: string | null;
  m3: number | null;
  estado: EstadoTroza;
  /** `null` = no bajó del camión (no llegó, o su guía sigue en la bandeja). */
  llegada: { dia: string | null; fuente: FuenteLlegada } | null;
  ingreso: { id: string; libroNro: number | null; gtf: string; proveedor: string };
  lote: string | null;
  /** Sólo una corrida VIVA (registrada, sin borrar, del mismo negocio). */
  corrida: { lineNo: number; dia: string | null; producto: string | null; cantidad: number | null; unidad: string | null } | null;
  /** Sólo un despacho VIVO: la troza salió entera sin aserrar. */
  despacho: { lineNo: number; dia: string | null; gtf: string | null } | null;
  /** Vino de partir otra pieza: hereda el enlace de su madre. */
  madreId: string | null;
  /** Cuántos pedazos salieron de ella (>0 = madre retrozada: no se cuenta). */
  pedazos: number;
}

const viva = (tenantId: string, l: LineaDelLibroCtp | null): boolean =>
  !!l && l.tenantId === tenantId && l.status === "registrado" && !l.deletedAt;

/** La fila de la base → la pieza, con `estadoDeFicha` (la regla del patio y de la ficha). */
export function piezaDeFilaCtp(tenantId: string, f: FilaCtpDeTrozado): PiezaCtp | null {
  if (!f.lothTrozadoId) return null;
  const corridaViva = viva(tenantId, f.consumidaEn);
  const despachoVivo = viva(tenantId, f.despachadaEn);
  const ficha: Parameters<typeof estadoDeFicha>[0] = {
    troza: {
      id: f.id,
      especieComun: f.especieComun,
      volumenM3: numero(f.volumenM3),
      fechaRecepcion: diaDe(f.fechaRecepcion),
      noRecepcionada: f.noRecepcionada,
      descarte: f.descarte,
      codificacion: f.codificacion,
      codigoPlanta: f.codigoPlanta,
    },
    ingreso: {
      gtfNumber: f.entry.gtfNumber,
      entryDate: diaDe(f.entry.entryDate) ?? "",
      fechaRecepcion: diaDe(f.entry.fechaRecepcion),
      status: f.entry.status,
      proveedor: f.entry.providerName,
      permiso: f.entry.originCode,
    },
    corrida: f.consumidaEn ? { id: f.consumidaEn.id, vigente: corridaViva } : null,
    despacho: f.despachadaEn ? { id: f.despachadaEn.id, vigente: despachoVivo } : null,
    retrozos: { length: f._count.retrozos },
    madre: f.trozaOrigenId ? { id: f.trozaOrigenId } : null,
    lote: f.loteAserrio ? { code: f.loteAserrio.code } : null,
  };
  const estado = estadoDeFicha(ficha);
  // El descarte manda sobre «no llegó» en el estado: si bajó del camión se mira sin él.
  const llego = estado === "descarte" ? estadoDeFicha({ ...ficha, troza: { ...ficha.troza, descarte: false } }) : estado;
  const sinLlegar = llego === "no_recepcionada" || llego === "por_recepcionar";
  const llegada: PiezaCtp["llegada"] = sinLlegar
    ? null
    : diaDe(f.fechaRecepcion)
      ? { dia: diaDe(f.fechaRecepcion), fuente: "pieza" }
      : diaDe(f.entry.fechaRecepcion)
        ? { dia: diaDe(f.entry.fechaRecepcion), fuente: "guia" }
        : { dia: diaDe(f.entry.entryDate), fuente: "asiento" };

  const c = corridaViva ? f.consumidaEn : null;
  const d = despachoVivo ? f.despachadaEn : null;
  return {
    id: f.id,
    trozadoId: f.lothTrozadoId,
    codigo: f.codificacion?.trim() || f.codigoPlanta?.trim() || null,
    m3: numero(f.volumenM3),
    estado,
    llegada,
    ingreso: { id: f.entry.id, libroNro: f.entry.libroNro, gtf: f.entry.gtfNumber, proveedor: f.entry.providerName },
    lote: f.loteAserrio?.code ?? null,
    corrida: c
      ? { lineNo: c.lineNo, dia: diaDe(c.entryDate), producto: c.productType?.trim() || c.presentacion?.trim() || null, cantidad: numero(c.quantity), unidad: c.unit }
      : null,
    despacho: d ? { lineNo: d.lineNo, dia: diaDe(d.entryDate), gtf: d.gtfNumber } : null,
    madreId: f.trozaOrigenId,
    pedazos: f._count.retrozos,
  };
}

/** Ids de Trozado por llamada al endpoint: 150 cuid ≈ 4 KB de URL. */
export const MAX_IDS_ASERRADERO = 150;
/** Piezas por llamada: un trozado rara vez pasa de 3 (madre + pedazos). */
export const TOPE_PIEZAS_ASERRADERO = 2000;

/** La respuesta de `GET /api/admin/forestal/loth/aserradero`. */
export interface RespuestaAserradero {
  /** `false` = el negocio no lleva el Libro CTP: no hay a dónde seguir la troza. */
  ctp: boolean;
  piezas: PiezaCtp[];
  /** Llegó al tope: hay más piezas de las que se leyeron. */
  truncado: boolean;
}

/** Las piezas por id de Trozado (la forma en que las pide la vista). */
export function piezasPorTrozado(piezas: readonly PiezaCtp[]): Map<string, PiezaCtp[]> {
  const out = new Map<string, PiezaCtp[]>();
  for (const p of piezas) {
    const xs = out.get(p.trozadoId) ?? [];
    xs.push(p);
    out.set(p.trozadoId, xs);
  }
  return out;
}

// ─── La regla única: qué es una troza del Trozado en la planta ──────────────

/** La pieza cuenta para su troza: la madre retrozada no (van sus pedazos, T1). */
const cuenta = (p: PiezaCtp): boolean => p.pedazos === 0;

/**
 * Bajó del camión y entra al cálculo: tiene día de llegada (ni «no llegó» ni
 * guía en la bandeja) y no está descartada («no entra a ningún cálculo»).
 */
export const piezaRecibida = (p: PiezaCtp): boolean => cuenta(p) && p.llegada !== null && p.estado !== "descarte";

/** Lo que el Libro CTP dice de UNA troza del Trozado. */
export interface TrozadoEnPlanta {
  trozadoId: string;
  /** Alguna de sus piezas que cuentan bajó del camión (`piezaRecibida`). */
  recibida: boolean;
  /** Alguna de sus piezas que cuentan entró a una corrida viva (los pedazos de una madre partida, no la madre). */
  aserrada: boolean;
  /** El primer día de llegada de las que bajaron (de la pieza; si no, su guía; si no, el asiento). */
  dia: string | null;
  fuente: FuenteLlegada | null;
  /** Suma de los m³ de GTF de las que bajaron; `null` = ninguna trae volumen. */
  m3Guia: number | null;
}

/**
 * La regla que leen «Por árbol» y «Extracción» para una troza del Trozado:
 * dos vistas que leen el mismo enlace no pueden decir cosas distintas del
 * mismo árbol (antes Extracción contaba recibida la guía en bandeja y el
 * descarte, y tomaba la primera pieza sin orden: la madre partida salía «no
 * aserrada»).
 */
export function trozadoEnPlanta(trozadoId: string, piezas: readonly PiezaCtp[]): TrozadoEnPlanta {
  const out: TrozadoEnPlanta = { trozadoId, recibida: false, aserrada: false, dia: null, fuente: null, m3Guia: null };
  for (const p of piezas) {
    if (!cuenta(p)) continue;
    if (p.estado === "consumida") out.aserrada = true;
    if (!piezaRecibida(p)) continue;
    out.recibida = true;
    if (p.m3 != null) out.m3Guia = (out.m3Guia ?? 0) + p.m3;
    if (p.llegada?.dia && (!out.dia || p.llegada.dia < out.dia)) {
      out.dia = p.llegada.dia;
      out.fuente = p.llegada.fuente;
    }
  }
  return out;
}

// ─── Una troza del Trozado sin pieza en el CTP ───────────────────────────────

/**
 * Lo que se sabe de una troza que ninguna pieza del CTP enlaza, por SU despacho
 * en el Libro TH: sin despacho no salió (o se usó en el bosque); despachada
 * antes del día del enlace, el CTP no podía guardarlo; desde ese día, está por
 * recibir (o fue a otro destino: el despacho no dice a quién).
 */
export type TrozaSinPieza = "sin_despacho" | "por_recibir" | "sin_enlace";

/** Por id de Trozado vigente, el día de su despacho (`null` = despachada sin día). Sin entrada = no se despachó. */
export function despachosDelTrozado(op: Pick<TraceOperation, "trozado" | "despachoTroza">): Map<string, string | null> {
  const porCodigo = new Map<string, string | null>();
  for (const l of op.despachoTroza) {
    const codigo = l.trozaCode?.trim();
    if (!codigo) continue;
    const dia = diaDe(l.entryDate);
    const antes = porCodigo.get(codigo);
    // Si salió más de una vez, manda la más nueva: es la que pudo ir al CTP con el enlace.
    porCodigo.set(codigo, antes === undefined ? dia : !dia ? antes : !antes || dia > antes ? dia : antes);
  }
  const out = new Map<string, string | null>();
  for (const t of op.trozado) {
    const codigo = t.trozaCode?.trim();
    if (t.status === "registrado" && codigo && porCodigo.has(codigo)) out.set(t.id, porCodigo.get(codigo) ?? null);
  }
  return out;
}

export function trozaSinPieza(despachada: boolean, dia: string | null | undefined): TrozaSinPieza {
  if (!despachada) return "sin_despacho";
  return dia && dia >= DIA_DEL_ENLACE ? "por_recibir" : "sin_enlace";
}

// ─── Lo que la vista dice de UN árbol ────────────────────────────────────────

export interface CorridaDelArbol {
  lineNo: number;
  dia: string | null;
  producto: string | null;
  piezas: number;
  /** Suma de los m³ (GTF) de SUS trozas que entraron a esa corrida: no es lo que la corrida rindió. */
  m3: number;
}

export interface DestinoArbol {
  /** Trozas del Trozado vigente del árbol. */
  trozadas: number;
  /** De ésas, cuántas tienen al menos una pieza en el Libro CTP. */
  enlazadas: number;
  /** Cada troza del Trozado por la regla única (`trozadoEnPlanta`). */
  planta: TrozadoEnPlanta[];
  /** Las que no tienen pieza, por su despacho en el Libro TH. */
  sinPieza: Record<TrozaSinPieza, number>;
  /** Por id de Trozado, las que no tienen pieza (la lista de la ventana). */
  sinPiezaPorTrozado: Record<string, TrozaSinPieza>;
  /** Las piezas que cuentan (sin la madre retrozada: van sus pedazos). */
  piezas: PiezaCtp[];
  porEstado: Partial<Record<EstadoTroza, number>>;
  /** Sumas de los m³ de GTF de cada pieza, por destino. */
  m3: { recibido: number; aserrado: number; enPatio: number; salioEntera: number };
  primeraLlegada: { dia: string; fuente: FuenteLlegada } | null;
  /** Los ingresos del CTP por los que entró (N° de libro + GTF), sin repetir. */
  ingresos: { id: string; libroNro: number | null; gtf: string }[];
  corridas: CorridaDelArbol[];
}

/**
 * Junta lo que el Libro CTP sabe de las trozas de UN árbol (su Trozado
 * vigente) y, de las que no tienen pieza, lo que dice su despacho del Libro TH.
 */
export function destinoDelArbol(
  op: Pick<TraceOperation, "trozado" | "despachoTroza">,
  porTrozado: ReadonlyMap<string, readonly PiezaCtp[]>,
): DestinoArbol {
  const ids = [...new Set(trozadoIdsDe(op))];
  const todas = ids.flatMap((id) => porTrozado.get(id) ?? []);
  const piezas = todas.filter(cuenta);
  const planta = ids.map((id) => trozadoEnPlanta(id, porTrozado.get(id) ?? []));
  const despachos = despachosDelTrozado(op);
  const sinPieza: Record<TrozaSinPieza, number> = { sin_despacho: 0, por_recibir: 0, sin_enlace: 0 };
  const sinPiezaPorTrozado: Record<string, TrozaSinPieza> = {};
  for (const id of ids) {
    if ((porTrozado.get(id)?.length ?? 0) > 0) continue;
    const s = trozaSinPieza(despachos.has(id), despachos.get(id));
    sinPieza[s] += 1;
    sinPiezaPorTrozado[id] = s;
  }
  const porEstado: Partial<Record<EstadoTroza, number>> = {};
  const m3 = { recibido: 0, aserrado: 0, enPatio: 0, salioEntera: 0 };
  let primera: DestinoArbol["primeraLlegada"] = null;
  const ingresos = new Map<string, DestinoArbol["ingresos"][number]>();
  const corridas = new Map<number, CorridaDelArbol>();

  for (const p of piezas) {
    porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1;
    const v = p.m3 ?? 0;
    if (p.estado === "consumida") m3.aserrado += v;
    if (estaEnPatio(p.estado)) m3.enPatio += v;
    if (p.estado === "despachada") m3.salioEntera += v;
  }
  // Lo recibido y su primer día, por la regla única (la misma de Extracción).
  for (const t of planta) {
    m3.recibido += t.m3Guia ?? 0;
    if (t.dia && t.fuente && (!primera || t.dia < primera.dia)) primera = { dia: t.dia, fuente: t.fuente };
  }
  // El ingreso y la corrida se cuentan con TODAS (una madre partida también entró por su guía).
  for (const p of todas) if (!ingresos.has(p.ingreso.id)) ingresos.set(p.ingreso.id, { id: p.ingreso.id, libroNro: p.ingreso.libroNro, gtf: p.ingreso.gtf });
  for (const p of piezas) {
    if (!p.corrida) continue;
    const c = corridas.get(p.corrida.lineNo) ?? { lineNo: p.corrida.lineNo, dia: p.corrida.dia, producto: p.corrida.producto, piezas: 0, m3: 0 };
    c.piezas += 1;
    c.m3 += p.m3 ?? 0;
    corridas.set(p.corrida.lineNo, c);
  }

  return {
    trozadas: ids.length,
    enlazadas: ids.filter((id) => (porTrozado.get(id)?.length ?? 0) > 0).length,
    planta,
    sinPieza,
    sinPiezaPorTrozado,
    piezas,
    porEstado,
    m3: { recibido: r3(m3.recibido), aserrado: r3(m3.aserrado), enPatio: r3(m3.enPatio), salioEntera: r3(m3.salioEntera) },
    primeraLlegada: primera,
    ingresos: [...ingresos.values()],
    corridas: [...corridas.values()]
      .map((c) => ({ ...c, m3: r3(c.m3) }))
      .sort((a, b) => (a.dia ?? "").localeCompare(b.dia ?? "") || a.lineNo - b.lineNo),
  };
}

/** Los ids del Trozado VIGENTE de un árbol (lo que se le pregunta al CTP). */
export const trozadoIdsDe = (op: Pick<TraceOperation, "trozado"> | null | undefined): string[] =>
  (op?.trozado ?? []).filter((t) => t.status === "registrado").map((t) => t.id);

// ─── Palabras ────────────────────────────────────────────────────────────────

const CORTO: Record<EstadoTroza, [string, string]> = {
  consumida: ["aserrada", "aserradas"],
  libre: ["en patio", "en patio"],
  apartada: ["apartada en lote", "apartadas en lote"],
  por_recepcionar: ["por recepcionar", "por recepcionar"],
  no_recepcionada: ["no llegó", "no llegaron"],
  despachada: ["salió entera", "salieron enteras"],
  retrozada: ["partida", "partidas"],
  descarte: ["descartada", "descartadas"],
};

/** «2 aserradas · 1 en patio», en el orden del patio (lo accionable primero, salvo lo aserrado, que es la respuesta). */
export function fraseDeEstados(porEstado: Partial<Record<EstadoTroza, number>>): string {
  const orden: EstadoTroza[] = ["consumida", ...ORDEN_ESTADOS.filter((e) => e !== "consumida")];
  return orden
    .filter((e) => (porEstado[e] ?? 0) > 0)
    .map((e) => {
      const n = porEstado[e] ?? 0;
      return `${n} ${CORTO[e][n === 1 ? 0 : 1]}`;
    })
    .join(" · ");
}

/** El rótulo largo de un estado (el mismo chip del patio). */
export const etiquetaDeEstado = (e: EstadoTroza): string => ESTADO_META[e].label;

/** Lo que dice el día de llegada cuando no es el de la pieza. */
export const NOTA_FUENTE: Record<FuenteLlegada, string | null> = {
  pieza: null,
  guia: "día de recepción de su guía",
  asiento: "día del asiento del ingreso (la guía no guarda su recepción)",
};

/** El ⓘ de un árbol trozado cuyas trozas ninguna pieza del CTP enlaza. */
export const SIN_ENLACE =
  "Ninguna troza del Libro CTP guarda el enlace a este árbol. Desde el 29-09 lo guarda la que se recibe contando su guía del Libro TH; " +
  "las recibidas antes o ingresadas a mano no lo tienen. No se busca por código: se repite entre permisos.";

/** El ⓘ de una troza despachada desde el día del enlace que ninguna pieza del CTP tiene todavía. */
export const POR_RECIBIR =
  "Salió del bosque desde el 29-09 y ninguna pieza del Libro CTP la tiene todavía: aparece cuando el CTP recibe su guía " +
  "contando la del Libro TH. Si la troza fue a otro destino, no llegará: el despacho no dice a quién se vendió.";

/** El `title` del «—» de una troza sin despacho. */
export const SIN_DESPACHO = "Sin despacho en el Libro TH: todavía no salió del bosque hacia el CTP.";

/** El orden en que se dicen: lo que se espera primero, lo que no salió al final. */
const ORDEN_SIN_PIEZA: TrozaSinPieza[] = ["por_recibir", "sin_enlace", "sin_despacho"];
const CORTO_SIN_PIEZA: Record<TrozaSinPieza, string> = {
  por_recibir: "por recibir en el CTP",
  sin_enlace: "sin enlace al Libro CTP",
  sin_despacho: "sin despacho",
};

/** «1 por recibir en el CTP · 2 sin despacho». */
export function fraseSinPieza(sp: Record<TrozaSinPieza, number>): string {
  return ORDEN_SIN_PIEZA.filter((s) => sp[s] > 0)
    .map((s) => `${sp[s]} ${CORTO_SIN_PIEZA[s]}`)
    .join(" · ");
}

/** La única categoría de las trozas sin pieza, si son todas de una; `null` = mezcla (o ninguna). */
export function sinPiezaUnica(sp: Record<TrozaSinPieza, number>): TrozaSinPieza | null {
  const hay = ORDEN_SIN_PIEZA.filter((s) => sp[s] > 0);
  return hay.length === 1 ? hay[0] : null;
}

/** El ⓘ de las trozas sin pieza: el de «por recibir» y/o el de «sin enlace»; `null` si sólo falta el despacho. */
export function notaSinPieza(sp: Record<TrozaSinPieza, number>): string | null {
  const notas = [sp.por_recibir > 0 ? POR_RECIBIR : null, sp.sin_enlace > 0 ? SIN_ENLACE : null].filter((x): x is string => !!x);
  return notas.length > 0 ? notas.join(" ") : null;
}

/** Una línea para el CSV y para lectores de pantalla. */
export function textoDestino(d: DestinoArbol | null | undefined): string {
  if (!d || d.trozadas === 0) return "";
  const resto = fraseSinPieza(d.sinPieza);
  if (d.enlazadas === 0) {
    const una = sinPiezaUnica(d.sinPieza);
    return una ? CORTO_SIN_PIEZA[una] : resto;
  }
  return `${d.enlazadas} de ${d.trozadas} en el CTP: ${fraseDeEstados(d.porEstado)}${resto ? `; ${resto}` : ""}`;
}

// ─── La línea de tiempo del árbol ────────────────────────────────────────────

export type ClavePasoArbol = "talado" | "trozado" | "despachado" | "recibido" | "aserrado";

export interface PasoArbol {
  clave: ClavePasoArbol;
  titulo: string;
  hecho: boolean;
  /** `AAAA-MM-DD` del primer hecho de la etapa; `null` = no pasó (o no se sabe). */
  dia: string | null;
  detalle: string | null;
  /** Aclaración del dato (de dónde sale el día, qué es la suma); va en un ⓘ. */
  nota: string | null;
}

const primerDia = (xs: readonly { entryDate: string }[]): string | null =>
  xs.reduce<string | null>((min, l) => {
    const d = diaDe(l.entryDate);
    return d && (!min || d < min) ? d : min;
  }, null);

const m3Texto = (n: number) => `${n.toFixed(3)} m³`;

/**
 * «talado → trozado → despachado (GTF) → recibido en el CTP → aserrado
 * (corrida N)». Las tres primeras salen del Libro TH (la operación del árbol);
 * las dos últimas, del Libro CTP por el enlace. `destino` `undefined` = no se
 * pudo preguntar: esos pasos quedan sin hacer y sin acusar.
 */
export function pasosDelArbol(
  op: Pick<TraceOperation, "tala" | "trozado" | "despachoTroza" | "talaVolM3" | "trozadoVolM3" | "trozasCount" | "trozasDespachadas">,
  destino: DestinoArbol | undefined,
): PasoArbol[] {
  const gtfs = [...new Set(op.despachoTroza.map((l) => l.gtfNumber?.trim()).filter((g): g is string => !!g))];
  const conEnlace = !!destino && destino.enlazadas > 0;
  const pasos: PasoArbol[] = [
    {
      clave: "talado",
      titulo: "Talado",
      hecho: op.tala.length > 0,
      dia: primerDia(op.tala),
      detalle: op.tala.length > 0 ? m3Texto(op.talaVolM3) : null,
      nota: null,
    },
    {
      clave: "trozado",
      titulo: "Trozado",
      hecho: op.trozado.length > 0,
      dia: primerDia(op.trozado),
      detalle: op.trozado.length > 0 ? `${op.trozado.length} troza${op.trozado.length === 1 ? "" : "s"} · ${m3Texto(op.trozadoVolM3)}` : null,
      nota: null,
    },
    {
      clave: "despachado",
      titulo: "Despachado",
      hecho: op.despachoTroza.length > 0,
      dia: primerDia(op.despachoTroza),
      detalle:
        op.despachoTroza.length > 0
          ? [gtfs.length > 0 ? `GTF ${gtfs.join(", ")}` : "sin N° de GTF", `${op.trozasDespachadas} de ${op.trozasCount}`].join(" · ")
          : null,
      nota: null,
    },
  ];

  const llegada = destino?.primeraLlegada ?? null;
  const ingreso = destino?.ingresos[0];
  // Sin ninguna pieza enlazada, lo dice el despacho de cada troza: no se acusa «sin enlace» de lo que no salió.
  const una = destino ? sinPiezaUnica(destino.sinPieza) : null;
  const sinPiezaDetalle = !destino
    ? null
    : una === "sin_enlace"
      ? "Sin enlace"
      : una === "por_recibir"
        ? "Por recibir"
        : una === "sin_despacho"
          ? null
          : fraseSinPieza(destino.sinPieza) || null;
  pasos.push({
    clave: "recibido",
    titulo: "Recibido en el CTP",
    hecho: conEnlace && !!llegada,
    dia: llegada?.dia ?? null,
    detalle: !destino
      ? null
      : !conEnlace
        ? sinPiezaDetalle
        : ingreso
          ? [
              `Ingreso N° ${ingreso.libroNro ?? "s/n"}`,
              destino.ingresos.length > 1 ? `y ${destino.ingresos.length - 1} más` : `GTF ${ingreso.gtf}`,
            ].join(" · ")
          : null,
    nota: !destino
      ? null
      : !conEnlace
        ? notaSinPieza(destino.sinPieza)
        : llegada
          ? NOTA_FUENTE[llegada.fuente]
          : destino.piezas.length > 0 && destino.piezas.every((p) => p.estado === "descarte")
            ? "Sus piezas del Libro CTP están descartadas: no entran a ningún cálculo."
            : "Su guía está en el Libro CTP pero ninguna troza bajó todavía del camión.",
  });

  const corridas = destino?.corridas ?? [];
  const enPatio = destino?.m3.enPatio ?? 0;
  pasos.push({
    clave: "aserrado",
    titulo: "Aserrado",
    hecho: corridas.length > 0,
    dia: corridas[0]?.dia ?? null,
    detalle:
      corridas.length > 0
        ? `Corrida${corridas.length === 1 ? "" : "s"} N° ${corridas.map((c) => c.lineNo).join(", ")} · ${m3Texto(destino?.m3.aserrado ?? 0)}`
        : conEnlace && enPatio > 0
          ? `${m3Texto(enPatio)} en patio`
          : null,
    nota:
      corridas.length > 0
        ? "Los m³ son la suma de la GTF de sus trozas que entraron a la corrida, no lo que la corrida rindió."
        : null,
  });
  return pasos;
}
