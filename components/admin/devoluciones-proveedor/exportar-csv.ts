import { formatDateNumeric } from "@/lib/format";
import { ESTADO_LABEL, valorDevolucion, type Devolucion } from "./tipos";

/** Baja las devoluciones de la lista como CSV (con BOM para que Excel lea las tildes). */
export function exportarDevolucionesCSV(devoluciones: Devolucion[]): void {
  // C51: el valor sale con su faltante; un vacío no se lee como S/ 0 en Excel.
  const header = ["ID", "Fecha", "Proveedor", "Motivo", "Estado", "Valor (S/)", "Ítems sin valorar", "Notas", "Items"];
  const rows = devoluciones.map((d) => {
    const v = valorDevolucion(d.items);
    return [
      d.id,
      formatDateNumeric(d.createdAt),
      d.proveedorNombre,
      d.motivo,
      ESTADO_LABEL[d.estado] ?? d.estado,
      v.sinPrecio === d.items.length && d.items.length > 0 ? "Pendiente de valoración" : v.total.toFixed(2),
      v.sinPrecio,
      d.notas ?? "",
      d.items.map((i) => `${i.cantidad} ${i.unidad} ${i.nombre}`).join("; "),
    ];
  });
  const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `devoluciones_proveedor_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
