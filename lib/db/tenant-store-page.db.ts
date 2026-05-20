import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * TenantStorePageDB
 *
 * Acceso canonico a `TenantStorePage` — la configuracion 1-a-1 con
 * cada tenant que controla el storefront publico (whatsappPhone,
 * cover, branding, etc.).
 *
 * Audit project-wide 2026-05-19 (CodeReview P0 #1): migracion de los
 * lookups directos `prisma.tenantStorePage.findUnique` dispersos en
 * endpoints publicos del marketplace.
 */

export const TenantStorePageDB = {
  /**
   * Devuelve el WhatsApp phone del storefront (o null si no esta
   * configurado o no existe la fila). Fail-open: caller espera null.
   *
   * Usado por: GET /api/marketplace/stores/[slug]/phone (boton WhatsApp
   * en el carrito del marketplace).
   */
  async getWhatsAppPhone(tenantId: string): Promise<string | null> {
    if (!tenantId) return null;
    try {
      const row = await prisma.tenantStorePage.findUnique({
        where: { tenantId },
        select: { whatsappPhone: true },
      });
      return row?.whatsappPhone ?? null;
    } catch (err) {
      logger.warn("[TenantStorePageDB.getWhatsAppPhone] DB error", {
        tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      // Caller espera null como fallback grafico (oculta el boton).
      return null;
    }
  },
};
