import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/cron-dead-letters
 *
 * Lists cron dead-letter entries — jobs that failed after all retry attempts.
 *
 * SUPERADMIN-ONLY (BUG-FIX audit 2026-05-05): el modelo CronDeadLetter no tiene
 * `tenantId` por design — son logs globales del sistema. Permitir acceso a
 * admins regulares era un leak cross-tenant: cualquier dueño veía fallos cron
 * de TODOS los tenants. Hasta que se agregue tenantId al schema, restringimos
 * a superadmin.
 *
 * Query params:
 *   ?jobName=batch-expiry-alerts  — filter by job
 *   ?limit=20                     — limit results (max 100)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["superadmin"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "global";
  const { searchParams } = new URL(req.url);
  const jobName = searchParams.get("jobName");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  try {
    const entries = await prisma.cronDeadLetter.findMany({
      where: {
        ...(jobName ? { jobName } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Also get summary counts per job
    const summary = await prisma.cronDeadLetter.groupBy({
      by: ["jobName"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    logger.info("[admin/cron-dead-letters] Listed", { tenantId, count: entries.length });

    return NextResponse.json({
      entries,
      summary: summary.map((s) => ({
        jobName: s.jobName,
        failureCount: s._count.id,
      })),
      total: entries.length,
    });
  } catch (err) {
    logger.error("[admin/cron-dead-letters] Error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/cron-dead-letters
 *
 * Clears resolved dead-letter entries by ID or by job name.
 * Body: { ids: string[] } or { jobName: string }
 */
export async function DELETE(req: NextRequest) {
  // BUG-FIX (audit 2026-05-05): SUPERADMIN-ONLY — ver comentario en GET
  const auth = await requireAdmin(req, ["superadmin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch((err) => { logger.error("[admin/cron-dead-letters] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    let deleted = 0;

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const result = await prisma.cronDeadLetter.deleteMany({
        where: { id: { in: body.ids } },
      });
      deleted = result.count;
    } else if (typeof body.jobName === "string") {
      const result = await prisma.cronDeadLetter.deleteMany({
        where: { jobName: body.jobName },
      });
      deleted = result.count;
    } else {
      return NextResponse.json({ error: "Provide ids[] or jobName" }, { status: 400 });
    }

    logger.info("[admin/cron-dead-letters] Cleared", { deleted });

    // COMPLIANCE 2026-05-06 (Ley 29733): audit trail de borrado de DLQ.
    try {
      const { logActivity } = await import("@/lib/activity-logger");
      logActivity(
        "dlq_clear",
        "admin",
        `${deleted} dead letters borradas por ${auth.username}`,
        auth.username,
        auth.username,
      ).catch(() => {});
    } catch { /* logger not available */ }

    return NextResponse.json({ deleted });
  } catch (err) {
    logger.error("[admin/cron-dead-letters] Delete error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
