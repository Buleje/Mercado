/**
 * hoja-calculo — leer y escribir planillas del drive del panel.
 *
 * Permite abrir un .xlsx/.csv guardado en Documentación, editarlo y devolverlo
 * al mismo lugar como una versión nueva, sin bajar el archivo, abrir Excel y
 * volver a subirlo a mano.
 *
 * Usa `exceljs`, que ya estaba en el proyecto (lo usan los exports), así que no
 * suma dependencias. La conversión es a MATRIZ DE TEXTO: es lo que la grilla
 * del editor sabe mostrar y lo que sobrevive a un ida y vuelta sin sorpresas.
 *
 * LÍMITE QUE HAY QUE TENER PRESENTE: esto edita VALORES, no la planilla
 * entera. Al reescribir el archivo se conservan los datos y el ancho de
 * columna, pero NO las fórmulas (se guarda su resultado), ni gráficos, ni
 * formato condicional, ni tablas dinámicas. Por eso el editor avisa antes de
 * guardar cuando detecta fórmulas.
 */

/** Tipos de archivo que el editor de planillas puede abrir. */
export const MIMES_HOJA = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls (se lee si en realidad es xlsx)
  "text/csv",
  "application/csv",
] as const;

export interface HojaDatos {
  nombre: string;
  /** Filas × columnas, ya como texto listo para mostrar. */
  filas: string[][];
  /** true si alguna celda tenía una fórmula (se guardaría su resultado). */
  tieneFormulas: boolean;
}

export interface LibroDatos {
  hojas: HojaDatos[];
  /** Formato de origen: define cómo se vuelve a escribir. */
  formato: "xlsx" | "csv";
}

/** ¿Este documento se puede abrir en el editor de planillas? */
export function esHojaEditable(mimeType: string | null | undefined, nombre?: string | null): boolean {
  const m = (mimeType ?? "").toLowerCase();
  if ((MIMES_HOJA as readonly string[]).includes(m)) return true;
  // El mime que llega del navegador no siempre es fiable: se mira la extensión.
  const n = (nombre ?? "").toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".csv");
}

/**
 * ¿Se puede MOSTRAR como planilla? Incluye .ods, que se lee pero NO se edita:
 * el editor guarda en xlsx y devolver un xlsx donde había un ods sería
 * romperle el archivo al que lo abre en LibreOffice.
 */
export function esHojaLegible(mimeType: string | null | undefined, nombre?: string | null): boolean {
  if (esHojaEditable(mimeType, nombre)) return true;
  const m = (mimeType ?? "").toLowerCase();
  const n = (nombre ?? "").toLowerCase();
  return m.includes("opendocument.spreadsheet") || n.endsWith(".ods");
}

export function formatoDe(mimeType: string | null | undefined, nombre?: string | null): "xlsx" | "csv" {
  const m = (mimeType ?? "").toLowerCase();
  const n = (nombre ?? "").toLowerCase();
  if (m.includes("csv") || n.endsWith(".csv")) return "csv";
  return "xlsx";
}

/** Celda de exceljs → texto. Las fórmulas muestran su resultado calculado. */
function celdaATexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Fórmula: { formula, result }
    if ("result" in o) return celdaATexto(o.result);
    if ("text" in o) return String(o.text);
    // Rich text: { richText: [{ text }] }
    if (Array.isArray(o.richText)) return o.richText.map((r) => String((r as { text?: string }).text ?? "")).join("");
    if ("error" in o) return String(o.error);
  }
  return String(v);
}

function tieneFormula(v: unknown): boolean {
  return typeof v === "object" && v !== null && "formula" in (v as Record<string, unknown>);
}

/**
 * CSV → matriz. Respeta comillas dobles y separadores dentro de comillas,
 * que es donde fallan los `split(",")` caseros.
 */
export function parsearCsv(texto: string, sep = ","): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; }  // "" escapada
        else enComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"') { enComillas = true; continue; }
    if (c === sep) { fila.push(celda); celda = ""; continue; }
    if (c === "\n") { fila.push(celda); filas.push(fila); fila = []; celda = ""; continue; }
    if (c === "\r") continue;
    celda += c;
  }
  if (celda !== "" || fila.length > 0) { fila.push(celda); filas.push(fila); }
  return filas;
}

/** Matriz → CSV, citando sólo lo que lo necesita. */
export function generarCsv(filas: string[][], sep = ","): string {
  const esc = (v: string) => (new RegExp(`["${sep}\n\r]`).test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return filas.map((f) => f.map((c) => esc(c ?? "")).join(sep)).join("\r\n");
}

/** Normaliza a matriz rectangular: la grilla necesita todas las filas iguales. */
export function rectangular(filas: string[][], minFilas = 1, minCols = 1): string[][] {
  const cols = Math.max(minCols, ...filas.map((f) => f.length), 1);
  const out = filas.map((f) => {
    const copia = [...f];
    while (copia.length < cols) copia.push("");
    return copia;
  });
  while (out.length < minFilas) out.push(new Array(cols).fill(""));
  return out;
}

/** Lee un .xlsx (ArrayBuffer) a matrices de texto. `exceljs` se carga on-demand. */
export async function leerXlsx(datos: ArrayBuffer): Promise<HojaDatos[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(datos);

  const hojas: HojaDatos[] = [];
  wb.eachSheet((ws) => {
    const filas: string[][] = [];
    let formulas = false;
    ws.eachRow({ includeEmpty: true }, (row) => {
      const celdas: string[] = [];
      // `row.values` es 1-based y su [0] es undefined.
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      for (const v of vals) {
        if (tieneFormula(v)) formulas = true;
        celdas.push(celdaATexto(v));
      }
      filas.push(celdas);
    });
    hojas.push({ nombre: ws.name, filas: rectangular(filas, 1, 1), tieneFormulas: formulas });
  });

  if (hojas.length === 0) hojas.push({ nombre: "Hoja1", filas: [[""]], tieneFormulas: false });
  return hojas;
}

/**
 * Matrices → .xlsx. Los números que se ven como número se guardan COMO número
 * (si no, Excel los trata como texto y no se pueden sumar).
 */
export async function escribirXlsx(hojas: HojaDatos[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  for (const h of hojas.length > 0 ? hojas : [{ nombre: "Hoja1", filas: [[""]], tieneFormulas: false }]) {
    const ws = wb.addWorksheet(h.nombre || "Hoja1");
    for (const fila of h.filas) {
      ws.addRow(fila.map((celda) => convertirValor(celda)));
    }
    // Ancho legible por columna, sin pasarse.
    const cols = Math.max(...h.filas.map((f) => f.length), 1);
    for (let c = 1; c <= cols; c++) {
      const largo = Math.max(...h.filas.map((f) => (f[c - 1] ?? "").length), 8);
      ws.getColumn(c).width = Math.min(60, largo + 2);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/**
 * "12,5" y "1.234,56" son números para un usuario peruano, pero `Number()` los
 * da NaN. Se prueban ambas convenciones antes de rendirse y dejarlo como texto.
 */
function convertirValor(celda: string): string | number {
  const t = (celda ?? "").trim();
  if (t === "") return "";
  // Ojo: no convertir códigos que empiezan en 0 (ej. "007") ni cosas como "1e5".
  if (/^0\d+$/.test(t)) return t;
  const directo = Number(t);
  if (Number.isFinite(directo) && /^-?[\d.]+$/.test(t)) return directo;
  const conComa = Number(t.replace(/\./g, "").replace(",", "."));
  if (Number.isFinite(conComa) && /^-?[\d.,]+$/.test(t)) return conComa;
  return t;
}
