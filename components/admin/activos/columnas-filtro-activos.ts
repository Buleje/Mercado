/**
 * Autofiltros de Excel de las tablas de Activos (Brandon 25-10: «todas las tablas de Mi Plata
 * con filtros tipo Excel en el encabezado»). Texto = buscar un pedazo; multi = tildar de la lista;
 * fecha y rango = desde–hasta.
 */
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { IncomeMov, Receivable } from "./tipos";

const ddmm = (v: number | string) => String(v).slice(0, 10).split("-").reverse().join("/");
const dia = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

export type AlquilerAgenda = IncomeMov & { assetName: string };

export const COLUMNAS_POR_COBRAR: readonly ColumnaFiltro<Receivable>[] = [
  { id: "cliente", label: "Cliente", tipo: "texto", valor: (r) => r.client ?? "Cliente" },
  { id: "maquina", label: "Máquina", tipo: "multi", valor: (r) => r.assetName },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (r) => dia(r.date), formatearValor: ddmm },
  { id: "monto", label: "Monto", tipo: "rango", numero: (r) => r.amount, paso: 1 },
];

export const COLUMNAS_AGENDA: readonly ColumnaFiltro<AlquilerAgenda>[] = [
  { id: "desde", label: "Desde", tipo: "fecha", numero: (i) => dia(i.startDate ?? i.date), formatearValor: ddmm },
  { id: "maquina", label: "Máquina", tipo: "multi", valor: (i) => i.assetName },
  { id: "cliente", label: "Cliente", tipo: "texto", valor: (i) => i.client ?? "Alquiler" },
  { id: "hasta", label: "Hasta", tipo: "fecha", numero: (i) => (i.startDate && i.endDate ? dia(i.endDate) : null), formatearValor: ddmm },
  { id: "monto", label: "Monto", tipo: "rango", numero: (i) => i.amount, paso: 1 },
];
