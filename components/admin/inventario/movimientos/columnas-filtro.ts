/**
 * Filtros y orden por columna de las tres tablas de Entradas y salidas /
 * Vencimientos (Brandon 25-10: «filtros tipo Excel en el encabezado»). Aquí
 * sólo las columnas que la barra de la vista NO filtra ya: el período, el tipo
 * o la causa y el buscador siguen donde estaban, y no se repiten en el `<th>`.
 */
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { rotuloDe, type FilaMovimiento } from "./TablaMovimientos";
import type { FilaPerdida } from "./TablaPerdidas";
import type { LoteConDias } from "./vencimientos";

const dia = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);
const instante = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const valorDeLote = (l: LoteConDias) => (l.costUnit > 0 ? Math.round(l.quantity * l.costUnit * 100) / 100 : null);

export const COLUMNAS_MOVIMIENTOS: readonly ColumnaFiltro<FilaMovimiento>[] = [
  { id: "cantidad", label: "Cantidad", tipo: "rango", numero: (m) => m.quantity, paso: 1 },
  { id: "stock", label: "Stock", tipo: "rango", numero: (m) => m.newStock, paso: 1 },
];
export const ORDEN_MOVIMIENTOS: Record<string, AccesorOrden<FilaMovimiento>> = {
  cuando: { valor: (m) => instante(m.createdAt) },
  producto: { valor: (m) => m.productName, texto: true },
  movimiento: { valor: (m) => rotuloDe(m), texto: true },
  cantidad: { valor: (m) => (m.dir === "in" ? m.quantity : m.dir === "out" ? -m.quantity : 0) },
  stock: { valor: (m) => m.newStock },
};

export const COLUMNAS_PERDIDAS_FILTRO: readonly ColumnaFiltro<FilaPerdida>[] = [
  { id: "cantidad", label: "Cantidad", tipo: "rango", numero: (p) => p.quantity, paso: 1 },
  { id: "costo", label: "Costo u.", tipo: "rango", numero: (p) => (p.costo > 0 ? p.costo : null), unidad: "S/", paso: 0.01 },
  { id: "perdida", label: "Pérdida", tipo: "rango", numero: (p) => p.perdida, unidad: "S/", paso: 0.01 },
];
export const ORDEN_PERDIDAS: Record<string, AccesorOrden<FilaPerdida>> = {
  fecha: { valor: (p) => instante(p.createdAt) },
  producto: { valor: (p) => p.productName, texto: true },
  cantidad: { valor: (p) => p.quantity },
  costo: { valor: (p) => (p.costo > 0 ? p.costo : null) },
  perdida: { valor: (p) => p.perdida },
  motivo: { valor: (p) => p.lossType ?? "", texto: true },
};

export const COLUMNAS_LOTES: readonly ColumnaFiltro<LoteConDias>[] = [
  { id: "cantidad", label: "Cantidad", tipo: "rango", numero: (l) => l.quantity, paso: 1 },
  { id: "vence", label: "Vence", tipo: "fecha", numero: (l) => dia(l.expiryDate) },
  { id: "valor", label: "Valor", tipo: "rango", numero: valorDeLote, unidad: "S/", paso: 0.01 },
];
export const ORDEN_LOTES: Record<string, AccesorOrden<LoteConDias>> = {
  producto: { valor: (l) => l.productName, texto: true },
  cantidad: { valor: (l) => l.quantity },
  vence: { valor: (l) => dia(l.expiryDate) },
  valor: { valor: valorDeLote },
};
