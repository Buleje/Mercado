/**
 * reporte-export.ts — la puerta del reporte mensual del cuaderno de combustible:
 * PDF (papel para SUNAT) y Excel (una hoja por tabla). Cada uno vive en su
 * archivo; lo común (números, fechas, bloques dato → valor) en reporte-formato.ts.
 */
export { descargarReportePdf } from "./reporte-pdf";
export { descargarReporteExcel } from "./reporte-excel";
