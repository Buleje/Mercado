import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * BillingMpSubscribeDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/billing/mp-subscribe.
 * Mercado Pago Preapproval (suscripción recurrente mensual).
 */

export const BillingMpSubscribeDB = {
  /**
   * Lookup del tenant con campos necesarios para crear suscripción MP.
   * Acepta id o slug.
   */
  async findTenantForSubscribe(tenantIdOrSlug: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }] },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        ownerEmail: true,
        mpSubscriptionId: true,
      },
    });
  },

  /**
   * Guarda el preapprovalId en el Tenant. El plan se actualiza cuando MP
   * confirma el primer pago vía webhook (F5-NOTE en trial-status.ts).
   */
  async savePreapprovalId(tenantId: string, preapprovalId: string) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { mpSubscriptionId: preapprovalId },
    });
  },

  /**
   * Log fire-and-forget de la iniciación de suscripción.
   */
  async logSubscriptionInitiated(data: {
    tenantSlug: string;
    plan: string;
    preapprovalId: string;
  }) {
    return prisma.activityLog.create({
      data: {
        action: "subscription_initiated",
        entity: "tenant",
        entityId: data.tenantSlug,
        detail: `Suscripción MP Preapproval iniciada para plan ${data.plan} (id: ${data.preapprovalId})`,
        user: "admin",
        tenantId: data.tenantSlug,
      },
    });
  },
};
