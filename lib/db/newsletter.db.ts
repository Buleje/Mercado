import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * NewsletterDB — operaciones sobre NewsletterSubscriber.
 *
 * Endpoint público (sin auth): best-effort tenantId desde cookie de middleware.
 * No usa caché — suscripciones son writes únicos, baja frecuencia.
 */
export const NewsletterDB = {
  /**
   * Suscribir email. Upsert idempotente — no falla si ya existe.
   */
  async subscribe(tenantId: string, email: string): Promise<void> {
    await prisma.newsletterSubscriber.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: { updatedAt: new Date() },
      create: { email, tenantId },
    });
  },
};
