/**
 * Browser helper para exportar datos a Excel.
 *
 * Usa `exceljs` (en lugar de `xlsx` que tiene Prototype Pollution + ReDoS sin fix —
 * GHSA-4r6h-8v6p-xvw6 y GHSA-5pgg-2g8v-p4x9, ver ADR-025).
 *
 * El import es dinámico para que `exceljs` solo se descargue cuando el usuario
 * realmente toca el botón "Exportar a Excel" (mantiene el bundle del admin liviano).
 */
export async function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = "Datos",
): Promise<void> {
  if (data.length === 0) return;
  if (typeof window === "undefined") {
    throw new Error("exportToExcel solo se puede usar en el browser");
  }

  // Lazy import: ~1 MB, solo cuando se necesita
  const ExcelJS = (await import("exceljs")).default;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bodega San Martin";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  // Headers desde las keys del primer objeto
  const headers = Object.keys(data[0]);
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

  // Filas
  for (const row of data) {
    worksheet.addRow(row);
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
