import { CommissionsDB } from "@/lib/db/commissions.db";

/**
 * Calcula la comisión de marketplace para una orden.
 * @param orderTotal - Total de la orden
 * @param storeCommissionRate - % de comisión de la tienda (default 5%, formato 0-100)
 * @returns Monto de comisión redondeado a 2 decimales
 */
export function calculateCommission(
  orderTotal: number,
  storeCommissionRate: number = 5,
): number {
  return Math.round((orderTotal * storeCommissionRate) / 100 * 100) / 100;
}

/**
 * Registra una comisión en el ledger.
 *
 * Audit 2026-05-17 P0-2/P0-3: `tenantId` ahora es OBLIGATORIO. Antes había
 * fallback silencioso a "main" que atribuía comisiones al tenant equivocado.
 * Ahora throw temprano si falta — fail-loud es mejor que perder dinero.
 *
 * Audit 2026-05-17 P1-1: delega a CommissionsDB (regla #1 CLAUDE.md).
 * Audit 2026-05-17 P1-3: idempotencia por (orderId, type) — ver CommissionsDB.
 */
export async function recordCommission(params: {
  orderId: string;
  storeId?: string;
  partnerId?: string;
  type: "marketplace_fee" | "delivery_fee" | "platform_fee";
  amount: number;
  rate: number;
  tenantId: string;
}): Promise<void> {
  if (!params.tenantId) {
    throw new Error("[commissions] tenantId is required (no silent fallback to 'main')");
  }
  await CommissionsDB.recordCommission(params.tenantId, {
    orderId: params.orderId,
    storeId: params.storeId,
    partnerId: params.partnerId,
    type: params.type,
    amount: params.amount,
    rate: params.rate,
  });
}

/**
 * Registra comisiones automáticas para una orden de marketplace.
 * Llamar después de que la orden cambie a status "entregado".
 *
 * Audit 2026-05-17 P0-2: `tenantId` agregado como param obligatorio.
 *
 * Fire-and-forget recomendado: recordMarketplaceCommissions(...).catch(() => {})
 */
export async function recordMarketplaceCommissions(
  tenantId: string,
  orderId: string,
  orderTotal: number,
  storeId: string,
  deliveryPartnerId?: string,
): Promise<void> {
  if (!tenantId) {
    throw new Error("[commissions] tenantId is required for recordMarketplaceCommissions");
  }
  await CommissionsDB.recordMarketplaceCommissions(tenantId, {
    orderId,
    orderTotal,
    storeId,
    deliveryPartnerId,
  });
}
