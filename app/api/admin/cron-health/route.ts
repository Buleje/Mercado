import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/cron-health
 *
 * Shows cron execution health: last execution per job, success/failure counts,
 * avg duration, and dead letters pending.
 *
 * Admin-only.
 *
 * @platform-shared ok — Brandon 2026-05-16 (audit Info): CronHealthLog
 * y CronDeadLetter son tablas plataforma-wide (los cron jobs no son
 * por-tenant). Un admin de un tenant puede inferir el ritmo de cron de
 * la plataforma pero no datos de otros tenants. Aceptable como info
 * para diagnóstico de salud. Si en el futuro queremos restringir más,
 * mover a /api/superadmin/cron-health.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [healthLogs, deadLetterCounts] = await Promise.all([
      // Last 24h of cron executions grouped by job
      prisma.cronHealthLog.groupBy({
        by: ["jobName", "status"],
        where: { createdAt: { gte: oneDayAgo } },
        _count: { id: true },
        _avg: { durationMs: true },
      }),
      // Dead letters per job
      prisma.cronDeadLetter.groupBy({
        by: ["jobName"],
        _count: { id: true },
      }),
    ]);

    // Build a map per job
    const jobMap = new Map<string, {
      jobName: string;
      successCount24h: number;
      failureCount24h: number;
      avgDurationMs: number;
      deadLetters: number;
    }>();

    for (const log of healthLogs) {
      if (!jobMap.has(log.jobName)) {
        jobMap.set(log.jobName, {
          jobName: log.jobName,
          successCount24h: 0,
          failureCount24h: 0,
          avgDurationMs: 0,
          deadLetters: 0,
        });
      }
      const entry = jobMap.get(log.jobName)!;
      if (log.status === "success") {
        entry.successCount24h = log._count.id;
        entry.avgDurationMs = Math.round(log._avg.durationMs ?? 0);
      } else {
        entry.failureCount24h += log._count.id;
      }
    }

    for (const dl of deadLetterCounts) {
      if (!jobMap.has(dl.jobName)) {
        jobMap.set(dl.jobName, {
          jobName: dl.jobName,
          successCount24h: 0,
          failureCount24h: 0,
          avgDurationMs: 0,
          deadLetters: dl._count.id,
        });
      } else {
        jobMap.get(dl.jobName)!.deadLetters = dl._count.id;
      }
    }

    const jobs = [...jobMap.values()].sort((a, b) => b.deadLetters - a.deadLetters || b.failureCount24h - a.failureCount24h);

    return NextResponse.json({
      jobs,
      totalDeadLetters: deadLetterCounts.reduce((sum, d) => sum + d._count.id, 0),
      period: "24h",
    });
  } catch (err) {
    logger.error("[admin/cron-health] Error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
