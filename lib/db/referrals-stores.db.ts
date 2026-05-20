import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * ReferralsStoresDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/referrals/stores.
 * Programa de referidos: cada tenant tiene un referralCode único y rastrea
 * tiendas que entraron vía referredBy.
 */

export const ReferralsStoresDB = {
  async listReferredBy(referrerSlug: string) {
    return prisma.tenant.findMany({
      where: { referredBy: referrerSlug },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        active: true,
        trialEndsAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findOwnTenant(tenantIdOrSlug: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }] },
      select: { referralCode: true, slug: true, name: true },
    });
  },

  async findReferralCode(tenantIdOrSlug: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }] },
      select: { referralCode: true },
    });
  },

  async findByReferralCode(code: string) {
    return prisma.tenant.findUnique({ where: { referralCode: code } });
  },

  async setReferralCode(tenantId: string, referralCode: string) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { referralCode },
    });
  },
};
