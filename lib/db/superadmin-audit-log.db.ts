import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/superadmin-audit-log.db.ts — LECTURA del registro de acciones del
 * superadmin (Brandon 2026-06-19, idea #F). Las acciones sensibles (impersonar,
 * aprobar pagos, broadcasts, toggles) se loguean con entity="superadmin.audit"
 * vía logSuperadminAction (lib/audit/superadmin-audit.ts, el WRITER). Esto las
 * muestra: quién hizo qué y cuándo — confianza y trazabilidad.
 */

const ENTITY = "superadmin.audit";
const IMPERSONATE = ["impersonate", "impersonate-partner"];

export interface SuperadminAuditRow { action: string; detail: string; user: string; createdAt: string }
export interface SuperadminAuditResult {
  kpis: { total: number; impersonations: number; last24h: number; users: number };
  byAction: { action: string; count: number }[];
  log: SuperadminAuditRow[];
}

export async function getSuperadminAuditLog(): Promise<SuperadminAuditResult> {
  try {
    const where = { entity: ENTITY } as const;
    const dayAgo = new Date(Date.now() - 86_400_000);
    const [total, impersonations, last24h, usersRaw, byActionRaw, recent] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.count({ where: { ...where, action: { in: IMPERSONATE } } }),
      prisma.activityLog.count({ where: { ...where, createdAt: { gte: dayAgo } } }),
      prisma.activityLog.findMany({ where, distinct: ["user"], select: { user: true } }),
      prisma.activityLog.groupBy({ by: ["action"], where, _count: { _all: true }, orderBy: { _count: { action: "desc" } }, take: 12 }),
      prisma.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, select: { action: true, detail: true, user: true, createdAt: true } }),
    ]);

    return {
      kpis: { total, impersonations, last24h, users: usersRaw.length },
      byAction: byActionRaw.map((b) => ({ action: b.action, count: b._count._all })),
      log: recent.map((r) => ({ action: r.action, detail: r.detail, user: r.user, createdAt: r.createdAt.toISOString() })),
    };
  } catch (err) {
    logger.error("[superadmin-audit-log.db] getSuperadminAuditLog failed", { error: String(err) });
    return { kpis: { total: 0, impersonations: 0, last24h: 0, users: 0 }, byAction: [], log: [] };
  }
}
