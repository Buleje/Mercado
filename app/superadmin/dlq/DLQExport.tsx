"use client";

import { Download } from "@buleje/design-system/icons";

/**
 * Botón client para exportar el contenido del DLQ a CSV (RFC 4180 + BOM UTF-8).
 * Recibe filas ya aplanadas desde el Server Component padre (DLQBody) para
 * evitar refetch en el cliente.
 */
export function DLQExport({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  const onExport = () => {
    const esc = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
    const csv =
      "﻿" +
      [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join(
        "\r\n",
      );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dlq-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={rows.length === 0}
      title="Exportar CSV"
      className="inline-flex items-center gap-2 h-10 px-4 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
    >
      <Download className="w-4 h-4" />
      Exportar CSV
    </button>
  );
}
