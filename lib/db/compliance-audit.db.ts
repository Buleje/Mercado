import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/compliance-audit.db.ts — Auditoría Ley 29733 a nivel plataforma
 * (Brandon 2026-06-19). El ActivityLog marca con prefijo `[L29733]` los
 * accesos/tratamiento de DATOS PERSONALES (clientes, ventas, fiados…). Esto arma
 * el registro de auditoría que la ley peruana de protección de datos exige:
 * quién tocó qué dato, cuándo, desde dónde. Real, sin adorno.
 *
 * NOTA: distinto de ComplianceDB (compliance.db.ts) que es de obligaciones
 * tributarias/municipales por tenant (ADR-107).
 */

const TAG = "[L29733]";
const clean = (entity: string) => entity.replace(/^\[L29733\]\s*/, "").trim() || entity;

export interface ComplianceLogRow { action: string; dataType: string; detail: string; user: string; tenantName: string; ipAddress: string | null; createdAt: string }
export interface ComplianceAuditResult {
  kpis: { totalAccesses: number; tenants: number; last7d: number; dataTypes: number };
  byType: { type: string; count: number }[];
  byAction: { action: string; count: number }[];
  log: ComplianceLogRow[];
}

export async function getComplianceAudit(): Promise<ComplianceAuditResult> {
  try {
    const where = { entity: { startsWith: TAG } } as const;
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [total, last7d, byTypeRaw, byActionRaw, tenantsRaw, recent] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.count({ where: { ...where, createdAt: { gte: weekAgo } } }),
      prisma.activityLog.groupBy({ by: ["entity"], where, _count: { _all: true }, orderBy: { _count: { entity: "desc" } }, take: 12 }),
      prisma.activityLog.groupBy({ by: ["action"], where, _count: { _all: true }, orderBy: { _count: { action: "desc" } }, take: 8 }),
      prisma.activityLog.findMany({ where, distinct: ["tenantId"], select: { tenantId: true } }),
      prisma.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 80, select: { action: true, entity: true, detail: true, user: true, tenantId: true, ipAddress: true, createdAt: true } }),
    ]);

    const ids = [...new Set(recent.map((r) => r.tenantId))];
    const tenants = ids.length ? await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const tmap = new Map(tenants.map((t) => [t.id, t.name]));

    return {
      kpis: { totalAccesses: total, tenants: tenantsRaw.length, last7d, dataTypes: byTypeRaw.length },
      byType: byTypeRaw.map((b) => ({ type: clean(b.entity), count: b._count._all })),
      byAction: byActionRaw.map((b) => ({ action: b.action, count: b._count._all })),
      log: recent.map((r) => ({
        action: r.action, dataType: clean(r.entity), detail: r.detail, user: r.user,
        tenantName: tmap.get(r.tenantId) ?? r.tenantId, ipAddress: r.ipAddress,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    logger.error("[compliance-audit.db] getComplianceAudit failed", { error: String(err) });
    return { kpis: { totalAccesses: 0, tenants: 0, last7d: 0, dataTypes: 0 }, byType: [], byAction: [], log: [] };
  }
}
