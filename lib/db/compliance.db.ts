/**
 * lib/db/compliance.db.ts
 *
 * DB wrapper para queries del compliance dashboard (Ley 29733 PE).
 * Centraliza counts y aggregates con tenantId 1er param (regla #1 CLAUDE.md).
 *
 * Reemplaza el uso directo de `prisma.*` en
 * `app/api/admin/compliance-dashboard/route.ts` (audit Code Reviewer P0).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface ComplianceCounts {
  auditLog30d: number;
  auditLogTotal: number;
  auditLogOldestDate: Date | null;
  customersTotal: number;
}

export const ComplianceDB = {
  /**
   * Devuelve KPIs base del compliance dashboard para un tenant.
   * Hace 4 queries en paralelo (zero N+1). Todas scoped por tenantId.
   */
  async getKpis(tenantId: string): Promise<ComplianceCounts> {
    if (!tenantId) {
      logger.error("[ComplianceDB.getKpis] tenantId vacio");
      throw new Error("tenantId requerido");
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    try {
      const [auditLog30d, auditLogTotal, oldestEntry, customersTotal] = await Promise.all([
        prisma.activityLog.count({
          where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
        }),
        prisma.activityLog.count({
          where: { tenantId },
        }),
        prisma.activityLog.findFirst({
          where: { tenantId },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        prisma.customer.count({ where: { tenantId } }),
      ]);

      return {
        auditLog30d,
        auditLogTotal,
        auditLogOldestDate: oldestEntry?.createdAt ?? null,
        customersTotal,
      };
    } catch (err) {
      logger.error("[ComplianceDB.getKpis] query failed", {
        tenantId: tenantId.slice(-8),
        err: String(err).slice(0, 200),
      });
      throw err;
    }
  },
};
