import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * BillingUsageDB
 *
 * Lookup del tenant para el endpoint GET /api/billing/usage.
 * Retorna solo los campos necesarios para calcular usage vs límites de plan.
 *
 * Audit project-wide 2026-05-19 — migración regla #1 (no prisma directo).
 */
export const BillingUsageDB = {
  /**
   * Retorna plan, trialEndsAt y slug del tenant para el snapshot de uso.
   *
   * @param tenantId  id o slug del tenant (multi-tenant guard)
   */
  async getTenantPlanFields(tenantId: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: {
        plan: true,
        trialEndsAt: true,
        slug: true,
      },
    });
  },
};
