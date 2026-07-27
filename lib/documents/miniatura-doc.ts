import "server-only";

/**
 * miniatura-doc — dibujar la carita de una planilla o un documento de texto.
 *
 * En la grilla del drive, un PDF muestra su primera página y una foto se ve
 * entera; un Excel y un Word eran un ícono verde y otro azul, todos iguales.
 * Con veinte archivos en pantalla, "cuál era la lista de precios buena" se
 * contestaba abriéndolos de a uno.
 *
 * Acá se lee el archivo en el servidor y se dibuja una miniatura de verdad: la
 * planilla como una tablita (con su fila de encabezado marcada) y el documento
 * como una hoja con sus primeras líneas. Es la misma idea que la miniatura del
 * PDF —una imagen cacheable— así que la grilla no paga nada extra.
 */

import { extensionDe } from "./tipos-archivo";

/** Lo que entra en un cuadradito de 420 px sin volverse ilegible. */
const MAX_FILAS = 10;
const MAX_COLS = 5;
const MAX_LINEAS = 16;
const LADO = 420;

/** Filas de una planilla, ya como texto. Devuelve `null` si no se pudo leer. */
export async function filasDePlanilla(
  datos: Buffer,
  nombre: string,
): Promise<string[][] | null> {
  const ext = extensionDe(nombre);
  try {
    if (ext === "csv" || ext === "tsv" || ext === "txt") {
      const sep = ext === "tsv" ? "\t" : ",";
      return texto(datos)
        .split(/\r?\n/)
        .slice(0, MAX_FILAS)
        .map((l) => l.split(sep).slice(0, MAX_COLS).map(limpiarComillas));
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(datos).buffer as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return null;
    const filas: string[][] = [];
    // `eachRow` salta las vacías, y una hoja que arranca en la fila 3 se vería
    // corrida: se leen por índice.
    for (let f = 1; f <= Math.min(ws.rowCount || 0, MAX_FILAS); f++) {
      const row = ws.getRow(f);
      const celdas: string[] = [];
      for (let c = 1; c <= MAX_COLS; c++) celdas.push(aTexto(row.getCell(c).value));
      filas.push(celdas);
    }
    return filas;
  } catch {
    return null;
  }
}

/** Primeras líneas de un documento de texto. `null` si no se pudo leer. */
export async function lineasDeDocumento(
  datos: Buffer,
  nombre: string,
): Promise<string[] | null> {
  const ext = extensionDe(nombre);
  try {
    if (ext === "docx" || ext === "odt") {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(datos);
      const ruta = ext === "docx" ? "word/document.xml" : "content.xml";
      const xml = await zip.file(ruta)?.async("string");
      if (!xml) return null;
      // Regex y no DOMParser: esto corre en Node, donde no hay DOM. Alcanza
      // para juntar el texto de cada párrafo, que es todo lo que se dibuja.
      const parrafos = ext === "docx"
        ? [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) =>
            [...m[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join(""))
        : [...xml.matchAll(/<text:(?:p|h)[^>]*>([\s\S]*?)<\/text:(?:p|h)>/g)].map((m) =>
            m[1].replace(/<[^>]+>/g, ""));
      return parrafos.map(desescapar).filter((t) => t.trim() !== "").slice(0, MAX_LINEAS);
    }
    return texto(datos).split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, MAX_LINEAS);
  } catch {
    return null;
  }
}

/** Miniatura PNG de una planilla: una tablita con su encabezado. */
export async function dibujarPlanilla(filas: string[][]): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(LADO, LADO);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LADO, LADO);

  const cols = Math.max(1, ...filas.map((f) => f.length));
  const anchoCol = LADO / Math.min(cols, MAX_COLS);
  const altoFila = Math.min(44, LADO / Math.max(filas.length, 7));

  ctx.font = "17px sans-serif";
  ctx.textBaseline = "middle";

  for (let f = 0; f < filas.length; f++) {
    const y = f * altoFila;
    // La primera fila con datos se pinta como encabezado: es lo que hace que
    // la miniatura se lea como "una tabla" y no como manchas de texto.
    if (f === 0) {
      ctx.fillStyle = "#e8f5f5";
      ctx.fillRect(0, y, LADO, altoFila);
    } else if (f % 2 === 1) {
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(0, y, LADO, altoFila);
    }
    for (let c = 0; c < Math.min(cols, MAX_COLS); c++) {
      const x = c * anchoCol;
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, anchoCol, altoFila);
      const valor = (filas[f]?.[c] ?? "").trim();
      if (!valor) continue;
      ctx.fillStyle = f === 0 ? "#0f766e" : "#111827";
      ctx.font = f === 0 ? "bold 17px sans-serif" : "17px sans-serif";
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 3, y, anchoCol - 6, altoFila);
      ctx.clip();
      ctx.fillText(valor, x + 5, y + altoFila / 2);
      ctx.restore();
    }
  }
  return canvas.toBuffer("image/png");
}

/** Miniatura PNG de un documento: una hoja con sus primeras líneas. */
export async function dibujarDocumento(lineas: string[]): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(LADO, LADO);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LADO, LADO);
  // Margen de hoja: da la sensación de documento y no de bloque de texto.
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, LADO, 14);

  ctx.textBaseline = "top";
  let y = 30;
  for (const [i, linea] of lineas.entries()) {
    const esTitulo = i === 0;
    ctx.font = esTitulo ? "bold 22px sans-serif" : "16px sans-serif";
    ctx.fillStyle = esTitulo ? "#0f172a" : "#334155";
    for (const trozo of envolver(ctx, linea, LADO - 56)) {
      if (y > LADO - 24) return canvas.toBuffer("image/png");
      ctx.fillText(trozo, 28, y);
      y += esTitulo ? 30 : 24;
    }
    y += esTitulo ? 8 : 3;
  }
  return canvas.toBuffer("image/png");
}

// ── Auxiliares ───────────────────────────────────────────────────────────────

function texto(datos: Buffer): string {
  return new TextDecoder("utf-8").decode(new Uint8Array(datos)).slice(0, 20_000);
}

function limpiarComillas(v: string): string {
  const t = v.trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t;
}

function desescapar(v: string): string {
  return v
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Valor de exceljs → texto corto (los objetos serían "[object Object]"). */
function aTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toLocaleDateString("es-PE");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return o.richText.map((r) => String((r as { text?: string }).text ?? "")).join("");
    if ("result" in o) return aTexto(o.result);
    if ("text" in o) return aTexto(o.text);
    if ("error" in o) return String(o.error);
  }
  return String(v);
}

type Ctx2D = { measureText(t: string): { width: number } };

/** Corta una línea larga en varias que entren en `ancho`. */
function envolver(ctx: Ctx2D, linea: string, ancho: number): string[] {
  const palabras = linea.split(/\s+/);
  const out: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && actual) {
      out.push(actual);
      actual = p;
    } else {
      actual = prueba;
    }
    if (out.length >= 3) break;   // en una miniatura, 3 renglones por párrafo
  }
  if (actual) out.push(actual);
  return out;
}
