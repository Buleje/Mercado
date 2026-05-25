import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";

/**
 * VisitorWelcomeDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/visitor-welcome.
 * First-time visitor onboarding response (devices + name) — usado
 * para personalizacion del storefront.
 */

interface CreateData {
  name: string;
  devices: string[]; // se serializa a JSON
  userAgent?: string;
}

export const VisitorWelcomeDB = {
  async create(tenantId: string, data: CreateData) {
    return prisma.visitorWelcome.create({
      data: {
        name: data.name,
        devices: JSON.stringify(data.devices),
        userAgent: data.userAgent,
        tenantId,
      },
    });
  },

  /**
   * Paginacion por offset + count, devuelve { rows, total } para que el
   * caller pueda renderizar pager + parsear devices.
   */
  async listPaginated(
    tenantId: string,
    opts: { page?: number; limit?: number } = {},
  ): Promise<{
    rows: Array<{ id: string; name: string; devices: string; userAgent: string | null; createdAt: Date; tenantId: string }>;
    total: number;
  }> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:visitor-welcome`);
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      prisma.visitorWelcome.count({ where: { tenantId } }),
      prisma.visitorWelcome.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);
    return { rows, total };
  },
};
