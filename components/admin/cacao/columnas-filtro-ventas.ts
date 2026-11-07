import { ESTADO_PAGO_LABEL, type CacaoEstadoPago } from "@/lib/cacao/cacao-quality";
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";

export interface Venta {
  id: string;
  ventaCode: string;
  fecha: string;
  compradorNombre: string | null;
  canal: string | null;
  loteCode: string | null;
  pesoKg: string;
  moneda: string;
  precioPorKg: string | null;
  tipoCambio: string | null;
  totalPen: string | null;
  montoCobrado: string | null;
  estadoPago: string;
  esFob: boolean;
  variedad: string | null;
  grado: string | null;
  status: string;
}

export const CANAL_LABEL: Record<string, string> = {
  cooperativa: "Cooperativa",
  exportador: "Exportador",
  mercado_local: "Mercado local",
  otro: "Otro",
};

const dia = (iso: string) => iso.slice(0, 10);
const canalDe = (v: Venta) => (v.canal ? (CANAL_LABEL[v.canal] ?? v.canal) : null);
const pagoDe = (v: Venta) => ESTADO_PAGO_LABEL[v.estadoPago as CacaoEstadoPago] ?? v.estadoPago;
const total = (v: Venta) => (v.totalPen == null ? null : Number(v.totalPen));

/** Filtros de columna (como Adelantos › Lista): las ventas llegan enteras del servidor. */
export const COLUMNAS_VENTAS: readonly ColumnaFiltro<Venta>[] = [
  { id: "venta", label: "Venta", tipo: "texto", valor: (v) => [v.ventaCode, v.loteCode ?? ""] },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (v) => dia(v.fecha) },
  { id: "comprador", label: "Comprador", tipo: "multi", valor: (v) => v.compradorNombre, soloConVarios: true },
  { id: "canal", label: "Canal", tipo: "multi", valor: canalDe, soloConVarios: true },
  { id: "kg", label: "Kg", tipo: "rango", numero: (v) => Number(v.pesoKg), unidad: "kg", paso: 0.01 },
  { id: "total", label: "Total S/", tipo: "rango", numero: total, unidad: "S/", paso: 0.01 },
  { id: "pago", label: "Pago", tipo: "multi", valor: pagoDe, soloConVarios: true },
];

export const ORDEN_VENTAS: Record<string, AccesorOrden<Venta>> = {
  venta: { valor: (v) => v.ventaCode, texto: true },
  fecha: { valor: (v) => dia(v.fecha) },
  comprador: { valor: (v) => v.compradorNombre, texto: true },
  canal: { valor: canalDe, texto: true },
  kg: { valor: (v) => Number(v.pesoKg) },
  total: { valor: total },
  pago: { valor: pagoDe, texto: true },
};
