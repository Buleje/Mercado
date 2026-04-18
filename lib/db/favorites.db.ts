/**
 * favorites.db.ts — Stub temporal para favoritos del cliente.
 *
 * El esquema definitivo llega en PR-2 Ola 1 (ADR-059).
 * Por ahora retorna [] para que la UI pueda montarse sin bloquear.
 *
 * Cuando el PR-2 aterrice:
 *   1. Agregar import "server-only"
 *   2. Reemplazar el stub con queries reales a prisma.customerFavorite
 *   3. Invalidar cacheTag("favorites") tras writes
 */

export type DbFavoriteProduct = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
  unit: string;
  storeSlug: string;
  storeName: string;
  tenantId: string;
  savedAt: string;
};

export const FavoritesDB = {
  /**
   * Lista favoritos del cliente. tenantId es 1er param por regla CLAUDE.md.
   * Stub — retorna [] hasta que PR-2 implemente la tabla.
   */
  async listByCustomer(
    _tenantId: string,
    _customerPhone: string,
  ): Promise<DbFavoriteProduct[]> {
    return [];
  },

  async add(
    _tenantId: string,
    _customerPhone: string,
    _productId: number,
  ): Promise<void> {
    // stub
  },

  async remove(
    _tenantId: string,
    _customerPhone: string,
    _productId: number,
  ): Promise<void> {
    // stub
  },
};
