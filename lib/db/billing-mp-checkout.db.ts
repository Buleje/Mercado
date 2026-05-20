import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * BillingMpCheckoutDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/billing/mp-checkout.
 * Resuelve tenant + persiste MpPendingPlan al crear preferencia MP.
 */

export const BillingMpCheckoutDB = {
  /**
   * Lookup del tenant con campos necesarios para checkout MP.
   * Acepta id o slug.
   */
  async findTenantForCheckout(tenantIdOrSlug: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }] },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        ownerEmail: true,
      },
    });
  },

  /**
   * Persiste el plan pendiente para resolución confiable en el webhook MP.
   * El externalRef se usa para vincular el pago con el tenant correcto.
   */
  async createPendingPlan(data: {
    tenantSlug: string;
    plan: string;
    preferenceId: string;
    externalRef: string;
  }) {
    return prisma.mpPendingPlan.create({
      data: {
        tenantSlug: data.tenantSlug,
        plan: data.plan,
        preferenceId: data.preferenceId,
        externalRef: data.externalRef,
      },
    });
  },
};
