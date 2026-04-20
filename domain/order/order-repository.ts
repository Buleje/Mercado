// Port: OrderRepository — contrato que el dominio define.
// La implementacion concreta vive en lib/db/adapters/ (infraestructura).
// El dominio nunca importa el adaptador; solo trabaja con esta interface.

import type { Order } from "./order";

export interface OrderRepository {
  /** Busca un pedido por id dentro del tenant. Retorna null si no existe. */
  findById(tenantId: string, id: string): Promise<Order | null>;

  /** Persiste un pedido (insert o update). */
  save(order: Order): Promise<void>;

  /** Lista pedidos recientes del tenant (limit/offset para paginacion). */
  findByTenant(tenantId: string, opts?: { limit?: number; offset?: number }): Promise<Order[]>;
}
