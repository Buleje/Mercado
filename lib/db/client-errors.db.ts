import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/client-errors.db.ts — errores runtime del panel admin de los negocios
 * (Brandon 2026-06-19). El error boundary los reporta a /api/admin/log-error;
 * acá se persisten con tenantId y se dedupean por (tenantId+digest+source) sin
 * resolver → incrementa `count`. El superadmin los ve en vivo para ayudar al
 * negocio (impersonar / contactar / resolver).
 */

export interface ClientErrorRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string | null;
  digest: string | null;
  message: string;
  source: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ClientErrorStats {
  groups: number; // grupos de error distintos sin resolver
  totalOccurrences: number; // suma de `count`
  affectedTenants: number;
  lastHour: number; // grupos vistos en la última hora
}

/** Registra (o dedupea) un error de panel admin. Best-effort: nunca rompe el beacon. */
export async function recordClientError(input: {
  tenantId: string; message: string; digest?: string | null; source?: string | null; userAgent?: string | null;
}): Promise<void> {
  try {
    const existing = await prisma.clientErrorLog.findFirst({
      where: { tenantId: input.tenantId, digest: input.digest ?? null, source: input.source ?? "", resolvedAt: null },
      select: { id: true },
    });
    if (existing) {
      await prisma.clientErrorLog.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, lastSeenAt: new Date(), message: input.message.slice(0, 2000) },
      });
    } else {
      await prisma.clientErrorLog.create({
        data: {
          tenantId: input.tenantId,
          message: input.message.slice(0, 2000),
          digest: input.digest ?? null,
          source: (input.source ?? "").slice(0, 100),
          userAgent: input.userAgent?.slice(0, 300) ?? null,
        },
      });
    }
  } catch (err) {
    logger.warn("[client-errors.db] recordClientError failed", { error: String(err) });
  }
}

/** Errores sin resolver, con el nombre/slug del negocio, más recientes primero. */
export async function getClientErrors(limit = 100): Promise<ClientErrorRow[]> {
  try {
    const rows = await prisma.clientErrorLog.findMany({ where: { resolvedAt: null }, orderBy: { lastSeenAt: "desc" }, take: limit });
    const ids = [...new Set(rows.map((r) => r.tenantId))];
    const tenants = ids.length
      ? await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })
      : [];
    const tmap = new Map(tenants.map((t) => [t.id, t]));
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: tmap.get(r.tenantId)?.name ?? r.tenantId,
      tenantSlug: tmap.get(r.tenantId)?.slug ?? null,
      digest: r.digest,
      message: r.message,
      source: r.source,
      count: r.count,
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
    }));
  } catch (err) {
    logger.warn("[client-errors.db] getClientErrors failed", { error: String(err) });
    return [];
  }
}

export async function getClientErrorStats(): Promise<ClientErrorStats> {
  try {
    const hourAgo = new Date(Date.now() - 3_600_000);
    const [groups, sum, tenants, lastHour] = await Promise.all([
      prisma.clientErrorLog.count({ where: { resolvedAt: null } }),
      prisma.clientErrorLog.aggregate({ where: { resolvedAt: null }, _sum: { count: true } }),
      prisma.clientErrorLog.findMany({ where: { resolvedAt: null }, distinct: ["tenantId"], select: { tenantId: true } }),
      prisma.clientErrorLog.count({ where: { resolvedAt: null, lastSeenAt: { gte: hourAgo } } }),
    ]);
    return { groups, totalOccurrences: sum._sum.count ?? 0, affectedTenants: tenants.length, lastHour };
  } catch (err) {
    logger.warn("[client-errors.db] getClientErrorStats failed", { error: String(err) });
    return { groups: 0, totalOccurrences: 0, affectedTenants: 0, lastHour: 0 };
  }
}

export async function resolveClientError(id: string, by: string): Promise<boolean> {
  try {
    await prisma.clientErrorLog.update({ where: { id }, data: { resolvedAt: new Date(), resolvedBy: by } });
    return true;
  } catch (err) {
    logger.warn("[client-errors.db] resolveClientError failed", { id, error: String(err) });
    return false;
  }
}
