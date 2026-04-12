"use client";

/**
 * hooks/use-table-export.ts — Roadmap item #37
 *
 * Hook universal para exportar tablas admin a CSV.
 * Reemplaza 20+ implementaciones duplicadas con 1 fuente de verdad.
 *
 * Uso:
 *   const { exportCSV, exporting } = useTableExport();
 *   <button onClick={() => exportCSV(data, columns, "ventas")}>Exportar CSV</button>
 */

import { useState, useCallback } from "react";

export interface ExportColumn {
  key: string;
  label: string;
  /** Funcion para formatear el valor antes de exportar */
  format?: (value: unknown) => string;
}

export function useTableExport() {
  const [exporting, setExporting] = useState(false);

  const exportCSV = useCallback(
    (data: Record<string, unknown>[], columns: ExportColumn[], filename: string) => {
      setExporting(true);

      try {
        // Header
        const header = columns.map((c) => `"${c.label}"`).join(",");

        // Rows
        const rows = data.map((row) =>
          columns
            .map((col) => {
              const raw = row[col.key];
              const value = col.format ? col.format(raw) : String(raw ?? "");
              // Escapar comillas dobles y envolver en comillas
              return `"${value.replace(/"/g, '""')}"`;
            })
            .join(","),
        );

        const csv = [header, ...rows].join("\n");

        // BOM para Excel en español
        const bom = "\uFEFF";
        const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });

        // Descargar
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } finally {
        setExporting(false);
      }
    },
    [],
  );

  return { exportCSV, exporting };
}
