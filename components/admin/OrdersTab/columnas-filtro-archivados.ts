/**
 * Filtros y orden de las cabezas de Archivados (Brandon 25-10: «filtros tipo
 * Excel en el encabezado»). La lista llega entera, no se pagina en el servidor.
 */
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { limaDateKey } from "@/lib/utils";
import type { DbOrder } from "@/lib/jsondb";
import { cobroDe } from "./siguiente-paso";
import { STATUS_LABELS } from "./types";
import { ultimoCambio, type EventoPedido } from "./hooks/useHistorialPedidos";

export interface FilaArchivado {
  o: DbOrder;
  cierre: ReturnType<typeof ultimoCambio>;
}

/** Día de Lima (YYYY-MM-DD) de una fecha ISO. */
export function diaLima(v: string | Date | null | undefined): string | null {
  return v ? limaDateKey(v) || null : null;
}

const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");

/** «Debe S/ 42.50» y «Debe S/ 10.00» son la misma opción: «Debe». */
const plataSinMonto = (t: string) => t.replace(/S\/\s?[\d.,]+\s?/g, "").replace(/\s+/g, " ").trim();

export const filasDeArchivados = (
  pedidos: readonly DbOrder[],
  historial: Readonly<Record<string, EventoPedido[]>>,
): FilaArchivado[] => pedidos.map((o) => ({ o, cierre: ultimoCambio(historial[o.id]) }));

export const COLUMNAS_ARCHIVADOS: readonly ColumnaFiltro<FilaArchivado>[] = [
  {
    id: "cliente",
    label: "Cliente",
    tipo: "texto",
    valor: ({ o }) => [o.customer.name, o.customer.phone ?? "", o.customer.location ?? "", o.id.slice(-6)],
  },
  { id: "estado", label: "Estado", tipo: "multi", valor: ({ o }) => STATUS_LABELS[o.status], soloConVarios: true },
  { id: "plata", label: "Plata", tipo: "multi", valor: ({ o }) => plataSinMonto(cobroDe(o).texto), soloConVarios: true },
  { id: "total", label: "Total", tipo: "rango", numero: ({ o }) => Number(o.total), unidad: "S/", paso: 0.01 },
  { id: "fecha", label: "Pedido el", tipo: "fecha", numero: ({ o }) => diaLima(o.createdAt), formatearValor: ddmm },
  { id: "cierre", label: "Cierre", tipo: "texto", valor: ({ cierre }) => (cierre ? [cierre.quien ?? "", cierre.nota ?? ""] : "") },
];

export const ORDEN_ARCHIVADOS: Record<string, AccesorOrden<FilaArchivado>> = {
  cliente: { valor: ({ o }) => o.customer.name, texto: true },
  estado: { valor: ({ o }) => STATUS_LABELS[o.status], texto: true },
  plata: { valor: ({ o }) => plataSinMonto(cobroDe(o).texto), texto: true },
  total: { valor: ({ o }) => Number(o.total) },
  fecha: { valor: ({ o }) => new Date(o.createdAt).getTime() },
  cierre: { valor: ({ cierre }) => (cierre ? new Date(cierre.cuando).getTime() : null) },
};
