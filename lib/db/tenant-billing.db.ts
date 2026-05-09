import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";

/**
 * TenantBillingDB — operaciones de billing sobre el modelo Tenant.
 *
 * Solo modifica campos de billing (plan, mpSubscriptionId, cancelAtPeriodEnd).
 * NO toca datos de negocio (settings, products, orders).
 */
export const TenantBillingDB = {
  /**
   * Obtener datos de billing de un tenant por id o slug.
   */
  async getById(tenantId: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: {
        id: true,
        slug: true,
        plan: true,
        mpSubscriptionId: true,
        cancelAtPeriodEnd: true,
      },
    });
  },

  /**
   * Verificar que un ownerPhone pertenece al tenant (guard cross-tenant WhatsApp).
   * Retorna true si el phone está registrado como ownerPhone del tenant.
   */
  async verifyOwnerPhone(tenantId: string, ownerPhone: string): Promise<boolean> {
    const row = await prisma.tenant.findFirst({
      where: { id: tenantId, ownerPhone },
      select: { id: true },
    });
    return !!row;
  },

  /**
   * Marcar suscripción MP para cancelarse al fin del período.
   * No cancela en MP — eso lo hace el llamador antes de invocar esto.
   */
  async markCancelAtPeriodEnd(tenantId: string): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { cancelAtPeriodEnd: true },
    });
    invalidateByPrefix(`tenant:${tenantId}`);
  },

  /**
   * Registrar suscripción MP activa tras webhook de pago exitoso.
   */
  async setMpSubscription(
    tenantId: string,
    mpSubscriptionId: string,
    plan: string,
  ): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { mpSubscriptionId, plan, cancelAtPeriodEnd: false },
    });
    invalidateByPrefix(`tenant:${tenantId}`);
  },
};
