import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * BillingMpSubscriptionStatusDB
 *
 * Lookup de campos de suscripción Mercado Pago para el endpoint
 * GET /api/billing/mp-subscription-status.
 *
 * Audit project-wide 2026-05-19 — migración regla #1 (no prisma directo).
 */
export const BillingMpSubscriptionStatusDB = {
  /**
   * Retorna los campos de billing MP necesarios para consultar el estado
   * actual de la suscripción Preapproval del tenant.
   *
   * @param tenantId  id o slug del tenant (multi-tenant guard)
   */
  async getTenantMpFields(tenantId: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: {
        id: true,
        slug: true,
        plan: true,
        mpSubscriptionId: true,
        mpPaymentMethod: true,
        cancelAtPeriodEnd: true,
        stripeCurrentPeriodEnd: true,
      },
    });
  },
};
