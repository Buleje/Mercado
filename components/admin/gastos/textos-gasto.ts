/**
 * Lo que dice cada gasto anotado y los autofiltros de Excel de su tabla
 * (Brandon 25-10: «todas las tablas de Mi Plata, como Adelantos»).
 */
import { decodeExpenseDescription } from "@/lib/expense-meta";
import { formatCurrency } from "@/lib/format";
import { diaDelGasto } from "@/lib/gastos/lista-gastos";
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { GastoDeLaLista } from "./ListaGastos";

export const queDelGasto = (g: GastoDeLaLista) => decodeExpenseDescription(g.description).description.trim() || g.category;
export const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Factura F001-123 · IGV S/ 18.00» — lo que dice el papel del gasto, si tiene. */
export function papelDelGasto(e: GastoDeLaLista): string | null {
  if (!e.documentType || e.documentType === "sin_comprobante") return null;
  const tipo = conMayuscula(e.documentType);
  const igv = e.documentType === "factura" && e.igvAmount != null
    ? e.igvAmount > 0 ? ` · IGV ${formatCurrency(e.igvAmount)}` : " · exonerada"
    : "";
  return `${tipo}${e.documentNumber ? ` ${e.documentNumber}` : ""}${igv}`;
}

const ddmm = (v: number | string) => String(v).slice(0, 10).split("-").reverse().join("/");

export const COLUMNAS_FILTRO_GASTOS_ANOTADOS: readonly ColumnaFiltro<GastoDeLaLista>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (g) => diaDelGasto(g.date) || null, formatearValor: ddmm },
  { id: "categoria", label: "Categoría", tipo: "multi", valor: (g) => conMayuscula(g.category) },
  { id: "descripcion", label: "Descripción", tipo: "texto", valor: (g) => [queDelGasto(g), g.supplierName ?? "", papelDelGasto(g) ?? ""] },
  { id: "comprobante", label: "Comprobante", tipo: "multi", valor: (g) => (g.documentType && g.documentType !== "sin_comprobante" ? conMayuscula(g.documentType) : "Sin comprobante") },
  { id: "monto", label: "Monto", tipo: "rango", numero: (g) => Number(g.amount), paso: 1 },
];
