import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * SecurityLogsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/security-logs.
 * Lee ActivityLog filtrando por tenant y mapea al formato SecurityLogEntry.
 * Las escrituras siguen siendo fire-and-forget via lib/activity-logger.
 */

export type SecurityLogCategory = "auth" | "data" | "config" | "security";
export type SecurityLogSeverity = "info" | "warning" | "critical";

export interface SecurityLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  category: SecurityLogCategory;
  severity: SecurityLogSeverity;
  ip: string;
  details: string;
  success: boolean;
}

interface ListOpts {
  limit?: number;
  category?: string;
  severity?: string;
  from?: string;
  to?: string;
}

export const SecurityLogsDB = {
  /**
   * Lista entradas de ActivityLog del tenant mapeadas a SecurityLogEntry.
   * Filtros: category (entity), severity (en memoria post-query), from/to (createdAt).
   */
  async list(tenantId: string, opts: ListOpts = {}): Promise<SecurityLogEntry[]> {
    const limit = Math.min(opts.limit ?? 50, 100);

    const rows = await prisma.activityLog.findMany({
      where: {
        tenantId,
        ...(opts.category ? { entity: opts.category } : {}),
        ...(opts.from ? { createdAt: { gte: new Date(opts.from) } } : {}),
        ...(opts.to ? { createdAt: { lte: new Date(opts.to) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        user: true,
        action: true,
        entity: true,
        detail: true,
      },
    });

    const entries: SecurityLogEntry[] = rows.map((r) => ({
      id: r.id,
      timestamp: r.createdAt.toISOString(),
      actor: r.user,
      action: r.action,
      category: (r.entity as SecurityLogCategory) ?? "auth",
      severity: "info" as SecurityLogSeverity,
      ip: "—",
      details: r.detail,
      success: true,
    }));

    // Filtro severity en memoria (ActivityLog no almacena severity nativo)
    if (opts.severity) {
      return entries.filter((e) => e.severity === opts.severity);
    }
    return entries;
  },
};
