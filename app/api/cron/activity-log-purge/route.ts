import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/activity-log-purge
 *
 * Audit 2026-06-10 P2: ActivityLog es la tabla más grande del sistema y no
 * tenía retención — crecía sin límite. Como vaciar el archivador de papeles
 * viejos: lo de hace más de 90 días ya no sirve para auditoría operativa
 * diaria (la obligación Ley 29733 se cubre con el período retenido).
 *
 * - ActivityLog: retención 90 días
 * - CronHealthLog: retención 30 días (heartbeats, solo valor reciente)
 *
 * Authorization: Bearer <CRON_SECRET>
 * Schedule: weekly → "0 4 * * 0" (domingos 4 AM)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ACTIVITY_RETENTION_DAYS = 90;
  const CRON_HEALTH_RETENTION_DAYS = 30;

  try {
    const activityCutoff = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const healthCutoff = new Date(Date.now() - CRON_HEALTH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const deletedActivity = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: activityCutoff } },
    });

    const deletedHealth = await prisma.cronHealthLog.deleteMany({
      where: { createdAt: { lt: healthCutoff } },
    });

    logger.info("[activity-log-purge] retention applied", {
      activityCutoff: activityCutoff.toISOString(),
      activityDeleted: deletedActivity.count,
      healthCutoff: healthCutoff.toISOString(),
      healthDeleted: deletedHealth.count,
    });

    return NextResponse.json({
      ok: true,
      activityDeleted: deletedActivity.count,
      healthDeleted: deletedHealth.count,
    });
  } catch (err) {
    logger.error("[activity-log-purge] failed", { error: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
