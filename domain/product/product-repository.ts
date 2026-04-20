// Port: ProductRepository — contrato que el dominio define.
// La implementacion concreta vive en lib/db/adapters/ (infraestructura).

import type { Product } from "./product";

export interface ProductRepository {
  /** Busca un producto por id dentro del tenant. Retorna null si no existe. */
  findById(tenantId: string, id: number): Promise<Product | null>;

  /** Lista productos activos del tenant. */
  findActive(tenantId: string): Promise<Product[]>;

  /** Persiste un producto (insert o update). */
  save(product: Product): Promise<void>;
}
