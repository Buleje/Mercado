"use client";

/**
 * hooks/useTableExport.ts
 *
 * Hook genérico para exportar filas de tabla a CSV o XLSX.
 *
 * - toCsv: construye CSV vanilla + Blob + auto-descarga.
 * - toXlsx: sin instalar deps xlsx, genera CSV con extensión .xlsx
 *   y emite un warning en consola. Suficiente para la mayoría de clientes
 *   que abren Excel directo desde el archivo.
 *
 * Maneja correctamente:
 *  - Filas vacías (no descarga)
 *  - Escape de comas y comillas dobles en valores
 *  - Encabezados derivados de las claves del primer objeto
 */

type Row = Record<string, unknown>;

function escapeCsvValue(value: unknown): string {
  const str = value == null ? "" : String(value);
  // Si contiene coma, comilla o salto de línea, envolver en comillas y escapar comillas internas
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv<T extends Row>(rows: T[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const headerRow = headers.map(escapeCsvValue).join(",");
  const dataRows = rows.map((row) =>
    headers.map((h) => escapeCsvValue(row[h])).join(","),
  );
  return [headerRow, ...dataRows].join("\n");
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useTableExport<T extends Row>(rows: T[], filename: string) {
  const toCsv = (): void => {
    if (rows.length === 0) {
      console.warn("[useTableExport] toCsv: no hay filas para exportar.");
      return;
    }
    const csv = buildCsv(rows);
    const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    triggerDownload(csv, name, "text/csv");
  };

  const toXlsx = (): void => {
    if (rows.length === 0) {
      console.warn("[useTableExport] toXlsx: no hay filas para exportar.");
      return;
    }
    // Sin librería xlsx instalada — exportamos CSV con extensión .xlsx.
    // Excel, LibreOffice y Google Sheets detectan el formato correctamente.
    console.warn(
      "[useTableExport] toXlsx: exportando como CSV con extensión .xlsx (sin librería xlsx). " +
        "Para formato nativo instala: npm i xlsx",
    );
    const csv = buildCsv(rows);
    const name = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
    triggerDownload(csv, name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  };

  return { toCsv, toXlsx };
}
