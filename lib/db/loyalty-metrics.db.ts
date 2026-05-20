import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * LoyaltyMetricsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/loyalty/metrics.
 * 7 queries agregadas para el dashboard de fidelidad.
 */

export const LoyaltyMetricsDB = {
  async tierDistribution(tenantId: string) {
    return prisma.customer.groupBy({
      by: ["loyaltyTier"],
      where: { tenantId },
      _count: { phone: true },
      _sum: { loyaltyPoints: true },
    });
  },

  async countActiveMembers(tenantId: string) {
    return prisma.customer.count({
      where: { tenantId, loyaltyPoints: { gt: 0 } },
    });
  },

  async countTotalCustomers(tenantId: string) {
    return prisma.customer.count({ where: { tenantId } });
  },

  async aggregateEarnedSince(tenantId: string, since: Date) {
    return prisma.loyaltyTransaction.aggregate({
      where: { tenantId, amount: { gt: 0 }, createdAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    });
  },

  async aggregateRedeemedSince(tenantId: string, since: Date) {
    return prisma.loyaltyTransaction.aggregate({
      where: { tenantId, amount: { lt: 0 }, createdAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    });
  },

  async topCustomers(tenantId: string, take = 10) {
    return prisma.customer.findMany({
      where: { tenantId, loyaltyPoints: { gt: 0 } },
      select: {
        phone: true,
        name: true,
        loyaltyPoints: true,
        loyaltyTier: true,
        totalSpent: true,
      },
      orderBy: { loyaltyPoints: "desc" },
      take,
    });
  },

  async totalPointsAggregate(tenantId: string) {
    return prisma.customer.aggregate({
      where: { tenantId },
      _sum: { loyaltyPoints: true },
    });
  },
};
