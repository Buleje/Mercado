import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * TenantCustomDomainDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/tenant/custom-domain.
 * Gestión del custom domain del tenant (Plan Pro/Business).
 */

export const TenantCustomDomainDB = {
  async findCurrentDomain(tenantIdOrSlug: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }] },
      select: { customDomain: true },
    });
  },

  async findTenantForUpdate(tenantIdOrSlug: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }] },
      select: { id: true, plan: true, customDomain: true },
    });
  },

  async findDomainTakenBy(domain: string, excludeTenantId: string) {
    return prisma.tenant.findFirst({
      where: { customDomain: domain, NOT: { id: excludeTenantId } },
      select: { slug: true },
    });
  },

  async setCustomDomain(tenantId: string, customDomain: string | null) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomain },
    });
  },
};
