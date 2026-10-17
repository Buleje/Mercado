import { formatDateNumeric } from "@/lib/format";
import type { Devolucion } from "./tipos";

/** Baja las devoluciones de la lista como CSV (con BOM para que Excel lea las tildes). */
export function exportarDevolucionesCSV(devoluciones: Devolucion[]): void {
  const header = ["ID", "Fecha", "Proveedor", "Motivo", "Estado", "Notas", "Items"];
  const rows = devoluciones.map((d) => [
    d.id,
    formatDateNumeric(d.createdAt),
    d.proveedorNombre,
    d.motivo,
    d.estado,
    d.notas ?? "",
    d.items.map((i) => `${i.cantidad} ${i.unidad} ${i.nombre}`).join("; "),
  ]);
  const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `devoluciones_proveedor_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
