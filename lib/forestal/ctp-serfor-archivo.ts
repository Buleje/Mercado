"use client";

/**
 * Leer el archivo que el SNIFFS devuelve, sea Excel o CSV.
 *
 * El reporte del SNIFFS no empieza en la fila 1: arriba trae el título del
 * libro, el N° de registro y la sección, a veces con celdas combinadas y filas
 * en blanco entre medio. Asumir que la cabecera es la primera fila hace que el
 * importador lea «LIBRO DE OPERACIONES DE CENTROS DE TRANSFORMACION…» como si
 * fueran nombres de columna.
 *
 * Esta capa vive en el cliente (ExcelJS pesa) y sólo se ocupa de convertir el
 * archivo en `{cabeceras, filas}`. Decidir qué columna es cuál es de
 * `ctp-formatos-serfor`, que es puro y se prueba sin abrir un archivo.
 */

import { detectarFormato, type FormatoCtp } from "./ctp-formatos-serfor";

export type HojaLeida = {
  nombre: string;
  cabeceras: unknown[];
  filas: unknown[][];
  /** Fila del Excel donde está la cabecera (1-based), para numerar bien los errores. */
  filaCabecera: number;
  formato: FormatoCtp | null;
  confianza: number;
};

/** Cuántas filas se miran buscando la cabecera antes de rendirse. */
const MAX_FILAS_PREAMBULO = 25;

/**
 * Encuentra la fila de cabecera de una hoja.
 *
 * Es la primera fila cuyo contenido hace que `detectarFormato` reconozca algo:
 * en vez de adivinar por posición o por «la que tenga más celdas», se usa el
 * mismo criterio que después va a mapear las columnas. Si ninguna fila del
 * preámbulo es reconocible, la hoja no es del libro.
 */
export function ubicarCabecera(filas: readonly unknown[][]): {
  indice: number;
  formato: FormatoCtp;
  confianza: number;
} | null {
  const tope = Math.min(filas.length, MAX_FILAS_PREAMBULO);
  for (let i = 0; i < tope; i++) {
    const fila = filas[i];
    if (!fila || fila.filter((c) => c != null && String(c).trim() !== "").length < 4) continue;
    const det = detectarFormato(fila);
    if (!det) continue;

    /* El libro real trae la cabecera en DOS filas: la de arriba pone «ESPECIE»
       agrupando, y la de abajo la desdobla en «Nombre Común» y «Nombre
       Científico». Las columnas que no se agrupan aparecen en las dos, así que
       la de arriba también pasa como cabecera válida — y quedarse con ella deja
       la fila de abajo entrando como si fuera un dato.
       Si la siguiente es del mismo formato y reconoce MÁS columnas, esa es la
       buena. */
    const siguiente = filas[i + 1];
    if (siguiente) {
      const detSig = detectarFormato(siguiente);
      if (detSig && detSig.formato === det.formato && detSig.confianza > det.confianza) {
        return { indice: i + 1, formato: detSig.formato, confianza: detSig.confianza };
      }
    }
    return { indice: i, formato: det.formato, confianza: det.confianza };
  }
  return null;
}

/** Separa una línea de CSV respetando las comillas y el separador del archivo. */
export function partirLineaCsv(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      /* Dos comillas seguidas dentro de un campo son una comilla literal. */
      if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else enComillas = !enComillas;
    } else if (c === sep && !enComillas) {
      out.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  out.push(actual);
  return out.map((s) => s.trim());
}

/**
 * El separador del CSV: `;` o `,`.
 *
 * Se decide por cuál aparece más en la primera línea, no por el locale: un
 * export en es-PE usa `;` (porque la coma es decimal) pero el mismo archivo
 * bajado en inglés viene con `,`, y el operador no sabe cuál tiene.
 */
export function detectarSeparador(primeraLinea: string): string {
  const puntoYComa = (primeraLinea.match(/;/g) ?? []).length;
  const comas = (primeraLinea.match(/,/g) ?? []).length;
  return puntoYComa >= comas ? ";" : ",";
}

/** Convierte el texto de un CSV en filas crudas. */
export function leerCsv(texto: string): unknown[][] {
  /* El BOM de Excel se cuela como primer carácter y rompe la primera cabecera. */
  const limpio = texto.replace(/^﻿/, "");
  const lineas = limpio.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length === 0) return [];
  const sep = detectarSeparador(lineas[0]);
  return lineas.map((l) => partirLineaCsv(l, sep));
}

/**
 * Lee el archivo entero y devuelve una hoja por cada formato reconocido.
 *
 * Acepta el Excel del SNIFFS (una hoja por consulta), un libro con varias hojas
 * y un CSV suelto. Una hoja que no se reconoce se devuelve igual con
 * `formato: null` para que la pantalla lo diga en vez de ignorarla en silencio.
 */
export async function leerArchivoSerfor(file: File): Promise<HojaLeida[]> {
  const esCsv = /\.csv$/i.test(file.name);

  if (esCsv) {
    const filas = leerCsv(await file.text());
    const cab = ubicarCabecera(filas);
    return [
      {
        nombre: file.name,
        cabeceras: cab ? filas[cab.indice] : (filas[0] ?? []),
        filas: cab ? filas.slice(cab.indice + 1) : filas.slice(1),
        filaCabecera: (cab?.indice ?? 0) + 1,
        formato: cab?.formato ?? null,
        confianza: cab?.confianza ?? 0,
      },
    ];
  }

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const hojas: HojaLeida[] = [];
  wb.eachSheet((ws) => {
    const filas: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      /* `row.values` viene 1-based con un hueco en 0: se descarta para que los
         índices coincidan con los del mapeo, que es 0-based. */
      const vals = (row.values as unknown[]) ?? [];
      filas.push(vals.slice(1).map((v) => normalizarCeldaExcel(v)));
    });
    const cab = ubicarCabecera(filas);
    hojas.push({
      nombre: ws.name,
      cabeceras: cab ? filas[cab.indice] : (filas[0] ?? []),
      filas: cab ? filas.slice(cab.indice + 1) : [],
      filaCabecera: (cab?.indice ?? 0) + 1,
      formato: cab?.formato ?? null,
      confianza: cab?.confianza ?? 0,
    });
  });
  return hojas;
}

/**
 * Aplana lo que ExcelJS devuelve en una celda.
 *
 * Una celda con fórmula llega como `{formula, result}` y una con texto rico como
 * `{richText:[…]}`: sin desarmarlos, `String(v)` da «[object Object]» y esa
 * cabecera no matchea con nada.
 */
function normalizarCeldaExcel(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return o.result ?? null;
    if ("text" in o) return o.text ?? null;
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    if ("hyperlink" in o && "text" in o) return o.text;
    return null;
  }
  return v;
}
