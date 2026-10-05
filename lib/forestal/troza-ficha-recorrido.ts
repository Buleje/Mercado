/**
 * troza-ficha-recorrido — lo que la ficha de UNA troza dice antes que los datos
 * crudos: en qué estado está, cuántos días lleva, si sus puntas cuadran con el
 * volumen y por dónde pasó, con lo que tardó cada tramo.
 *
 * Todo sale de `/trozas/ficha` (la pieza, su guía, su lote, su corrida) y de
 * `/ctp/planta/troza/[id]/historia` (las fechas que el libro guarda del lote y
 * del producto, ADR-465). Nada se inventa:
 *   · el estado es el MISMO `estadoDeTroza` del patio, alimentado igual que el
 *     endpoint del patio —el chip de la ficha no puede contradecir a la tabla—;
 *   · los días son los MISMOS `diasParada` de la columna «Parada»;
 *   · donde el libro no guarda la fecha propia de la pieza se usa la de su
 *     documento y `fechaDe` lo dice («recepción de su guía»): un derivado nunca
 *     se presenta como el dato.
 *
 * PURO y client-safe.
 */

import type { ArbolDeTroza } from "./arbol-de-troza";
import { guiaRecibida } from "./consumo-trozas";
import { diasParada } from "./patio-dias";
import type { EventoTroza } from "./planta-zona-types";
import { esNumeroRegistroValido, normalizarNumeroRegistro, urlConsultaGtf } from "./serfor-gtf";
import type { MedidaEnPlanta } from "./tarjeta-troza";
import { estaEnPatio, estadoDeTroza, type EstadoTroza, type TrozaPatio } from "./trozas-patio";
import { medidasDePieza, UMBRAL_HUBER, volumenHuberM3, type MedidasPieza } from "./trozas-patio-medidas";

/** La respuesta de `GET /api/admin/forestal/trozas/ficha?id=` (lo que la ficha lee). */
export interface FichaTroza {
  troza: {
    id: string;
    codificacion: string | null;
    codigoPlanta: string | null;
    parcela: string | null;
    especieComun: string | null;
    especieCientifica: string | null;
    dimensiones: string | null;
    d1Cm: number | null;
    d2Cm: number | null;
    diametroCm: number | null;
    largoM: number | null;
    volumenM3: number | null;
    noRecepcionada: boolean;
    fechaRecepcion: string | null;
    recepcionObs: string | null;
    descarte: boolean;
    observaciones: string | null;
    fechaRetrozo: string | null;
    fechaConsumo: string | null;
    fechaDespacho: string | null;
    /** `true` = D1/D2 los cargó la planta sobre un NULL de la guía. */
    d1d2MedidoEnPlanta?: boolean | null;
    /** Cubicación Oxapampa (ADR-440), en pulgadas. */
    oxD1Pulg?: number | null;
    oxD2Pulg?: number | null;
    /** ADR-450: el árbol del Libro TH (copia) y lo medido en planta al recibirla. */
    arbolCodigo?: string | null;
    lothTrozadoId?: string | null;
    recibida?: MedidaEnPlanta | null;
  };
  ingreso: {
    id: string;
    libroNro: number | null;
    /** N° de registro del SNIFFS (`2-17-0002328`), NO el N° impreso de la GTF. */
    constanciaSniffs?: string | null;
    gtfNumber: string;
    proveedor: string;
    entryDate: string;
    fechaRecepcion: string | null;
    status: string;
    permiso: string | null;
    resolucion: string | null;
    volumenM3: number | null;
  };
  madre: { id: string; codificacion: string | null; codigoPlanta: string | null; volumenM3: number | null } | null;
  retrozos: {
    id: string; codificacion: string | null; codigoPlanta: string | null; volumenM3: number | null;
    largoM: number | null; d1Cm: number | null; d2Cm: number | null; descarte: boolean; usada: boolean;
  }[];
  lote: { id: string; code: string; status: string; speciesCommon: string | null } | null;
  loteMixto?: { id: string; code: string } | null;
  corrida: {
    id: string; lineNo: number; entryDate: string; vigente: boolean; producto: string | null;
    presentacion: string | null; cantidad: number | null; unidad: string | null;
    rendimientoPct: number | null; linea: string | null; volumenEntradaM3: number | null;
  } | null;
  despacho: {
    id: string; lineNo: number; entryDate: string; vigente: boolean; docType: string | null;
    gtfNumber: string | null; cantidad: number | null; unidad: string | null;
  } | null;
  /** ADR-450 L4: «Del bosque», leído del Libro TH con el estado de sus líneas. */
  arbol?: ArbolDeTroza | null;
}

/* ── Estado y días ────────────────────────────────────────────────────── */

/**
 * La ficha en la forma del patio, con las MISMAS reglas que el endpoint de
 * `/trozas/patio`: una corrida o un despacho anulado no cuenta (la madera
 * volvió), la fecha de recepción es la de la pieza, y la guía «recibida» es
 * `guiaRecibida` (validada/procesada, o con fecha propia o de la guía).
 */
export function trozaPatioDeFicha(f: FichaTroza): TrozaPatio {
  return {
    id: f.troza.id,
    especieComun: f.troza.especieComun,
    volumenM3: f.troza.volumenM3,
    gtfNumber: f.ingreso.gtfNumber,
    fechaIngreso: f.ingreso.entryDate,
    fechaRecepcion: f.troza.fechaRecepcion,
    consumidaEnId: f.corrida?.vigente ? f.corrida.id : null,
    despachadaEnId: f.despacho?.vigente ? f.despacho.id : null,
    noRecepcionada: f.troza.noRecepcionada,
    guiaRecepcionada: guiaRecibida({
      estado: f.ingreso.status,
      fechaRecepcionGuia: f.ingreso.fechaRecepcion,
      fechaRecepcionTroza: f.troza.fechaRecepcion,
    }),
    descarte: f.troza.descarte,
    retrozos: f.retrozos.length,
    trozaOrigenId: f.madre?.id ?? null,
    loteAserrioCode: f.lote?.code ?? null,
    codificacion: f.troza.codificacion,
    codigoPlanta: f.troza.codigoPlanta,
    proveedor: f.ingreso.proveedor,
    permiso: f.ingreso.permiso,
  };
}

export const estadoDeFicha = (f: FichaTroza): EstadoTroza => estadoDeTroza(trozaPatioDeFicha(f));

/** «Hoy» como lo cuenta el libro: el día de Lima, a mediodía UTC. */
export const hoyDelLibro = (limaKey: string): Date => new Date(`${limaKey}T12:00:00.000Z`);

const diaKey = (iso: string | null | undefined): string | null =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;

/** Días entre dos fechas del libro, por día UTC. `null` si falta una o van al revés. */
export function diasEntre(desde: string | null | undefined, hasta: string | null | undefined): number | null {
  const a = diaKey(desde);
  const b = diaKey(hasta);
  if (!a || !b) return null;
  const d = Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(d) && d >= 0 ? d : null;
}

export interface DiasDeLaPieza {
  dias: number;
  /** «12 días en el patio», «Estuvo 5 días en el patio»… */
  texto: string;
  /** Cuenta desde el asiento de la guía porque la pieza no tiene fecha de recepción propia. */
  desdeElAsiento: boolean;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Cuánto lleva (o llevó) parada. El número es el de la columna «Parada» de la
 * tabla (`diasParada`: desde que bajó; si no se sabe, desde el asiento). Lo que
 * ya no está en el patio dice cuánto ESTUVO, hasta el día en que salió.
 */
export function diasDeLaPieza(f: FichaTroza, estado: EstadoTroza, hoy: Date): DiasDeLaPieza | null {
  const desdeElAsiento = !f.troza.fechaRecepcion;
  const fechas = { fechaRecepcion: f.troza.fechaRecepcion, fechaIngreso: f.ingreso.entryDate };
  if (estaEnPatio(estado)) {
    const dias = diasParada(fechas, hoy);
    if (dias == null) return null;
    return {
      dias,
      texto: desdeElAsiento ? `${plural(dias, "día", "días")} desde el asiento de su guía` : `${plural(dias, "día", "días")} en el patio`,
      desdeElAsiento,
    };
  }
  if (estado === "por_recepcionar") {
    const dias = diasParada({ fechaIngreso: f.ingreso.entryDate }, hoy);
    return dias == null ? null : { dias, texto: `Guía asentada hace ${plural(dias, "día", "días")}, sin recibir`, desdeElAsiento: true };
  }
  const salida =
    estado === "consumida" ? (f.troza.fechaConsumo ?? f.corrida?.entryDate) :
    estado === "despachada" ? (f.troza.fechaDespacho ?? f.despacho?.entryDate) : null;
  if (!salida) return null;
  const dias = diasEntre(f.troza.fechaRecepcion ?? f.ingreso.entryDate, salida);
  return dias == null ? null : { dias, texto: `Estuvo ${plural(dias, "día", "días")} en el patio`, desdeElAsiento };
}

/* ── Medidas y control de Huber ───────────────────────────────────────── */

/** Las puntas con su fuente (guía / P planta / R recibida / Ox), como la tabla. */
export function medidasDeFicha(t: FichaTroza["troza"]): MedidasPieza {
  return medidasDePieza({
    d1Cm: t.d1Cm,
    d2Cm: t.d2Cm,
    d1d2MedidoEnPlanta: t.d1d2MedidoEnPlanta,
    recibidaD1Cm: t.recibida?.d1Cm,
    recibidaD2Cm: t.recibida?.d2Cm,
    oxD1Pulg: t.oxD1Pulg,
    oxD2Pulg: t.oxD2Pulg,
  });
}

/** El umbral vive con Huber, en `trozas-patio-medidas` (una sola cifra para planilla y ficha). */
export { UMBRAL_HUBER };

export interface ControlHuber {
  /** Huber con esas puntas y el largo de la guía. DERIVADO. */
  huberM3: number;
  declaradoM3: number;
  /** (Huber − declarado) / declarado. */
  desvio: number;
  revisar: boolean;
}

/** ¿Las puntas cuadran con el volumen declarado? `null` si falta algo para calcularlo. */
export function controlHuber(
  d1: number | null, d2: number | null, largoM: number | null | undefined, volumenM3: number | null | undefined,
): ControlHuber | null {
  const huberM3 = volumenHuberM3(d1, d2, largoM);
  if (huberM3 == null || volumenM3 == null || !(volumenM3 > 0)) return null;
  const desvio = (huberM3 - volumenM3) / volumenM3;
  return { huberM3, declaradoM3: volumenM3, desvio, revisar: Math.abs(desvio) > UMBRAL_HUBER };
}

/* ── Documento de origen ──────────────────────────────────────────────── */

/** El enlace a la consulta pública de SERFOR, sólo con un N° de registro que tenga forma. */
export function consultaSerforDe(constancia: string | null | undefined): string | null {
  const n = constancia?.trim();
  if (!n || !esNumeroRegistroValido(n)) return null;
  return urlConsultaGtf(normalizarNumeroRegistro(n));
}

/* ── Recorrido ────────────────────────────────────────────────────────── */

export type ClavePaso = "guia" | "recepcion" | "pedazo" | "lote" | "retrozo" | "corrida" | "despacho" | "hoy";

export interface PasoRecorrido {
  clave: ClavePaso;
  /** ISO; `null` = el libro no guarda esa fecha (o el paso no ocurrió). */
  fecha: string | null;
  /** Si la fecha es la de su documento y no la de la pieza, de cuál («recepción de su guía»). */
  fechaDe: string | null;
  /** Días hasta el próximo paso con fecha (o hasta hoy, si sigue parada). */
  tramo: { dias: number; hasta: ClavePaso } | null;
}

/** Cómo se dice el tramo según adónde llega. */
export const HASTA_PASO: Record<ClavePaso, string> = {
  guia: "",
  recepcion: "hasta que bajó del camión",
  pedazo: "hasta que la cortaron",
  lote: "hasta apartarla",
  retrozo: "hasta cortarla",
  corrida: "hasta la sierra",
  despacho: "hasta que salió",
  hoy: "hasta hoy",
};

export function textoTramo(t: { dias: number; hasta: ClavePaso }): string {
  return t.dias === 0 ? "El mismo día" : `${plural(t.dias, "día", "días")} ${HASTA_PASO[t.hasta]}`;
}

/** El evento de lote que la historia fechó: el de aserrío manda sobre el mixto. */
function eventoDeLote(eventos: readonly EventoTroza[]): EventoTroza | null {
  return eventos.find((e) => e.tipo === "lote") ?? eventos.find((e) => e.tipo === "lote_mixto") ?? null;
}

/**
 * Los pasos de la pieza en el orden del flujo (guía → recepción → lote →
 * sierra/salida → hoy), cada uno con su fecha y lo que tardó hasta el
 * siguiente. Los que no ocurrieron igual figuran (sin fecha): que la pieza no
 * se haya apartado es información.
 */
export function recorridoDeFicha(
  f: FichaTroza, eventos: readonly EventoTroza[], estado: EstadoTroza, hoyKey: string,
): PasoRecorrido[] {
  const t = f.troza;
  const pasos: Omit<PasoRecorrido, "tramo">[] = [];
  const paso = (clave: ClavePaso, fecha: string | null | undefined, fechaDe: string | null = null) =>
    pasos.push({ clave, fecha: fecha ?? null, fechaDe: fecha ? fechaDe : null });

  paso("guia", f.ingreso.entryDate);
  if (t.noRecepcionada || estado === "por_recepcionar") paso("recepcion", null);
  else if (t.fechaRecepcion) paso("recepcion", t.fechaRecepcion);
  else paso("recepcion", f.ingreso.fechaRecepcion, "recepción de su guía");

  if (f.madre) paso("pedazo", t.fechaRetrozo);

  const enLote = Boolean(f.lote || f.loteMixto);
  if (enLote || estaEnPatio(estado) || estado === "por_recepcionar") {
    const ev = enLote ? eventoDeLote(eventos) : null;
    const derivada = ev?.detalle?.match(/\(fecha de (apertura del (?:lote|mixto))\)/)?.[1] ?? null;
    paso("lote", ev?.fecha, derivada);
  }

  if (f.retrozos.length > 0) paso("retrozo", t.fechaRetrozo);
  if (f.corrida) paso("corrida", t.fechaConsumo ?? f.corrida.entryDate, t.fechaConsumo ? null : "fecha de la corrida");
  if (f.despacho) paso("despacho", t.fechaDespacho ?? f.despacho.entryDate, t.fechaDespacho ? null : "fecha del despacho");
  if (estaEnPatio(estado) || estado === "por_recepcionar") paso("hoy", `${hoyKey}T12:00:00.000Z`);

  return pasos.map((p, i) => {
    const sig = pasos.slice(i + 1).find((q) => q.fecha);
    const dias = sig ? diasEntre(p.fecha, sig.fecha) : null;
    return { ...p, tramo: sig && dias != null ? { dias, hasta: sig.clave } : null };
  });
}

/**
 * Lo que pasó con el PRODUCTO de su corrida (se apartó, salió con una guía).
 * Es de la corrida, no sólo de esta pieza, y así se rotula en pantalla.
 */
export function eventosDelProducto(f: FichaTroza, eventos: readonly EventoTroza[]): EventoTroza[] {
  if (!f.corrida?.vigente) return [];
  return eventos.filter((e) => e.tipo === "apartado" || e.tipo === "despacho");
}

/* ── Fechas ───────────────────────────────────────────────────────────── */

/** Días escritos a mano (no `Intl`: cambia con la versión de ICU). */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/**
 * «jueves 10/09» — la fecha como la dice Brandon, por día UTC (las del libro
 * son date-only). Con año sólo si no es el de hoy: «lunes 15/12/2025».
 */
export function fechaDelLibro(iso: string | null | undefined, hoyKey: string): string | null {
  const k = diaKey(iso);
  if (!k) return null;
  const d = new Date(`${k}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  const anio = k.slice(0, 4) === hoyKey.slice(0, 4) ? "" : `/${k.slice(0, 4)}`;
  return `${DIAS[d.getUTCDay()]} ${k.slice(8, 10)}/${k.slice(5, 7)}${anio}`;
}
