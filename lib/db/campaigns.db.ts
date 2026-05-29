import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

/**
 * CampaignsDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/campaigns.
 * Campañas marketing (WhatsApp / in-app) con segmentacion por
 * comportamiento del customer.
 */

type Segment = "todos" | "vip" | "inactivos" | "cumpleanos" | "deudores";

interface CreateData {
  name: string;
  message: string;
  segment: Segment;
  channel: string;
  status: string;
  scheduledAt: string | null | undefined;
  totalAudience: number;
}

interface UpdateData {
  status?: string;
  sentAt?: string | null;
  totalAudience?: number;
  delivered?: number;
  opened?: number;
  conversions?: number;
  revenue?: number;
}

export const CampaignsDB = {
  /**
   * Estimacion de tamaño de audiencia segun segmento. Cross-customer
   * pero scoped al tenant. Errors → 0 (graceful degrade).
   */
  async estimateAudience(tenantId: string, segment: Segment): Promise<number> {
    // NO "use cache": se invoca dentro del POST de crear campaña — la estimación
    // de audiencia debe ser fresca al momento de crear, no cacheada.
    try {
      const thirty = new Date();
      thirty.setDate(thirty.getDate() - 30);
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      if (segment === "todos") {
        return await prisma.customer.count({ where: { tenantId } });
      }
      if (segment === "vip") {
        return await prisma.customer.count({
          where: { tenantId, loyaltyTier: { in: ["oro", "diamante"] } },
        });
      }
      if (segment === "inactivos") {
        return await prisma.customer.count({
          where: { tenantId, sales: { none: { createdAt: { gte: thirty } } } },
        });
      }
      if (segment === "cumpleanos") {
        return await prisma.customer.count({
          where: { tenantId, birthday: { gte: firstOfMonth, lte: lastOfMonth } },
        });
      }
      if (segment === "deudores") {
        return await prisma.customer.count({
          where: { tenantId, creditBalance: { lt: 0 } },
        });
      }
    } catch {
      /* graceful degrade */
    }
    return 0;
  },

  async list(tenantId: string, opts: { status?: string } = {}) {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:campaigns`);
    return prisma.campaign.findMany({
      where: {
        tenantId,
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async create(tenantId: string, data: CreateData) {
    const created = await prisma.campaign.create({
      data: {
        tenantId,
        name: data.name,
        message: data.message,
        segment: data.segment,
        channel: data.channel,
        status: data.status,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        totalAudience: data.totalAudience,
      },
    });
    revalidateTag(`tenant:${tenantId}:campaigns`, "max");
    return created;
  },

  async getForTenant(tenantId: string, id: string) {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:campaigns`);
    return prisma.campaign.findFirst({ where: { id, tenantId } });
  },

  async updateForTenant(tenantId: string, id: string, data: UpdateData) {
    const existing = await this.getForTenant(tenantId, id);
    if (!existing) return null;
    const update: Record<string, unknown> = { ...data };
    if (data.sentAt !== undefined) {
      update.sentAt = data.sentAt ? new Date(data.sentAt) : null;
    }
    const updated = await prisma.campaign.update({ where: { id }, data: update });
    revalidateTag(`tenant:${tenantId}:campaigns`, "max");
    return { previous: existing, updated };
  },

  async deleteForTenant(tenantId: string, id: string) {
    const existing = await this.getForTenant(tenantId, id);
    if (!existing) return null;
    await prisma.campaign.delete({ where: { id } });
    revalidateTag(`tenant:${tenantId}:campaigns`, "max");
    return existing;
  },
};
