import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * SupportInboxDB
 *
 * Acceso canónico a los datos de la bandeja de soporte unificada:
 *  1. ActivityLog con entity = "whatsapp.inbound"
 *  2. Review con status = "pending" (reportadas / pendientes de moderación)
 *
 * Audit 2026-05-29 — migración regla #1 CLAUDE.md desde
 * /api/admin/support/inbox/route.ts.
 *
 * Multi-tenant: tenantId SIEMPRE 1er parámetro.
 */

export const SupportInboxDB = {
  /**
   * Retorna ActivityLog de WhatsApp inbound del tenant.
   * statusFilter: "pending" | "resolved" | null (all)
   */
  async getActivityLog(
    tenantId: string,
    statusFilter: string | null,
  ) {
    return prisma.activityLog.findMany({
      where: {
        tenantId,
        entity: "whatsapp.inbound",
        ...(statusFilter === "resolved"
          ? { action: "resolved" }
          : statusFilter === "pending"
          ? { action: { not: "resolved" } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        user: true,
        detail: true,
        createdAt: true,
        action: true,
      },
    });
  },

  /**
   * Retorna Reviews pendientes de moderación del tenant.
   * statusFilter: "pending" | "resolved" | null (all)
   */
  async getReviews(
    tenantId: string,
    statusFilter: string | null,
  ) {
    return prisma.review.findMany({
      where: {
        tenantId,
        status: "pending",
        deletedAt: null,
        ...(statusFilter === "resolved" ? { status: "approved" } : {}),
      },
      orderBy: { date: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        text: true,
        date: true,
        status: true,
      },
    });
  },
};
