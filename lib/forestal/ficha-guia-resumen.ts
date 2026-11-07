/**
 * ficha-guia-resumen.ts — lo que la Ficha de la guía cuenta de un vistazo
 * (rediseño 2026-09-26, sobre ADR-350).
 *
 * La ficha pasó de dos pestañas apiladas a una grilla de bloques. Cada bloque
 * responde UNA pregunta —«¿qué madera trae?», «¿dónde está cada troza?»,
 * «¿cuándo llegó?»— y la respuesta sale de acá, no del componente, para que la
 * cifra del chip de la cabecera y la del bloque sean la misma cuenta.
 *
 * PURO y client-safe: sin Prisma, sin `Intl` (los días se escriben a mano).
 */

import { diaDelLibro, type FechaDelLibro } from "./recepcion-antes-de-la-sierra";
import { limaDateKey } from "@/lib/utils";

// ── Dónde está cada troza ────────────────────────────────────────────────────

/**
 * El estado de UNA pieza de la guía, en el orden en que se decide.
 *
 * El orden importa: una troza que no llegó no puede estar aserrada (regla del
 * libro), y una despachada sin aserrar ya no está en el patio aunque tenga
 * fecha de recepción. `sin_recibir` es la que todavía espera que alguien la
 * feche: no es «no llegó», es «nadie lo dijo todavía».
 */
export type EstadoTrozaFicha =
  | "en_patio"
  | "sin_recibir"
  | "no_llego"
  | "aserrada"
  | "despachada"
  | "retrozada"
  | "descarte";

export interface TrozaParaResumen {
  fechaRecepcion?: string | null;
  noRecepcionada?: boolean | null;
  consumidaEnId?: string | null;
  despachadaEnId?: string | null;
  descarte?: boolean | null;
  /** Cuántos pedazos salieron de ella (retrozado): la madre no se consume, van los pedazos. */
  retrozos?: number | null;
  etiquetadaEn?: string | null;
  volumenM3?: number | string | null;
}

/** Cómo se dice cada estado en el patio. El orden es el de los filtros. */
export const ESTADOS_TROZA: ReadonlyArray<{ clave: EstadoTrozaFicha; rotulo: string }> = [
  { clave: "en_patio", rotulo: "En patio" },
  { clave: "sin_recibir", rotulo: "Sin recibir" },
  { clave: "aserrada", rotulo: "Aserrada" },
  { clave: "despachada", rotulo: "Despachada" },
  { clave: "retrozada", rotulo: "Retrozada" },
  { clave: "no_llego", rotulo: "No llegó" },
  { clave: "descarte", rotulo: "Descarte" },
];

export const ROTULO_ESTADO_TROZA: Record<EstadoTrozaFicha, string> = Object.fromEntries(
  ESTADOS_TROZA.map((e) => [e.clave, e.rotulo]),
) as Record<EstadoTrozaFicha, string>;

export function estadoDeTroza(t: TrozaParaResumen): EstadoTrozaFicha {
  if (t.noRecepcionada) return "no_llego";
  if (t.despachadaEnId) return "despachada";
  if (t.consumidaEnId) return "aserrada";
  if ((t.retrozos ?? 0) > 0) return "retrozada";
  if (t.descarte) return "descarte";
  if (!t.fechaRecepcion) return "sin_recibir";
  return "en_patio";
}

const numero = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface ResumenTrozas {
  total: number;
  porEstado: Record<EstadoTrozaFicha, number>;
  /** Con al menos una etiqueta QR impresa (ADR-436). */
  etiquetadas: number;
  /** En patio y sin etiqueta: las que conviene etiquetar antes de moverlas. */
  enPatioSinEtiqueta: number;
  m3: number;
}

export function resumirTrozas(trozas: readonly TrozaParaResumen[]): ResumenTrozas {
  const porEstado = Object.fromEntries(ESTADOS_TROZA.map((e) => [e.clave, 0])) as Record<EstadoTrozaFicha, number>;
  let etiquetadas = 0;
  let enPatioSinEtiqueta = 0;
  let m3 = 0;
  for (const t of trozas) {
    const e = estadoDeTroza(t);
    porEstado[e] += 1;
    if (t.etiquetadaEn) etiquetadas += 1;
    else if (e === "en_patio") enPatioSinEtiqueta += 1;
    m3 += numero(t.volumenM3);
  }
  return { total: trozas.length, porEstado, etiquetadas, enPatioSinEtiqueta, m3: Math.round(m3 * 1000) / 1000 };
}

// ── La madera por especie ────────────────────────────────────────────────────

export interface EspecieParaReparto {
  comun: string;
  volumenM3: number;
}

/**
 * La parte de cada especie en el volumen de la guía, para la barra de
 * proporción. Los enteros se reparten por el mayor resto: la barra dice
 * «62 % · 38 %» y suma 100, no 99 ni 101. Sin volumen, todo en 0.
 */
export function repartoDeEspecies<E extends EspecieParaReparto>(especies: readonly E[]): Array<E & { pct: number }> {
  const total = especies.reduce((s, e) => s + Math.max(0, numero(e.volumenM3)), 0);
  if (!(total > 0)) return especies.map((e) => ({ ...e, pct: 0 }));
  const crudos = especies.map((e) => (Math.max(0, numero(e.volumenM3)) / total) * 100);
  const pisos = crudos.map(Math.floor);
  let falta = 100 - pisos.reduce((s, n) => s + n, 0);
  const orden = crudos.map((c, i) => ({ i, resto: c - pisos[i] })).sort((a, b) => b.resto - a.resto);
  for (const { i } of orden) {
    if (falta <= 0) break;
    pisos[i] += 1;
    falta -= 1;
  }
  return especies.map((e, i) => ({ ...e, pct: pisos[i] }));
}

// ── La línea de tiempo de la guía ────────────────────────────────────────────

export type ClaveHito = "expedida" | "documento" | "libro" | "llego" | "validada";

export interface HitoDeGuia {
  clave: ClaveHito;
  rotulo: string;
  /** `AAAA-MM-DD`, o `null` si todavía no pasó (o el papel no lo trae). */
  dia: string | null;
  estado: "hecho" | "pendiente" | "alerta";
  /** Una frase corta debajo del día: quién validó, cuántas piezas faltan… */
  detalle?: string | null;
}

export interface LineaParaHitos {
  entryDate: FechaDelLibro;
  gtfDate?: FechaDelLibro;
  fechaRecepcion?: FechaDelLibro;
  status: string;
  validatedAt?: string | null;
  validatedBy?: string | null;
}

export interface EntradaHitos {
  lineas: readonly LineaParaHitos[];
  /** Casillero (3) F. Expedición, `AAAA-MM-DD` (`vencimientoDeGuia`). */
  expedicion: string | null;
  /** Casillero (4) F. Vencimiento. */
  vencimiento: string | null;
  /** Piezas con decisión de recepción / piezas de la guía. */
  piezasDecididas: number;
  piezasTotal: number;
  /** Para probar: el «hoy» de Lima. */
  hoy?: string;
}

/** `dd/mm`: la fecha como se dice en el patio (sin Intl, los meses cambian con ICU). */
export const ddmm = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const minimo = (dias: Array<string | null>): string | null =>
  dias.filter((d): d is string => Boolean(d)).sort()[0] ?? null;

const VIVA = (s: string) => s !== "rechazado" && s !== "anulado";

export interface LineaDeTiempo {
  hitos: HitoDeGuia[];
  /** La madera figura recibida DESPUÉS de que venció la guía (ADR-434). */
  recibidaVencida: boolean;
  /** Sin recibir y ya vencida hoy: la guía no ampara el traslado. */
  vencidaSinRecibir: boolean;
}

/**
 * Emitida → documento → al libro → llegó → validada. Cada hito con su día o
 * pendiente; lo que el papel no trae se dice pendiente, nunca se estima.
 */
export function lineaDeTiempo(e: EntradaHitos): LineaDeTiempo {
  const vivas = e.lineas.filter((l) => VIVA(l.status));
  const base = vivas.length > 0 ? vivas : e.lineas;
  const hoy = e.hoy ?? limaDateKey(new Date());

  const documento = minimo(base.map((l) => diaDelLibro(l.gtfDate)));
  const libro = minimo(base.map((l) => diaDelLibro(l.entryDate)));
  const llego = minimo(base.map((l) => diaDelLibro(l.fechaRecepcion)));
  const todasValidadas = base.length > 0 && base.every((l) => l.status === "validado" || l.status === "procesado");
  const ultimaValidacion = todasValidadas
    ? base
        .filter((l) => l.validatedAt)
        .sort((a, b) => String(b.validatedAt).localeCompare(String(a.validatedAt)))[0]
    : undefined;
  const validada = ultimaValidacion?.validatedAt ? limaDateKey(ultimaValidacion.validatedAt) : null;

  const recibidaVencida = Boolean(llego && e.vencimiento && llego > e.vencimiento);
  const vencidaSinRecibir = !llego && Boolean(e.vencimiento && hoy > e.vencimiento);
  const faltanPiezas = Math.max(0, e.piezasTotal - e.piezasDecididas);

  const hitos: HitoDeGuia[] = [
    {
      clave: "expedida",
      rotulo: "Expedida",
      dia: e.expedicion,
      estado: e.expedicion ? "hecho" : "pendiente",
      detalle: e.vencimiento ? `vence ${ddmm(e.vencimiento)}` : null,
    },
    { clave: "documento", rotulo: "Fecha de la guía", dia: documento, estado: documento ? "hecho" : "pendiente" },
    { clave: "libro", rotulo: "Al libro", dia: libro, estado: libro ? "hecho" : "pendiente" },
    {
      clave: "llego",
      rotulo: "Llegó al patio",
      dia: llego,
      estado: recibidaVencida || vencidaSinRecibir ? "alerta" : llego ? "hecho" : "pendiente",
      detalle: recibidaVencida
        ? "después de vencer"
        : vencidaSinRecibir
          ? "la guía ya venció"
          : e.piezasTotal > 0 && faltanPiezas > 0 && llego
            ? `faltan ${faltanPiezas} pieza${faltanPiezas === 1 ? "" : "s"}`
            : null,
    },
    {
      clave: "validada",
      rotulo: "Validada",
      dia: validada,
      /* Validada sin fecha guardada (asientos viejos) sigue estando validada. */
      estado: todasValidadas ? "hecho" : "pendiente",
      detalle: ultimaValidacion?.validatedBy ?? null,
    },
  ];
  return { hitos, recibidaVencida, vencidaSinRecibir };
}
