import "server-only";

/**
 * Libros para el contador — el .xlsx, armado en el SERVIDOR (exceljs en Node).
 * Hoja 1: la cabecera del formato (período, RUC, razón social), el aviso de
 * «de trabajo», los encabezados numerados como en el formato impreso, las filas
 * y la fila de totales. Hoja «Notas»: por qué cada columna vacía está vacía.
 */
import type { LibroContador } from "./comun";

export interface CabeceraLibro {
  ruc: string | null;
  razonSocial: string | null;
}

export async function libroAXlsx(libro: LibroContador, cabecera: CabeceraLibro): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Buleje";
  wb.created = new Date();

  const hoja = wb.addWorksheet(`${libro.formato} ${libro.libro}`);
  hoja.addRow([`FORMATO ${libro.formato}: ${libro.titulo.toUpperCase()} (DOCUMENTO DE TRABAJO)`]).font = { bold: true, size: 13 };
  hoja.addRow([`PERÍODO: ${libro.periodo.replace("-", "")}`]);
  hoja.addRow([`RUC: ${cabecera.ruc ?? "(no está en Configuración)"}`]);
  hoja.addRow([`APELLIDOS Y NOMBRES, DENOMINACIÓN O RAZÓN SOCIAL: ${cabecera.razonSocial ?? "(no está en Configuración)"}`]);
  hoja.addRow([libro.notas[0] ?? ""]).font = { italic: true };
  hoja.addRow([]);

  const encabezado = hoja.addRow(libro.columnas.map((c) => (c.numero ? `${c.numero}. ${c.rotulo}` : c.rotulo)));
  encabezado.font = { bold: true };
  encabezado.alignment = { wrapText: true, vertical: "top" };
  encabezado.height = 60;

  for (const f of libro.filas) hoja.addRow(libro.columnas.map((c) => f[c.clave] ?? null));

  if (libro.filas.length > 0) {
    const totales = hoja.addRow(libro.columnas.map((c, i) => (i === 0 ? "TOTALES" : c.soles && c.clave in libro.totales ? libro.totales[c.clave] : null)));
    totales.font = { bold: true };
  }

  libro.columnas.forEach((c, i) => {
    const col = hoja.getColumn(i + 1);
    col.width = c.soles ? 14 : Math.min(36, Math.max(12, Math.ceil(c.rotulo.length / 3)));
    if (c.soles) col.numFmt = "#,##0.00";
  });
  hoja.views = [{ state: "frozen", ySplit: 7 }];

  const notas = wb.addWorksheet("Notas");
  notas.getColumn(1).width = 140;
  notas.addRow(["Notas del libro: qué es dato, qué es cálculo y qué falta"]).font = { bold: true };
  for (const n of libro.notas) notas.addRow([n]).alignment = { wrapText: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
