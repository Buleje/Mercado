/**
 * Browser helper para exportar datos a Excel.
 *
 * Usa `exceljs` (en lugar de `xlsx` que tiene Prototype Pollution + ReDoS sin fix —
 * GHSA-4r6h-8v6p-xvw6 y GHSA-5pgg-2g8v-p4x9, ver ADR-025).
 *
 * El import es dinámico para que `exceljs` solo se descargue cuando el usuario
 * realmente toca el botón "Exportar a Excel" (mantiene el bundle del admin liviano).
 */

export interface HojaExcel {
  nombre: string;
  filas: Record<string, unknown>[];
}

/**
 * Varias tablas en UN archivo, una hoja cada una.
 *
 * Llamar `exportToExcel` N veces NO da N hojas: da N archivos sueltos, y el
 * navegador bloquea la segunda descarga automática. Un reporte que son tres
 * tablas distintas se baja de acá.
 *
 * Las hojas vacías se saltan (una hoja sin filas no tiene ni encabezados), pero
 * si TODAS están vacías no se descarga nada — como el helper de una tabla.
 */
export async function exportSheetsToExcel(hojas: HojaExcel[], filename: string): Promise<void> {
  const conDatos = hojas.filter((h) => h.filas.length > 0);
  if (conDatos.length === 0) return;
  if (typeof window === "undefined") {
    throw new Error("exportSheetsToExcel solo se puede usar en el browser");
  }

  // Lazy import: ~1 MB, solo cuando se necesita
  const ExcelJS = (await import("exceljs")).default;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Buleje ERP";
  workbook.created = new Date();

  for (const hoja of conDatos) {
    // Excel corta los nombres de hoja en 31 caracteres y rechaza []:*?/\
    const worksheet = workbook.addWorksheet(hoja.nombre.replace(/[[\]:*?/\\]/g, "-").slice(0, 31));

    // Headers desde las keys del primer objeto
    const headers = Object.keys(hoja.filas[0]);
    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.min(Math.max(header.length + 2, 12), 40),
    }));

    // Estilizar header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };

    for (const row of hoja.filas) {
      worksheet.addRow(row);
    }
  }

  // Generar buffer y disparar download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Una sola tabla, un solo archivo. Atajo sobre `exportSheetsToExcel`. */
export async function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = "Datos",
): Promise<void> {
  return exportSheetsToExcel([{ nombre: sheetName, filas: data }], filename);
}
