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

import { existsSync } from "fs";
import path from "path";
import { logger } from "@/lib/logger";
import { extensionDe } from "./tipos-archivo";

/** Lo que entra en un cuadradito de 420 px sin volverse ilegible. */
const MAX_FILAS = 10;
const MAX_COLS = 5;
const MAX_LINEAS = 16;
const LADO = 420;

/**
 * ⚠️ El canvas nativo NO trae fuentes: en Linux, sin registrar una, cada letra
 * se dibuja como un cuadradito vacío (tofu) y la miniatura sale peor que el
 * ícono que reemplaza. Hay que registrar una explícitamente.
 */
const FAMILIA = "MiniaturaBuleje";

/** Candidatas, de la más confiable a la menos. Geist viaja dentro de `next`,
 *  así que existe también en el servidor de producción, no sólo en la máquina
 *  de desarrollo. Las del sistema son el plan B en local. */
const FUENTES = [
  "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
  "node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
];

/** `undefined` = todavía no se buscó; `null` = no hay ninguna disponible. */
let fuenteRegistrada: string | null | undefined;
/** Ruta del .ttf que se terminó usando (la reusa el registro para los PDF). */
let rutaFuente: string | null = null;

/**
 * Registra una fuente para el canvas. Devuelve la familia a usar, o `null` si
 * no se encontró ninguna — en ese caso NO hay que dibujar: sin fuente sólo
 * saldrían cuadraditos.
 */
export async function fuenteParaMiniaturas(): Promise<string | null> {
  if (fuenteRegistrada !== undefined) return fuenteRegistrada;

  const { GlobalFonts } = await import("@napi-rs/canvas");
  for (const candidata of FUENTES) {
    const ruta = candidata.startsWith("/") ? candidata : path.join(process.cwd(), candidata);
    if (!existsSync(ruta)) continue;
    try {
      if (GlobalFonts.registerFromPath(ruta, FAMILIA)) {
        fuenteRegistrada = FAMILIA;
        rutaFuente = ruta;
        return fuenteRegistrada;
      }
    } catch (err) {
      logger.warn("miniatura.fuente.fallo", { ruta, err: String(err) });
    }
  }

  // Último intento: barrer los directorios de fuentes del sistema, si los hay.
  for (const dir of ["/usr/share/fonts", "/usr/local/share/fonts"]) {
    if (!existsSync(dir)) continue;
    try {
      if (GlobalFonts.loadFontsFromDir(dir) > 0) {
        const alguna = GlobalFonts.families[0]?.family;
        if (alguna) {
          fuenteRegistrada = alguna;
          return fuenteRegistrada;
        }
      }
    } catch (err) {
      logger.warn("miniatura.fuente.sistema_fallo", { dir, err: String(err) });
    }
  }

  logger.warn("miniatura.sin_fuente", { intentadas: FUENTES.length });
  fuenteRegistrada = null;
  return null;
}

/**
 * Las 14 fuentes "estándar" que un PDF puede usar sin incrustarlas. Casi todo
 * PDF generado por un sistema (recibos, reportes) pide Helvetica y confía en
 * que el lector la tenga.
 */
const FUENTES_PDF = [
  // Las 14 estándar del formato PDF.
  "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
  "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
  "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
  "Symbol", "ZapfDingbats",
  // Las de Office, que son las que aparecen de verdad: un Excel exportado a PDF
  // pide Calibri, y un Word viejo, Times New Roman. Ninguna se incrusta y
  // ninguna existe en un servidor Linux — sin esto, la hoja sale en cuadraditos.
  "Calibri", "Calibri-Bold", "Calibri-Italic", "Calibri Light",
  "Arial", "Arial-Bold", "Arial-Italic", "Arial Narrow", "Arial Black", "ArialMT", "Arial-BoldMT",
  "Times New Roman", "TimesNewRoman", "TimesNewRomanPSMT",
  "Courier New", "CourierNew",
  "Cambria", "Candara", "Consolas", "Corbel", "Constantia",
  "Segoe UI", "Tahoma", "Verdana", "Georgia", "Trebuchet MS",
  "Century Gothic", "Garamond", "Book Antiqua", "Bookman Old Style",
  "Comic Sans MS", "Impact", "Lucida Sans", "Palatino Linotype", "Rockwell",
  "MS Sans Serif", "MS Gothic", "Wingdings", "Webdings",
  // Genéricas: algunos generadores escriben directamente el nombre de familia.
  "sans-serif", "serif", "monospace", "Sans", "Serif", "Mono",
];

let fuentesPdfListas = false;

/**
 * Deja disponibles las fuentes estándar antes de dibujar un PDF.
 *
 * pdf.js no incrusta esas fuentes: se las pide al sistema, y en un servidor
 * Linux pelado no hay ninguna — así que un recibo hecho con Helvetica se
 * renderizaba como una página de cuadraditos. Se registra la misma fuente que
 * usan las miniaturas bajo cada uno de esos nombres: no es idéntica a la
 * original, pero se lee, que es de lo que se trata.
 */
export async function asegurarFuentesPdf(datos?: Buffer | Uint8Array): Promise<void> {
  // Fuerza la búsqueda del .ttf (deja `rutaFuente` cargada).
  const familia = await fuenteParaMiniaturas();
  if (!familia || !rutaFuente) return;

  const { GlobalFonts } = await import("@napi-rs/canvas");
  const registrar = (nombre: string) => {
    if (!nombre || GlobalFonts.has(nombre)) return;
    try {
      // Se registra el MISMO archivo bajo cada nombre. `setAlias` no alcanza:
      // apunta al nombre interno de la fuente, no al alias con el que se
      // registró, así que pdf.js seguía sin encontrar "Helvetica".
      GlobalFonts.registerFromPath(rutaFuente!, nombre);
    } catch (err) {
      logger.warn("miniatura.alias_pdf.fallo", { nombre, err: String(err) });
    }
  };

  if (!fuentesPdfListas) {
    for (const nombre of FUENTES_PDF) registrar(nombre);
    fuentesPdfListas = true;
  }

  // Y lo que pida ESTE PDF en particular. Una lista fija nunca alcanza: un
  // informe hecho con la fuente de la empresa pide un nombre que no está en
  // ningún catálogo. Los nombres viajan en el propio archivo (`/BaseFont`), así
  // que se leen de ahí y se registran tal cual — incluido el prefijo de subset
  // (`ABCDEF+Calibri`), que es como pdf.js los busca.
  if (datos) {
    try {
      const texto = Buffer.from(datos.buffer ?? datos, 0, Math.min(datos.byteLength, 4 * 1024 * 1024)).toString("latin1");
      const vistos = new Set<string>();
      for (const m of texto.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-,._]{1,64})/g)) {
        const nombre = m[1];
        if (vistos.has(nombre)) continue;
        vistos.add(nombre);
        registrar(nombre);
        // "ABCDEF+Calibri-Bold" también se pide como "Calibri-Bold".
        const sinSubset = nombre.includes("+") ? nombre.split("+").pop()! : "";
        if (sinSubset) registrar(sinSubset);
      }
    } catch (err) {
      logger.warn("miniatura.fuentes_del_pdf.fallo", { err: String(err) });
    }
  }
}

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

/** Miniatura PNG de una planilla: una tablita con su encabezado. `null` si no
 *  hay fuente (dibujarla igual daría una grilla de cuadraditos). */
export async function dibujarPlanilla(filas: string[][]): Promise<Buffer | null> {
  const familia = await fuenteParaMiniaturas();
  if (!familia) return null;

  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(LADO, LADO);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LADO, LADO);

  const cols = Math.max(1, ...filas.map((f) => f.length));
  const anchoCol = LADO / Math.min(cols, MAX_COLS);
  const altoFila = Math.min(44, LADO / Math.max(filas.length, 7));

  ctx.font = `17px ${familia}`;
  ctx.textBaseline = "middle";

  // Una celda combinada de título llega repetida en todas las columnas ("GUÍAS
  // DE…" cinco veces). Se dibuja como una sola banda, que es como se ve en Excel.
  const primera = filas[0]?.filter((c) => c.trim()) ?? [];
  const tituloUnico =
    primera.length > 1 && primera.every((c) => c.trim() === primera[0].trim())
      ? primera[0].trim()
      : null;

  for (let f = 0; f < filas.length; f++) {
    const y = f * altoFila;

    if (f === 0 && tituloUnico) {
      ctx.fillStyle = "#e8f5f5";
      ctx.fillRect(0, y, LADO, altoFila);
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, y, LADO, altoFila);
      ctx.fillStyle = "#0f766e";
      ctx.font = `bold 17px ${familia}`;
      ctx.save();
      ctx.beginPath();
      ctx.rect(5, y, LADO - 10, altoFila);
      ctx.clip();
      ctx.fillText(tituloUnico, 8, y + altoFila / 2);
      ctx.restore();
      continue;
    }

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
      ctx.font = f === 0 ? `bold 17px ${familia}` : `17px ${familia}`;
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

/** Miniatura PNG de un documento: una hoja con sus primeras líneas. `null` si
 *  no hay fuente disponible. */
export async function dibujarDocumento(lineas: string[]): Promise<Buffer | null> {
  const familia = await fuenteParaMiniaturas();
  if (!familia) return null;

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
    ctx.font = esTitulo ? `bold 22px ${familia}` : `16px ${familia}`;
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
