/**
 * hoja-rango — trabajar con rangos de celdas: seleccionar, copiar, pegar.
 *
 * Es lo que separa "una tabla que se puede tocar" de "una planilla": elegir
 * B2:D40, copiarlo, pegarlo en otro lado, o traer una selección desde Excel y
 * que caiga en las celdas correctas.
 *
 * El formato de intercambio es TSV (columnas separadas por tabulación, filas
 * por salto de línea) porque es EXACTAMENTE lo que Excel y Google Sheets ponen
 * en el portapapeles: copiar acá y pegar en Excel funciona, y al revés también.
 */

import { numeroALetra } from "./xlsx-formato";

export interface Punto { fila: number; columna: number }

/** Selección viva: dónde empezó el arrastre y dónde está ahora. */
export interface Rango { ancla: Punto; foco: Punto }

export interface RangoNormal {
  filaIni: number; filaFin: number;
  colIni: number; colFin: number;
}

/** Convierte la selección a límites ordenados (el arrastre puede ir al revés). */
export function normalizar(r: Rango): RangoNormal {
  return {
    filaIni: Math.min(r.ancla.fila, r.foco.fila),
    filaFin: Math.max(r.ancla.fila, r.foco.fila),
    colIni: Math.min(r.ancla.columna, r.foco.columna),
    colFin: Math.max(r.ancla.columna, r.foco.columna),
  };
}

export function dentro(r: RangoNormal, fila: number, columna: number): boolean {
  return fila >= r.filaIni && fila <= r.filaFin && columna >= r.colIni && columna <= r.colFin;
}

export function cantidadCeldas(r: RangoNormal): number {
  return (r.filaFin - r.filaIni + 1) * (r.colFin - r.colIni + 1);
}

/** Etiqueta del rango como la muestra Excel: "B2" o "B2:D40". */
export function etiquetaRango(r: RangoNormal): string {
  const ini = `${numeroALetra(r.colIni + 1)}${r.filaIni + 1}`;
  if (r.filaIni === r.filaFin && r.colIni === r.colFin) return ini;
  return `${ini}:${numeroALetra(r.colFin + 1)}${r.filaFin + 1}`;
}

/**
 * Matriz → TSV.
 *
 * Una celda que contiene tabulaciones o saltos de línea se entrecomilla, que es
 * la convención que entiende Excel al pegar.
 */
export function aTsv(matriz: string[][]): string {
  return matriz
    .map((fila) => fila.map((c) => (/[\t\n\r"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join("\t"))
    .join("\n");
}

/**
 * TSV → matriz, respetando las comillas.
 *
 * Se acepta también el pegado de una sola celda con saltos de línea adentro,
 * que es lo que pasa al copiar un párrafo desde Word.
 */
export function desdeTsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; }
        else enComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"' && celda === "") { enComillas = true; continue; }
    if (c === "\t") { fila.push(celda); celda = ""; continue; }
    if (c === "\n") { fila.push(celda); filas.push(fila); fila = []; celda = ""; continue; }
    if (c === "\r") continue;
    celda += c;
  }
  if (celda !== "" || fila.length > 0) { fila.push(celda); filas.push(fila); }
  return filas;
}

/**
 * Dónde cae cada valor pegado.
 *
 * Como en Excel: si el destino seleccionado es más grande que lo copiado y lo
 * contiene un número entero de veces, el contenido se REPITE hasta llenarlo
 * (pegar una fila de encabezados sobre diez columnas). Si no, se pega una sola
 * vez desde la esquina.
 */
export function destinoPegado(
  matriz: string[][],
  destino: RangoNormal,
): { fila: number; columna: number; valor: string }[] {
  const alto = matriz.length;
  const ancho = Math.max(...matriz.map((f) => f.length), 0);
  if (alto === 0 || ancho === 0) return [];

  const filasDestino = destino.filaFin - destino.filaIni + 1;
  const colsDestino = destino.colFin - destino.colIni + 1;
  const repetirFilas = filasDestino > alto && filasDestino % alto === 0 ? filasDestino / alto : 1;
  const repetirCols = colsDestino > ancho && colsDestino % ancho === 0 ? colsDestino / ancho : 1;

  const salida: { fila: number; columna: number; valor: string }[] = [];
  for (let rf = 0; rf < repetirFilas; rf++) {
    for (let rc = 0; rc < repetirCols; rc++) {
      for (let f = 0; f < alto; f++) {
        for (let c = 0; c < ancho; c++) {
          salida.push({
            fila: destino.filaIni + rf * alto + f,
            columna: destino.colIni + rc * ancho + c,
            valor: matriz[f][c] ?? "",
          });
        }
      }
    }
  }
  return salida;
}

/** Recorre las celdas de un rango. */
export function celdasDe(r: RangoNormal): Punto[] {
  const out: Punto[] = [];
  for (let f = r.filaIni; f <= r.filaFin; f++) {
    for (let c = r.colIni; c <= r.colFin; c++) out.push({ fila: f, columna: c });
  }
  return out;
}
