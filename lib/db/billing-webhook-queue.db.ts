import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * BillingWebhookQueueDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/billing/webhook-queue.
 * StripeWebhookQueue es modelo PLATFORM-WIDE (queue compartida de eventos).
 * El access queda gated por requireAdmin/requirePlatformAPI en el caller.
 */

 
// ADR-101: StripeWebhookQueue es platform-wide. Access gated por
// requireAdmin (GET) y requirePlatformAPI (DELETE) en el caller.
export const BillingWebhookQueueDB = {
  /**
   * Lista los últimos 100 eventos de la queue (admin UI).
   */
  async list() {
    return prisma.stripeWebhookQueue.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        stripeId: true,
        eventType: true,
        attempts: true,
        lastError: true,
        nextRetryAt: true,
        processedAt: true,
        createdAt: true,
      },
    });
  },

  /**
   * Borra un evento atascado por id. Solo accesible via requirePlatformAPI
   * (superadmin) en el caller — pentest billing #4.
   */
  async deleteById(id: string): Promise<void> {
    await prisma.stripeWebhookQueue.delete({ where: { id } });
  },
};
 
