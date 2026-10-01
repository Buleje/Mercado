/**
 * loth-qr-troza — qué troza del Libro TH es la que se acaba de escanear, y la
 * lista del conteo del patio («modo ráfaga»).
 *
 * La etiqueta del Libro TH (`loth-troza-etiquetas.ts`, formato ADR-436) trae
 * TRES lecturas de la misma pieza:
 *   · el QR grande, con la ficha en texto que se lee sin internet:
 *     `TROZA 111-A\n🌳 Shihuahuaco\n…` — vale su primera línea;
 *   · el QR chico del sistema: `https://<host>/verificar/111-A`;
 *   · el Code128 con el código pelado: `111-A`.
 * Y el que no tiene cámara tipea el código a mano (o la pistola lo tipea por
 * él, línea por línea). Las cuatro las entiende `leerEscaneo` del CTP (single
 * source: si la etiqueta cambia, cambia en un solo lugar); acá se suma lo que
 * es propio del Libro TH: el código se busca en el TABLERO ya cargado (que no
 * tiene ids de troza, sólo códigos) y el QR de una troza del CTP
 * (`/admin/q/<id>`) se reconoce como «de otro libro», no como código perdido.
 *
 * PURO y client-safe.
 */

import { celdaCsv } from "./ctp-ingresos-csv";
import { esFichaDeTroza, esLineaDeFicha } from "./ficha-texto-troza";
import { claveDeCodigo, leerEscaneo } from "./leer-escaneo-troza";
import { diasEnPatioDe } from "./loth-tablero-columnas";
import { ESTADOS_META, type TrozaTablero } from "./loth-tablero-trozas";

export type LecturaQrLoth =
  /** Un código de troza (de cualquiera de los QR, del Code128 o tipeado). */
  | { tipo: "codigo"; codigo: string }
  /** Una línea suelta de la ficha que la pistola sigue tipeando: se calla. */
  | { tipo: "linea-ficha" }
  /** `TROZA —`: la ficha de una pieza que se imprimió sin código. */
  | { tipo: "sin-codigo" }
  /** El QR de una troza del Libro CTP (`/admin/q/<id>`): no es de este libro. */
  | { tipo: "otro-libro" };

/**
 * Interpreta lo que llegó de la cámara, la pistola o el teclado. `null` si no
 * hay nada utilizable (vacío, o una dirección que no es de una troza).
 */
export function leerQrTrozaLoth(texto: string | null | undefined): LecturaQrLoth | null {
  const crudo = (texto ?? "").replace(/^﻿/, "").trim();
  if (!crudo) return null;
  /* La ficha entera (QR grande leído por la cámara) arranca con `TROZA `: eso
     va a `leerEscaneo`. Una línea SUELTA (`🌳 Shihuahuaco`) es la pistola
     tipeando el resto de la ficha. */
  if (!esFichaDeTroza(crudo) && esLineaDeFicha(crudo)) return { tipo: "linea-ficha" };
  const lectura = leerEscaneo(crudo);
  if (!lectura) return esFichaDeTroza(crudo) ? { tipo: "sin-codigo" } : null;
  if (lectura.tipo === "id") return { tipo: "otro-libro" };
  return { tipo: "codigo", codigo: lectura.codigo };
}

export type ResultadoQrLoth =
  | { estado: "una"; fila: TrozaTablero }
  /** Dos trozas con el mismo código escrito distinto («13 A» y «13A»): se elige. */
  | { estado: "varias"; filas: TrozaTablero[] }
  /**
   * El código es de un ÁRBOL, no de una troza: la etiqueta se imprimió con el
   * código del árbol porque la línea de trozado no tenía el de la troza. Se
   * ofrecen sus trozas.
   */
  | { estado: "arbol"; arbol: string; filas: TrozaTablero[] }
  | { estado: "ninguna"; codigo: string };

/**
 * Busca un código en el tablero. Primero el código de troza, EXACTO («118»
 * no es «1180»), sin importar mayúsculas, tildes ni espacios; si ninguna
 * troza lo tiene, el código de árbol.
 */
export function buscarEnTablero(filas: readonly TrozaTablero[], codigo: string): ResultadoQrLoth {
  const clave = claveDeCodigo(codigo);
  if (!clave) return { estado: "ninguna", codigo };
  const porTroza = filas.filter((f) => claveDeCodigo(f.code) === clave);
  if (porTroza.length === 1) return { estado: "una", fila: porTroza[0]! };
  if (porTroza.length > 1) return { estado: "varias", filas: porTroza };
  const porArbol = filas.filter((f) => claveDeCodigo(f.treeCode) === clave);
  if (porArbol.length === 1) return { estado: "una", fila: porArbol[0]! };
  if (porArbol.length > 1)
    return { estado: "arbol", arbol: porArbol[0]!.treeCode ?? codigo, filas: porArbol };
  return { estado: "ninguna", codigo };
}

/** Días escritos a mano (no `Intl`: cambia con la versión de ICU). */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/**
 * `2026-09-29…` → «martes 29/09». La fecha del libro es date-only: el día de
 * la semana se saca en UTC (en Lima, a las 20:00 el UTC ya es mañana).
 */
export function fechaConDia(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return `${DIAS[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/* ── Modo ráfaga: contar el patio ──────────────────────────────────────── */

export interface LecturaRafaga {
  /** El código tal como se leyó (mayúsculas), o el de la troza hallada. */
  codigo: string;
  /** La troza del tablero; `null` = no está en este permiso. */
  fila: TrozaTablero | null;
  /** Cuántas veces se leyó: la misma etiqueta dos veces NO son dos trozas. */
  veces: number;
  /** Orden de la primera lectura (1, 2, 3…), para el CSV. */
  n: number;
}

/**
 * Suma una lectura a la lista. La misma troza (o el mismo código desconocido)
 * no se agrega dos veces: se le suma una lectura. Devuelve la lista nueva y si
 * era repetida, para avisar «ya estaba» en vez de contarla otra vez.
 */
export function agregarARafaga(
  lista: readonly LecturaRafaga[],
  codigo: string,
  fila: TrozaTablero | null,
): { lista: LecturaRafaga[]; repetida: boolean } {
  const clave = claveDeCodigo(fila?.code ?? codigo);
  const i = lista.findIndex((l) => claveDeCodigo(l.fila?.code ?? l.codigo) === clave);
  if (i >= 0) {
    const copia = [...lista];
    copia[i] = { ...copia[i]!, veces: copia[i]!.veces + 1 };
    return { lista: copia, repetida: true };
  }
  const n = lista.reduce((m, l) => Math.max(m, l.n), 0) + 1;
  return {
    lista: [...lista, { codigo: fila?.code ?? codigo, fila, veces: 1, n }],
    repetida: false,
  };
}

export interface ResumenRafaga {
  /** Trozas distintas leídas (una etiqueta leída dos veces cuenta una). */
  leidas: number;
  enPermiso: number;
  desconocidas: number;
  /** De las del permiso, cuántas figuran como ya salidas (despachadas/consumidas/…). */
  noDisponibles: number;
  /** m³ de las del permiso con volumen; las sin volumen no suman (no son 0). */
  m3: number;
}

export function resumirRafaga(lista: readonly LecturaRafaga[]): ResumenRafaga {
  const propias = lista.filter((l) => l.fila != null);
  const m3 = propias.reduce((a, l) => a + (l.fila?.volumenM3 ?? 0), 0);
  return {
    leidas: lista.length,
    enPermiso: propias.length,
    desconocidas: lista.length - propias.length,
    noDisponibles: propias.filter((l) => l.fila?.estado !== "disponible").length,
    m3: Math.round(m3 * 10000) / 10000,
  };
}

/** «Leídas 12 · 11 en este permiso · 1 desconocida». */
export function textoResumenRafaga(r: ResumenRafaga): string {
  const partes = [`Leídas ${r.leidas}`, `${r.enPermiso} en este permiso`];
  if (r.desconocidas > 0)
    partes.push(`${r.desconocidas} desconocida${r.desconocidas === 1 ? "" : "s"}`);
  return partes.join(" · ");
}

/** Coma decimal y `;`: lo que espera Excel es-PE (mismo formato que el resto del libro). */
const num = (v: number | null, dec: number) => (v == null ? "" : v.toFixed(dec).replace(".", ","));
const fila = (celdas: unknown[]) => celdas.map(celdaCsv).join(";");

/**
 * La lista del conteo en CSV: una fila por troza leída, en el orden en que se
 * leyó. La desconocida va con «No está en este permiso» en el estado: es la
 * fila que hay que ir a mirar.
 */
export function csvRafaga(lista: readonly LecturaRafaga[]): string {
  const cab = [
    "N°",
    "Código leído",
    "En este permiso",
    "Árbol",
    "Especie",
    "Vol. m³",
    "Estado",
    "GTF",
    "Placa",
    "Fecha salida",
    "Días en patio",
    "Lecturas",
  ];
  const filas = [...lista]
    .sort((a, b) => a.n - b.n)
    .map((l) => {
      const f = l.fila;
      return fila([
        l.n,
        l.codigo,
        f ? "Sí" : "No",
        f?.treeCode ?? "",
        f?.especie ?? "",
        num(f?.volumenM3 ?? null, 3),
        f ? ESTADOS_META[f.estado].label : "No está en este permiso",
        f?.gtf ?? "",
        f?.placa ?? "",
        f?.fechaSalida?.slice(0, 10) ?? "",
        f ? (diasEnPatioDe(f) ?? "") : "",
        l.veces,
      ]);
    });
  return [fila(cab), ...filas].join("\r\n");
}
