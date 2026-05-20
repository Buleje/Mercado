import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * ComplianceDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/compliance.
 * Items de cumplimiento legal (SUNAT, municipal, sanitario, etc.)
 * con scope por tenantId.
 */

interface UpdateData {
  status: string;
  nextDue?: string;
  lastFiled?: string;
}

export const ComplianceDB = {
  async listForTenant(tenantId: string) {
    return prisma.complianceItem.findMany({
      where: { tenantId },
      orderBy: { nextDue: "asc" },
    });
  },

  /**
   * Actualiza el item por id + tenantId (defense in depth contra IDOR
   * cross-tenant). El where compuesto evita updateAny por id solo.
   */
  async updateForTenant(tenantId: string, id: string, data: UpdateData): Promise<boolean> {
    try {
      await prisma.complianceItem.update({
        where: { id, tenantId },
        data: {
          status: data.status,
          ...(data.nextDue ? { nextDue: new Date(data.nextDue) } : {}),
          ...(data.lastFiled ? { lastFiled: new Date(data.lastFiled) } : {}),
        },
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * KPIs de compliance para el dashboard admin tenant (ADR-107).
   * Devuelve audit log activity + customer count.
   *
   * Audit project-wide 2026-05-19: ya consumido por
   * /api/admin/compliance-dashboard (P0 #1 CodeReview).
   */
  async getKpis(tenantId: string): Promise<{
    auditLog30d: number;
    auditLogTotal: number;
    auditLogOldestDate: Date | null;
    customersTotal: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const [auditLog30d, auditLogTotal, oldestAudit, customersTotal] = await Promise.all([
      prisma.activityLog.count({
        where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
      }).catch(() => 0),
      prisma.activityLog.count({
        where: { tenantId },
      }).catch(() => 0),
      prisma.activityLog.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }).catch(() => null),
      prisma.customer.count({
        where: { tenantId },
      }).catch(() => 0),
    ]);
    return {
      auditLog30d,
      auditLogTotal,
      auditLogOldestDate: oldestAudit?.createdAt ?? null,
      customersTotal,
    };
  },
};
