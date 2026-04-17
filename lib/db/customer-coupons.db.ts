/**
 * customer-coupons.db.ts — Stub temporal para cupones del cliente.
 *
 * El esquema definitivo llega en PR-2 Ola 1 (ADR-059).
 * Por ahora retorna [] para que la UI pueda montarse sin bloquear.
 *
 * Cuando el PR-2 aterrice:
 *   1. Agregar import "server-only"
 *   2. Reemplazar el stub con queries reales a prisma.customerCoupon
 *   3. Invalidar cacheTag("customer-coupons") tras redeem/expire writes
 */

export type DbCustomerCoupon = {
  id: string;
  code: string;
  description: string;
  discountType: "porcentaje" | "monto_fijo";
  discountValue: number;
  minPurchase: number | null;
  expiresAt: string | null;
  usedAt: string | null;
  active: boolean;
};

export const CustomerCouponsDB = {
  /**
   * Lista cupones asignados al cliente. tenantId es 1er param.
   * Stub — retorna [] hasta que PR-2 implemente la tabla.
   */
  async listByCustomer(
    _tenantId: string,
    _customerPhone: string,
  ): Promise<DbCustomerCoupon[]> {
    return [];
  },
};
