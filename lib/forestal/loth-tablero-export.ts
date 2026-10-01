/**
 * Excel para OSINFOR del tablero de trozas.
 *
 * Tres hojas: «Resumen» (una fila por estado + el total, con los códigos del
 * permiso arriba), «Trozas» (TODAS las columnas, las visibles o no) y «Cómo
 * se lee». Los valores y los rótulos salen de `loth-tablero-columnas.ts`, los
 * mismos que la pantalla: un Excel que dice otra cosa que la tabla no sirve
 * de respaldo.
 *
 * Usa `exceljs` con import dinámico (ya en el proyecto; no pesa en el bundle
 * de la vista hasta que alguien exporta).
 */

import {
  filasParaExcel,
  nombreArchivoExport,
  resumenParaExcel,
  type HojaExport,
  type TipoColumna,
  type ValorCelda,
} from "./loth-tablero-columnas";
import { resumirTablero, type TrozaTablero } from "./loth-tablero-trozas";

export interface PermisoExport {
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
  titularName?: string | null;
  resolucionNumber?: string | null;
}

const FORMATO: Record<TipoColumna, string | undefined> = {
  texto: undefined,
  numero: "0",
  m3: "#,##0.000",
  metros: "0.00",
  fecha: "dd/mm/yyyy",
  dias: "0",
};

const ANCHO: Record<TipoColumna, number> = { texto: 18, numero: 10, m3: 12, metros: 11, fecha: 12, dias: 10 };

/** `YYYY-MM-DD…` → Date a mediodía UTC (date-only: sin el día corrido de Lima). */
function celda(v: ValorCelda, tipo: TipoColumna): string | number | Date | null {
  if (v == null) return null;
  if (tipo === "fecha" && typeof v === "string") {
    const d = new Date(`${v.slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? v : d;
  }
  return v;
}

export async function exportarTableroExcel(
  filas: readonly TrozaTablero[],
  permiso: PermisoExport | null | undefined,
  hoy: Date = new Date(),
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const VERDE = "FF14532D";

  type Hoja = ReturnType<typeof wb.addWorksheet>;
  const volcar = (ws: Hoja, h: HojaExport) => {
    ws.columns = h.columnas.map((c) => ({
      header: c.label,
      width: Math.max(ANCHO[c.tipo], c.label.length + 2),
      style: FORMATO[c.tipo] ? { numFmt: FORMATO[c.tipo] } : {},
    }));
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    for (const f of h.filas) ws.addRow(f.map((v, i) => celda(v, h.columnas[i].tipo)));
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  /* Resumen: primero los códigos que amparan todo, después las cifras. */
  const rs = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: VERDE } } });
  rs.addRow(["CONTROL DEL PERMISO — ESTADO DE LAS TROZAS"]).font = { bold: true, size: 14 };
  const kv = (k: string, v: string | null | undefined) => {
    const r = rs.addRow([k, v?.trim() || "—"]);
    r.getCell(1).font = { bold: true };
  };
  kv("Título habilitante", permiso?.tituloHabilitante);
  kv("N° registro del libro", permiso?.registroNumber);
  kv("Tomo", permiso?.tomo);
  kv("Resolución", permiso?.resolucionNumber);
  kv("Titular", permiso?.titularName);
  kv("Generado", hoy.toLocaleString("es-PE", { timeZone: "America/Lima" }));
  rs.addRow([]);
  const res = resumenParaExcel(resumirTablero(filas));
  const cab = rs.addRow(res.columnas.map((c) => c.label));
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  for (const f of res.filas) {
    const r = rs.addRow(f);
    r.getCell(3).numFmt = "#,##0.000";
    if (f[0] === "Total") r.font = { bold: true };
  }
  rs.getColumn(1).width = 26;
  rs.getColumn(2).width = 34;
  rs.getColumn(3).width = 14;
  rs.getColumn(4).width = 20;

  volcar(wb.addWorksheet("Trozas"), filasParaExcel(filas));

  const nota = wb.addWorksheet("Cómo se lee");
  nota.getColumn(1).width = 110;
  for (const linea of [
    "El estado de cada troza se deriva del Libro de Operaciones: Trozado → Despacho de trozas / Consumo. Las líneas anuladas no cuentan.",
    "«Sin trozado»: aparece despachada o consumida sin una línea de Trozado que la respalde (hueco del libro).",
    "«Días en patio»: en la que sigue en el patio, los días hasta hoy; en la que salió, del trozado a la salida.",
    "Placa, transportista, conductor y destino salen de la GTF (la línea de despacho del libro sólo guarda el N° de guía).",
    "Una celda vacía es un dato que el libro no tiene: no es cero.",
  ]) {
    nota.addRow([linea]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoExport(permiso?.tituloHabilitante, hoy);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
