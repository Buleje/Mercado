/**
 * Helpers de OrderStatus — single source of truth para distinguir qué
 * pedidos cuentan como "venta cerrada" vs "pedido en curso".
 *
 * Brandon mayo 2026 v7 (regla de negocio explícita):
 *   Un pedido SOLO se considera venta cuando llega a `entregado`.
 *   `pendiente | confirmado | preparando | en_camino` aún pueden ser
 *   cancelados (por el cliente, el admin o el repartidor) y por eso NUNCA
 *   deben sumar al revenue, ticket promedio, top productos, ni a la meta
 *   del mes. Eso protege la contabilidad de inflarse falsamente.
 *
 * Antes de este helper, los dashboards usaban `status !== "cancelado"` que
 * inflaba KPIs (un pedido recién creado contaba como S/X vendido aunque al
 * minuto siguiente se cancelara).
 */

export type OrderStatus =
  | "pendiente"
  | "confirmado"
  | "preparando"
  | "en_camino"
  | "entregado"
  | "cancelado";

/** Único status que ya es venta cerrada e irreversible. */
export const SALE_STATUSES: ReadonlyArray<OrderStatus> = ["entregado"] as const;

/** Status de pedidos vivos (pendiente operativo, no contables aún). */
export const ACTIVE_ORDER_STATUSES: ReadonlyArray<OrderStatus> = [
  "pendiente",
  "confirmado",
  "preparando",
  "en_camino",
] as const;

/** Status que cierran el ciclo de un pedido (no aparecen en pipelines). */
export const TERMINAL_STATUSES: ReadonlyArray<OrderStatus> = [
  "entregado",
  "cancelado",
] as const;

/**
 * True solo cuando el pedido ya fue entregado al cliente. Único status que
 * debe sumar a revenue / ventas / ticket promedio / top productos / metas.
 */
export function isSale(status: string | OrderStatus | null | undefined): boolean {
  return status === "entregado";
}

/**
 * True cuando el pedido aún está en curso (puede ser cancelado todavía).
 * Útil para mostrar contadores "pedidos en curso", "por atender" etc.
 */
export function isActiveOrder(
  status: string | OrderStatus | null | undefined,
): boolean {
  if (!status) return false;
  return (ACTIVE_ORDER_STATUSES as ReadonlyArray<string>).includes(status);
}
