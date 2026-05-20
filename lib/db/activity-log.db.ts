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

export interface ActivityLogPageOpts {
  entity?: string;
  user?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityLogPageEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string;
  user: string;
  ipAddress: string | null;
  userAgent: string | null;
  tenantId: string;
  createdAt: Date;
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

  /**
   * Paginacion con offset + filtros amplios para el audit trail admin.
   * Soporta filtros: entity exacto, action exacto, user contains.
   * Devuelve {logs, total} para que el caller pueda renderizar pager.
   *
   * Audit project-wide 2026-05-19 — migracion de /api/audit-trail.
   */
  async listPaginated(
    tenantId: string,
    opts: ActivityLogPageOpts = {},
  ): Promise<{ logs: ActivityLogPageEntry[]; total: number }> {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const where: Record<string, unknown> = { tenantId };
    if (opts.entity) where.entity = opts.entity;
    if (opts.action) where.action = opts.action;
    if (opts.user) where.user = { contains: opts.user, mode: "insensitive" as const };

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          detail: true,
          user: true,
          ipAddress: true,
          userAgent: true,
          tenantId: true,
          createdAt: true,
        },
      }),
      prisma.activityLog.count({ where }),
    ]);
    return { logs, total };
  },
};
