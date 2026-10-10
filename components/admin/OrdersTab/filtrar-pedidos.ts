/**
 * Qué pedidos se ven en Pedidos y reparto, en UN lugar.
 *
 * Tablero y Lista muestran lo mismo (los pedidos en marcha que pasan los
 * filtros) y Archivados el resto. Antes este cálculo vivía dentro del render
 * de `OrdersTab`; al pasar a vistas (`?vista=tablero|lista|archivados`) las
 * tres lo leen de acá, y así un filtro nunca dice una cosa en el tablero y
 * otra en la lista.
 *
 * Sin React y sin `window`: se prueba sola (`__tests__/pedidos-filtrar.test.ts`).
 * No calcula plata: el total de cada pedido viene del servidor.
 */
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { limaDateKey } from "@/lib/utils";
import type { OrderFilters } from "./types";

type PedidoConExtras = DbOrder & { deliveryDriver?: string; adminNotes?: string; source?: string };

/** Los estados de un pedido en marcha, en el orden del tablero. */
export const ESTADOS_EN_MARCHA = ["pendiente", "confirmado", "preparando", "en_camino"] as const satisfies readonly OrderStatus[];

/** Entregado o cancelado: va a Archivados. */
export function esArchivado(o: Pick<DbOrder, "status">): boolean {
  return o.status === "entregado" || o.status === "cancelado";
}

/**
 * El día del pedido en Lima («YYYY-MM-DD»), que es contra lo que se comparan
 * los filtros de fecha. Antes eran los 10 primeros caracteres de `createdAt`
 * (el día UTC): un pedido de las 20:00 de Pucallpa caía en «mañana» y el
 * filtro «hoy» no lo encontraba.
 */
export function diaDelPedido(o: Pick<DbOrder, "createdAt">): string {
  return limaDateKey(o.createdAt);
}

/**
 * Los pedidos en marcha que pasan los filtros. Mismas reglas que tenía la
 * pestaña: fecha por el día de Lima (`diaDelPedido`), montos
 * inclusivos, búsqueda por nombre, teléfono o número, `source` ausente =
 * «direct» (Tienda personal).
 */
export function pedidosEnMarcha(orders: readonly DbOrder[], f: OrderFilters, repartidor: string): DbOrder[] {
  const q = f.customerSearch.toLowerCase();
  const min = f.amountMin ? parseFloat(f.amountMin) : null;
  const max = f.amountMax ? parseFloat(f.amountMax) : null;
  return orders.filter((pedido) => {
    const o = pedido as PedidoConExtras;
    if (esArchivado(o)) return false;
    if (f.statuses.size > 0 && !f.statuses.has(o.status)) return false;
    if (f.paymentMethod && o.paymentMethod !== f.paymentMethod) return false;
    if (f.dateFrom && diaDelPedido(o) < f.dateFrom) return false;
    if (f.dateTo && diaDelPedido(o) > f.dateTo) return false;
    if (min !== null && !Number.isNaN(min) && o.total < min) return false;
    if (max !== null && !Number.isNaN(max) && o.total > max) return false;
    if (q && !(o.customer.name.toLowerCase().includes(q) || (o.customer.phone ?? "").includes(q) || o.id.toLowerCase().includes(q))) {
      return false;
    }
    if (f.hasDebt && o.deuda !== true) return false;
    if (f.hasAdminNotes && !o.adminNotes) return false;
    if (f.source && (o.source ?? "direct") !== f.source) return false;
    if (repartidor && o.deliveryDriver !== repartidor) return false;
    return true;
  });
}

/** Entregados y cancelados, sin filtros (Archivados trae los suyos). */
export function pedidosArchivados(orders: readonly DbOrder[]): DbOrder[] {
  return orders.filter(esArchivado);
}

/** Los filtros propios de Archivados: cliente o teléfono y un rango de días. */
export interface FiltrosArchivo {
  texto: string;
  desde: string | null;
  hasta: string | null;
}

/** Los archivados que pasan su búsqueda y su rango (mismo día de Lima que la barra). */
export function archivadosQuePasan(archivados: readonly DbOrder[], f: FiltrosArchivo): DbOrder[] {
  const q = f.texto.trim().toLowerCase();
  return archivados.filter((o) => {
    if (q && !(o.customer.name.toLowerCase().includes(q) || (o.customer.phone ?? "").includes(q))) return false;
    const dia = diaDelPedido(o);
    if (f.desde && dia < f.desde) return false;
    if (f.hasta && dia > f.hasta) return false;
    return true;
  });
}

/** Repartidores con pedidos, con cuántos lleva cada uno, por nombre. */
export function repartidoresConPedidos(orders: readonly DbOrder[]): { value: string; count: number }[] {
  const conteo = new Map<string, number>();
  for (const o of orders) {
    const d = (o as PedidoConExtras).deliveryDriver;
    if (d) conteo.set(d, (conteo.get(d) ?? 0) + 1);
  }
  return [...conteo]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

/** Cuántos pedidos hay en cada estado en marcha (sin filtrar: es el total del estado). */
export function cuantosPorEstado(orders: readonly DbOrder[]): { value: string; count: number }[] {
  return ESTADOS_EN_MARCHA.map((estado) => ({ value: estado, count: orders.filter((o) => o.status === estado).length }));
}

/** Cuántos filtros hay puestos (el repartidor cuenta como uno). */
export function filtrosPuestos(f: OrderFilters, repartidor: string): number {
  return (
    f.statuses.size +
    (f.paymentMethod ? 1 : 0) +
    (f.source ? 1 : 0) +
    (f.dateFrom ? 1 : 0) +
    (f.dateTo ? 1 : 0) +
    (f.amountMin ? 1 : 0) +
    (f.amountMax ? 1 : 0) +
    (f.customerSearch ? 1 : 0) +
    (f.hasDebt ? 1 : 0) +
    (f.hasAdminNotes ? 1 : 0) +
    (repartidor ? 1 : 0)
  );
}
