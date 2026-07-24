/**
 * cubicacion-import-file — lee un archivo .xlsx/.csv del disco a una matriz de
 * celdas. Client-only: exceljs entra por import dinámico (fuera del bundle
 * inicial, se carga sólo cuando alguien importa). El parseo semántico vive en
 * `cubicacion-import.ts` — acá sólo se saca el contenido crudo.
 */

import type { Celda } from "./cubicacion-import";

/** Parte una línea CSV respetando comillas y separadores , o ; */
function parsearLineaCsv(linea: string): string[] {
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
    } else if (c === "," || c === ";" || c === "\t") {
      out.push(campo); campo = "";
    } else {
      campo += c;
    }
  }
  out.push(campo);
  return out.map((s) => s.trim());
}

function leerCsv(texto: string): Celda[][] {
  return texto
    .replace(/\r\n/g, "\n")
    .replace(/^﻿/, "") // BOM que meten Excel/LibreOffice
    .split("\n")
    .filter((l) => l.length > 0)
    .map(parsearLineaCsv);
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
