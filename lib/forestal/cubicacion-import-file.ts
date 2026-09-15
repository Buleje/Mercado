/**
 * cubicacion-import-file — lee un archivo .xlsx/.csv del disco a una matriz de
 * celdas. Client-only: exceljs entra por import dinámico (fuera del bundle
 * inicial, se carga sólo cuando alguien importa). El parseo semántico vive en
 * `cubicacion-import.ts` — acá sólo se saca el contenido crudo.
 */

import type { Celda } from "./cubicacion-import";

/**
 * El separador de columnas del texto: tab > `;` > `,`.
 *
 * NO se aceptan los tres a la vez, y no es un detalle: acá el decimal se
 * escribe con **coma** («14,5 m³»), así que partir por coma cuando el archivo
 * ya venía separado por tabs o por `;` corta el número en dos y corre todas
 * las columnas siguientes una posición. Se detectó pegando una planilla real:
 * «14,5» entraba como 14 y el % aprovechable de esa fila aparecía en la
 * columna de piezas — con `tsc`, `lint` y los tests en verde, porque es
 * semántica de datos y no de tipos.
 *
 * Se decide por el archivo entero (no por línea): una fila sin comas no puede
 * cambiar cómo se lee la de al lado. Las comillas no cuentan — lo que está
 * entre comillas es contenido, no estructura.
 */
function separadorDe(lineas: readonly string[]): string {
  const fuera = (linea: string, sep: string): number => {
    let n = 0;
    let enComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') { enComillas = !enComillas; continue; }
      if (!enComillas && c === sep) n++;
    }
    return n;
  };
  const total = (sep: string) => lineas.reduce((a, l) => a + fuera(l, sep), 0);
  if (total("\t") > 0) return "\t";
  if (total(";") > 0) return ";";
  return ",";
}

/** Parte una línea respetando comillas, con el separador ya elegido. */
function parsearLineaCsv(linea: string, sep: string): string[] {
  const out: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (enComillas) {
      if (c === '"' && linea[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === sep) {
      out.push(campo); campo = "";
    } else {
      campo += c;
    }
  }
  out.push(campo);
  return out.map((s) => s.trim());
}

/**
 * Texto pegado (o un CSV ya leído) → matriz de celdas.
 *
 * Exportado porque pegar desde Excel es el camino más corto que hay: lo que va
 * al portapapeles es TSV, que `parsearLineaCsv` ya entiende (parte por tab
 * igual que por `,` y `;`). Sin esto, cada pantalla que quiera aceptar un
 * pegado se escribe su propio partidor y se come las comillas mal.
 */
export function leerTextoAFilas(texto: string): Celda[][] {
  return leerCsv(texto);
}

function leerCsv(texto: string): Celda[][] {
  const lineas = texto
    .replace(/\r\n/g, "\n")
    .replace(/^﻿/, "") // BOM que meten Excel/LibreOffice
    .split("\n")
    .filter((l) => l.length > 0);
  const sep = separadorDe(lineas);
  return lineas.map((l) => parsearLineaCsv(l, sep));
}

async function leerXlsx(buf: ArrayBuffer): Promise<Celda[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const filas: Celda[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    // row.values arranca en el índice 1; el 0 es un hueco.
    const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
    filas.push(vals.map((v) => celdaExcel(v)));
  });
  return filas;
}

/** Un valor de exceljs → celda simple (texto/número). */
function celdaExcel(v: unknown): Celda {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text?: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("");
    if (o.result !== undefined && o.result !== null) return o.result as Celda;
    if (o.text !== undefined && o.text !== null) return String(o.text);
  }
  return String(v);
}

/** Lee el archivo a una matriz de celdas, según su extensión/tipo. */
export async function leerArchivoAFilas(file: File): Promise<Celda[][]> {
  const nombre = file.name.toLowerCase();
  const esCsv = nombre.endsWith(".csv") || file.type === "text/csv";
  if (esCsv) return leerCsv(await file.text());
  return leerXlsx(await file.arrayBuffer());
}
