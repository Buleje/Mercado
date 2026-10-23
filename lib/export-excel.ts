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
export async function exportSheetsToExcel(hojas: HojaExcel[], filename: string, opciones: { sinMembrete?: boolean } = {}): Promise<void> {
  const conDatos = hojas.filter((h) => h.filas.length > 0);
  if (conDatos.length === 0) return;
  if (typeof window === "undefined") {
    throw new Error("exportSheetsToExcel solo se puede usar en el browser");
  }

  // Lazy import: ~1 MB, solo cuando se necesita
  const ExcelJS = (await import("exceljs")).default;

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  // Membrete del negocio (ADR-514): nombre, RUC y fecha arriba de cada hoja; el logo si carga.
  let titulo: { nombre: string; linea: string; logo: { dataUrl: string; ancho: number; alto: number } | null } | null = null;
  if (!opciones.sinMembrete) {
    try {
      const { membreteDelDocumento } = await import("@/lib/documentos/membrete-cargar");
      const { datosDelMembrete, emitidoEnLima } = await import("@/lib/documentos/membrete-pdf");
      const d = datosDelMembrete(await membreteDelDocumento(), { tipo: "Reporte" });
      if (d.titulo !== "Documento") {
        titulo = { nombre: d.titulo, linea: [...d.datos.slice(0, 2), `Emitido el ${emitidoEnLima(new Date())}`].join("  ·  "), logo: d.logo };
      }
    } catch {
      titulo = null; // sin membrete el archivo sale igual, con sus tablas
    }
  }
  workbook.creator = titulo?.nombre ?? "Mi negocio";

  for (const hoja of conDatos) {
    // Excel corta los nombres de hoja en 31 caracteres y rechaza []:*?/\
    const worksheet = workbook.addWorksheet(hoja.nombre.replace(/[[\]:*?/\\]/g, "-").slice(0, 31));

    const headers = Object.keys(hoja.filas[0]);
    worksheet.columns = headers.map((header) => ({
      key: header,
      width: Math.min(Math.max(header.length + 2, 12), 40),
    }));

    // Filas de título (nombre del negocio, datos, hoja) y una en blanco antes de la tabla.
    let filaEncabezado = 1;
    if (titulo) {
      const conLogo = !!titulo.logo;
      const col = conLogo ? 2 : 1;
      worksheet.getCell(1, col).value = titulo.nombre;
      worksheet.getCell(1, col).font = { bold: true, size: 14 };
      worksheet.getCell(2, col).value = titulo.linea;
      worksheet.getCell(2, col).font = { size: 9, color: { argb: "FF4B5563" } };
      worksheet.getCell(3, col).value = hoja.nombre;
      worksheet.getCell(3, col).font = { bold: true, size: 10, color: { argb: "FF007F7A" } };
      for (const f of [1, 2, 3]) worksheet.getRow(f).height = conLogo ? 20 : 16;
      if (titulo.logo) {
        const alto = 54;
        const ancho = Math.min(Math.round((alto * titulo.logo.ancho) / titulo.logo.alto), 85);
        const id = workbook.addImage({ base64: titulo.logo.dataUrl, extension: "png" });
        worksheet.addImage(id, { tl: { col: 0.05, row: 0.1 }, ext: { width: ancho, height: Math.round((ancho * titulo.logo.alto) / titulo.logo.ancho) } });
      }
      filaEncabezado = 5;
    }
    const filaTitulos = worksheet.getRow(filaEncabezado);
    headers.forEach((h, i) => (filaTitulos.getCell(i + 1).value = h));
    filaTitulos.font = { bold: true };
    filaTitulos.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    worksheet.views = [{ state: "frozen", ySplit: filaEncabezado }];

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
