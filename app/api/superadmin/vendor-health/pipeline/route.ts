import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/vendor-health/pipeline — panorama del pipeline de vendors
 * (Brandon 2026-06-19). Da valor INMEDIATO a Salud de vendors sin depender del
 * cron RENIEC/SUNAT: cuántas solicitudes hay por estado, las pendientes de
 * revisión con su antigüedad, cuántos vendors aprobados quedan elegibles para
 * la re-verificación, y cuándo corre el cron. Datos REALES de vendor_applications.
 */

function nextRunUtc(now: Date): string {
  // El cron de re-verification corre 02:00 UTC diario.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 0, 0));
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const [byStatusRaw, pending, approvedMonitored] = await Promise.all([
      prisma.vendorApplication.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.vendorApplication.findMany({
        where: { status: "pending" },
        orderBy: { submittedAt: "asc" },
        take: 12,
        select: { id: true, businessName: true, ruc: true, contactName: true, submittedAt: true },
      }),
      prisma.vendorApplication.count({ where: { status: "approved", tenantSlug: { not: null } } }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const r of byStatusRaw) byStatus[r.status] = r._count._all;

    const nowMs = now.getTime();
    const pendingList = pending.map((p) => ({
      id: p.id,
      businessName: p.businessName,
      ruc: p.ruc,
      contactName: p.contactName,
      submittedAt: p.submittedAt.toISOString(),
      ageDays: Math.floor((nowMs - p.submittedAt.getTime()) / 86_400_000),
    }));
    const oldestPendingDays = pendingList.length ? Math.max(...pendingList.map((p) => p.ageDays)) : 0;

    return NextResponse.json({
      byStatus: {
        pending: byStatus.pending ?? 0,
        approved: byStatus.approved ?? 0,
        rejected: byStatus.rejected ?? 0,
        info_requested: byStatus.info_requested ?? 0,
      },
      total: byStatusRaw.reduce((s, r) => s + r._count._all, 0),
      approvedMonitored,
      oldestPendingDays,
      pendingList,
      nextRunAt: nextRunUtc(now),
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    logger.error("[superadmin/vendor-health/pipeline] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
