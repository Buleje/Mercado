import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * SuperadminChurnTenantDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/superadmin/churn/[tenantSlug].
 *
 * Cross-tenant: el superadmin lee detalle anti-churn de cualquier tenant.
 * Caller debe haber validado `requirePlatformAPI` ANTES de invocar.
 */

export const SuperadminChurnTenantDB = {
  async findTenantBySlug(slug: string) {
    return prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        ownerEmail: true,
        ownerPhone: true,
        trialEndsAt: true,
        active: true,
        createdAt: true,
      },
    });
  },

  async getScoreHistory(tenantId: string, since: Date, take = 30) {
    return prisma.tenantHealthScore.findMany({
      where: { tenantId, calculatedAt: { gte: since } },
      orderBy: { calculatedAt: "asc" },
      take,
      select: {
        id: true,
        score: true,
        riskLevel: true,
        loginsLast7d: true,
        loginsLast30d: true,
        ordersLast7d: true,
        ordersLast30d: true,
        featuresUsed: true,
        daysSinceLastOrder: true,
        daysSinceLastLogin: true,
        trialDaysLeft: true,
        calculatedAt: true,
      },
    });
  },

  async getActiveSignals(tenantId: string) {
    return prisma.churnSignal.findMany({
      where: { tenantId, resolved: false },
      orderBy: { createdAt: "desc" },
    });
  },

  async getResolvedSignals(tenantId: string, since: Date, take = 20) {
    return prisma.churnSignal.findMany({
      where: { tenantId, resolved: true, createdAt: { gte: since } },
      orderBy: { resolvedAt: "desc" },
      take,
    });
  },

  async getActivityTimeline(tenantId: string, take = 50) {
    return prisma.activityLog.findMany({
      where: { entityId: tenantId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        action: true,
        entity: true,
        detail: true,
        user: true,
        createdAt: true,
      },
    });
  },

  async findTenantIdBySlug(slug: string) {
    return prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
  },

  async findSignalForTenant(signalId: string, tenantId: string) {
    return prisma.churnSignal.findFirst({
      where: { id: signalId, tenantId },
    });
  },

  async resolveSignal(signalId: string, resolvedBy: string) {
    return prisma.churnSignal.update({
      where: { id: signalId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
      },
    });
  },

  /**
   * Dashboard anti-churn: score más reciente de CADA tenant en 1 sola query.
   * `distinct: [tenantId]` sobre orden `calculatedAt desc` devuelve, por tenant,
   * la fila más nueva. Reemplaza el groupBy + N findFirst (N+1). Equivalencia
   * verificada before/after contra la DB real (0 diferencias).
   */
  async listLatestHealthScores() {
    return prisma.tenantHealthScore.findMany({
      distinct: ["tenantId"],
      orderBy: [{ tenantId: "asc" }, { calculatedAt: "desc" }],
      select: {
        tenantId: true,
        score: true,
        riskLevel: true,
        loginsLast7d: true,
        ordersLast7d: true,
        daysSinceLastOrder: true,
        daysSinceLastLogin: true,
        trialDaysLeft: true,
        calculatedAt: true,
      },
    });
  },

  async listTenantsForChurn(ids: string[]) {
    return prisma.tenant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        ownerEmail: true,
        trialEndsAt: true,
        createdAt: true,
      },
    });
  },

  async listActiveSignals(tenantIds: string[]) {
    return prisma.churnSignal.findMany({
      where: { tenantId: { in: tenantIds }, resolved: false },
      select: {
        id: true,
        tenantId: true,
        signalType: true,
        severity: true,
        detail: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },
};
