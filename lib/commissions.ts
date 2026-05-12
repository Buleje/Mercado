import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * Calcula la comisión de marketplace para una orden.
 * @param orderTotal - Total de la orden
 * @param storeCommissionRate - % de comisión de la tienda (default 5%)
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
 * Se llama automáticamente después de completar una orden de marketplace.
 */
export async function recordCommission(params: {
  orderId: string;
  storeId?: string;
  partnerId?: string;
  type: "marketplace_fee" | "delivery_fee" | "platform_fee";
  amount: number;
  rate: number;
  tenantId?: string;
}): Promise<void> {
  // P1-1 multi-tenant: commission ledger es DINERO cross-vendor; un default
  // silente a "main" significa que la comisión queda atribuida al tenant
  // equivocado. Fallback observable hasta que todos los callers pasen tenantId.
  const tenantId = params.tenantId ?? "main";
  if (!params.tenantId) {
    logger.warn("[commissions] missing tenantId — falling back to 'main'", {
      orderId: params.orderId,
      type: params.type,
      amount: params.amount,
    });
  }
  try {
    await prisma.commissionLedger.create({
      data: {
        orderId: params.orderId,
        storeId: params.storeId ?? null,
        partnerId: params.partnerId ?? null,
        type: params.type,
        amount: params.amount,
        rate: params.rate,
        status: "pending",
        tenantId,
      },
    });
  } catch (err) {
    logger.warn("Failed to record commission", { error: err, params });
  }
}

/**
 * Registra comisiones automáticas para una orden de marketplace.
 * Llamar después de que la orden cambie a status "entregado".
 *
 * Fire-and-forget recomendado: recordMarketplaceCommissions(...).catch(() => {})
 */
export async function recordMarketplaceCommissions(
  orderId: string,
  orderTotal: number,
  storeId: string,
  deliveryPartnerId?: string,
): Promise<void> {
  // 1. Buscar la tienda para obtener su tasa de comisión
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { commission: true },
  });
  const rate = store?.commission ?? 5;

  // 2. Comisión marketplace (plataforma cobra a la tienda)
  const marketplaceFee = calculateCommission(orderTotal, rate);
  await recordCommission({
    orderId,
    storeId,
    type: "marketplace_fee",
    amount: marketplaceFee,
    rate,
  });

  // 3. Si hay delivery partner, registrar fee de delivery
  if (deliveryPartnerId) {
    const assignment = await prisma.deliveryAssignment.findFirst({
      where: { orderId },
      select: { fee: true },
    });
    if (assignment) {
      await recordCommission({
        orderId,
        partnerId: deliveryPartnerId,
        type: "delivery_fee",
        // TD-018: fee es Decimal
        amount: toNumOrZero(assignment.fee),
        rate: 0, // fee fijo, no porcentaje
      });
    }
  }
}
