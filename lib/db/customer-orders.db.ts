/**
 * customer-orders.db.ts — Wrapper ligero de orders.db.ts orientado al cliente final.
 *
 * Expone solo los métodos que la UI de "Mi Cuenta" necesita, evitando que las
 * páginas importen orders.db.ts directamente (que contiene lógica de negocio
 * compleja: state machine, notificaciones, etc.).
 *
 * tenantId siempre es 1er param (regla CLAUDE.md #3).
 */
import "server-only";
import { OrdersDB } from "@/lib/db/orders.db";
import type { DbOrder } from "@/lib/db/misc.db";

export type { DbOrder };

export const CustomerOrdersDB = {
  /**
   * Lista pedidos del cliente ordenados por fecha descendente.
   * Usa getByCustomerPhone internamente, que ya aplica el filtro de tenant.
   */
  async listByCustomer(
    tenantId: string,
    customerPhone: string,
    limit = 50,
  ): Promise<DbOrder[]> {
    const orders = await OrdersDB.getByCustomerPhone(tenantId, customerPhone);
    return orders.slice(0, limit);
  },
};
