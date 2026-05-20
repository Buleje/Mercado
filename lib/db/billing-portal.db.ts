import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * BillingPortalDB
 *
 * Lookup del tenant para el endpoint POST /api/billing/portal.
 * Retorna solo los campos necesarios para abrir el Stripe Customer Portal.
 *
 * Audit project-wide 2026-05-19 — migración regla #1 (no prisma directo).
 */
export const BillingPortalDB = {
  /**
   * Retorna id, slug y stripeCustomerId del tenant para abrir el portal.
   *
   * @param tenantId  id o slug del tenant (multi-tenant guard)
   */
  async getTenantStripeFields(tenantId: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: {
        id: true,
        slug: true,
        stripeCustomerId: true,
      },
    });
  },
};
