import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * ActivityLogDB
 *
 * Read-side de `ActivityLog`. Las escrituras siguen yendo via
 * `@/lib/activity-logger` (fire-and-forget queue). Esta clase
 * canoniza las lecturas para feeds del admin (changelog, audit log).
 *
 * Audit project-wide 2026-05-19 — migracion de /api/changelog.
 */

export interface ActivityLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string;
  user: string;
  createdAt: Date;
}

interface ListOpts {
  entity?: string;
  entityId?: string;
  limit?: number;
}

export const ActivityLogDB = {
  /**
   * Lista las entradas de log de un tenant ordenadas por createdAt desc.
   * Filtros opcionales: entity (tipo de recurso) + entityId.
   */
  async list(tenantId: string, opts: ListOpts = {}): Promise<ActivityLogEntry[]> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    return prisma.activityLog.findMany({
      where: {
        tenantId,
        ...(opts.entity ? { entity: opts.entity } : {}),
        ...(opts.entityId ? { entityId: opts.entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
};
