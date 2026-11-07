import "server-only";
import { leerCsv, leerExtracto, type ExtractoLeido } from "@/lib/finance/bank-reconciliation";

/**
 * Archivo del banco (CSV, TXT o XLSX) → movimientos, sin escribir nada.
 *
 * El `.xls` viejo (binario de Excel 97) no se lee: ExcelJS sólo abre `.xlsx`.
 * La ruta le pide al usuario que lo guarde como `.xlsx` o CSV.
 */

export type TipoExtracto = "csv" | "xlsx" | "xls" | "otro";

export function tipoDeExtracto(nombre: string): TipoExtracto {
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "txt") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  return "otro";
}

/**
 * Los CSV que baja la banca por internet a veces vienen en Windows-1252 (las
 * tildes de «Depósito» salen como `�` en UTF-8): si UTF-8 deja reemplazos, se
 * relee en latin1.
 */
export function decodificarTexto(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

/** Aplana lo que ExcelJS entrega en una celda (fórmula, texto rico, hipervínculo). */
function celdaExcel(v: unknown): unknown {
  if (v == null || v instanceof Date || typeof v !== "object") return v;
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
  if ("result" in o) return celdaExcel(o.result);
  if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
  if ("text" in o) return o.text;
  return null;
}

/** Primera hoja con filas del libro. */
async function filasDeXlsx(bytes: ArrayBuffer): Promise<unknown[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  for (const ws of wb.worksheets) {
    const filas: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      // `row.values` es 1-based con un hueco en 0.
      const vals = (row.values as unknown[]) ?? [];
      filas.push(vals.slice(1).map(celdaExcel));
    });
    if (filas.length > 0) return filas;
  }
  return [];
}

export async function leerArchivoDelBanco(nombre: string, bytes: ArrayBuffer): Promise<ExtractoLeido> {
  const tipo = tipoDeExtracto(nombre);
  if (tipo === "xlsx") return leerExtracto(await filasDeXlsx(bytes));
  return leerExtracto(leerCsv(decodificarTexto(bytes)));
}
