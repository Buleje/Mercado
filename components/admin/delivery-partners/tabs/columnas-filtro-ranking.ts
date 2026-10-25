import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { toNum } from "@/components/admin/delivery-partners/shared";
import type { FilaRanking } from "@/lib/delivery/ranking-reparto";

/** El ranking llega entero para el período: se filtra y ordena en el cliente. */
export const COLUMNAS_RANKING: readonly ColumnaFiltro<FilaRanking>[] = [
  { id: "repartidor", label: "Repartidor", tipo: "texto", valor: (r) => [r.name, r.phone ?? ""] },
  { id: "entregas", label: "Entregas", tipo: "rango", numero: (r) => r.delivered },
  { id: "ganado", label: "Ganado", tipo: "rango", numero: (r) => toNum(r.totalEarnings), unidad: "S/", paso: 0.01 },
];

export const ORDEN_RANKING: Record<string, AccesorOrden<FilaRanking>> = {
  repartidor: { valor: (r) => r.name, texto: true },
  rating: { valor: (r) => toNum(r.rating) },
  aceptacion: { valor: (r) => r.acceptanceRate },
  entregas: { valor: (r) => r.delivered },
  cancelados: { valor: (r) => r.cancelled },
  minutos: { valor: (r) => r.avgDeliveryMin ?? null },
  ganado: { valor: (r) => toNum(r.totalEarnings) },
  completadas: { valor: (r) => r.completionRate ?? null },
};
