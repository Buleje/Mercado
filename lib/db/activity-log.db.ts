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
  /** Solo entradas creadas en o después de esta fecha (filtro de período). */
  since?: Date;
  limit?: number;
  offset?: number;
}

export interface ActivityLogSummary {
  total: number;
  /** Conteo por acción exacta, desc. Alimenta cards categorizadas + filtro. */
  byAction: Array<{ action: string; count: number }>;
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
    if (opts.since) where.createdAt = { gte: opts.since };

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

  /**
   * Paginacion cursor-based (id) + filtros amplios. Devuelve hasta limit
   * entradas + nextCursor para el siguiente fetch. Mas eficiente que
   * offset cuando hay mucho audit log.
   *
   * Audit project-wide 2026-05-19 — migracion de /api/activity-log.
   */
  async listWithCursor(
    tenantId: string,
    opts: {
      entity?: string;
      /** Un registro puntual: «qué le pasó a ESTE gasto», no a todos. */
      entityId?: string;
      user?: string;
      action?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<{ items: ActivityLogPageEntry[]; nextCursor: string | null }> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const where: Record<string, unknown> = { tenantId };
    if (opts.entity) where.entity = opts.entity;
    if (opts.entityId) where.entityId = opts.entityId;
    if (opts.user) where.user = opts.user;
    if (opts.action) where.action = opts.action;

    const rows = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
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
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;
    return { items, nextCursor };
  },

  /**
   * Resumen agregado del audit trail para las cards + filtro dinámico de
   * acciones del tab Auditoría. Cuenta por acción (groupBy) sobre el conjunto
   * filtrado por entity/user/since — deliberadamente SIN el filtro de action,
   * para que las categorías se muestren siempre completas y sean clickeables.
   */
  async summarize(
    tenantId: string,
    opts: { entity?: string; user?: string; since?: Date } = {},
  ): Promise<ActivityLogSummary> {
    const where: Record<string, unknown> = { tenantId };
    if (opts.entity) where.entity = opts.entity;
    if (opts.user) where.user = { contains: opts.user, mode: "insensitive" as const };
    if (opts.since) where.createdAt = { gte: opts.since };

    const grouped = await prisma.activityLog.groupBy({
      by: ["action"],
      where,
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
    });

    const byAction = grouped.map((g) => ({ action: g.action, count: g._count.action }));
    const total = byAction.reduce((acc, g) => acc + g.count, 0);
    return { total, byAction };
  },

  /**
   * Eventos de seguridad PLATFORM-WIDE (cross-tenant) — para el Security Center
   * de superadmin. A diferencia del resto de la clase, NO scopea por tenantId:
   * los ataques (WAF/injection) son un concern de plataforma, no de un tenant.
   * Uso EXCLUSIVO superadmin (el endpoint que lo llama exige rol superadmin).
   */
  async listPlatformSecurityEvents(
    opts: { since?: Date; actions?: string[]; limit?: number } = {},
  ): Promise<ActivityLogPageEntry[]> {
    const limit = Math.min(2000, Math.max(1, opts.limit ?? 1000));
    const where: Record<string, unknown> = { entity: "security" };
    if (opts.actions && opts.actions.length > 0) where.action = { in: opts.actions };
    if (opts.since) where.createdAt = { gte: opts.since };
    return prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, action: true, entity: true, entityId: true, detail: true,
        user: true, ipAddress: true, userAgent: true, tenantId: true, createdAt: true,
      },
    });
  },

  /**
   * Crea una entrada de audit log directamente (no via queue). Usado
   * por endpoints que deben confirmar el insert antes de responder.
   */
  async create(
    tenantId: string,
    data: {
      action: string;
      entity: string;
      entityId?: string | null;
      detail: string;
      user: string;
    },
  ): Promise<ActivityLogPageEntry> {
    return prisma.activityLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId ?? null,
        detail: data.detail,
        user: data.user,
        tenantId,
      },
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
    });
  },
};
