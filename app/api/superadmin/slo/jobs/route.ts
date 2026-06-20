import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/slo/jobs — SLO de confiabilidad de los crons/jobs, con
 * datos REALES de CronHealthLog (Brandon 2026-06-19). Ventana 7 días:
 *  - por job: corridas, éxitos, success rate, duración promedio y p95 real
 *    (percentile_cont), última corrida + si está stale (sin correr >26h).
 *  - global: success rate y error budget vs objetivo 99% (presupuesto de fallos
 *    consumido). Todo medido; nada inventado.
 */

const TARGET = 0.99; // objetivo de éxito de los jobs
const STALE_HOURS = 26; // la mayoría corre ~diario

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const [agg, latest] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ jobName: string; runs: bigint; successes: bigint; avg_ms: number | null; p95_ms: number | null; max_ms: number | null; last_run: Date | null }>>(
        `SELECT "jobName",
           COUNT(*)::bigint AS runs,
           COUNT(*) FILTER (WHERE status = 'success')::bigint AS successes,
           ROUND(AVG("durationMs"))::int AS avg_ms,
           ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs"))::int AS p95_ms,
           MAX("durationMs")::int AS max_ms,
           MAX("createdAt") AS last_run
         FROM "CronHealthLog"
         WHERE "createdAt" > NOW() - INTERVAL '7 days'
         GROUP BY "jobName"`,
      ),
      prisma.$queryRawUnsafe<Array<{ jobName: string; last_status: string }>>(
        `SELECT DISTINCT ON ("jobName") "jobName", status AS last_status
         FROM "CronHealthLog"
         WHERE "createdAt" > NOW() - INTERVAL '7 days'
         ORDER BY "jobName", "createdAt" DESC`,
      ),
    ]);

    const lastStatus = new Map(latest.map((r) => [r.jobName, r.last_status]));
    const now = Date.now();

    const jobs = agg.map((r) => {
      const runs = Number(r.runs);
      const successes = Number(r.successes);
      const lastRun = r.last_run ? r.last_run.toISOString() : null;
      const hoursSince = r.last_run ? (now - r.last_run.getTime()) / 3_600_000 : Infinity;
      return {
        jobName: r.jobName,
        runs,
        successes,
        failures: runs - successes,
        successRate: runs > 0 ? Math.round((successes / runs) * 1000) / 10 : 0,
        avgMs: r.avg_ms ?? null,
        p95Ms: r.p95_ms ?? null,
        maxMs: r.max_ms ?? null,
        lastRun,
        lastStatus: lastStatus.get(r.jobName) ?? "unknown",
        stale: hoursSince > STALE_HOURS,
      };
    }).sort((a, b) => a.successRate - b.successRate || b.failures - a.failures);

    const totalRuns = jobs.reduce((s, j) => s + j.runs, 0);
    const totalFailures = jobs.reduce((s, j) => s + j.failures, 0);
    const successRate = totalRuns > 0 ? Math.round(((totalRuns - totalFailures) / totalRuns) * 1000) / 10 : 100;
    // Error budget: fallos permitidos = totalRuns * (1 - target). Consumido = fallos / permitidos.
    const allowedFailures = totalRuns * (1 - TARGET);
    const budgetConsumedPct = allowedFailures > 0 ? Math.round((totalFailures / allowedFailures) * 1000) / 10 : (totalFailures > 0 ? 100 : 0);

    return NextResponse.json({
      targetPct: TARGET * 100,
      windowDays: 7,
      overall: {
        jobs: jobs.length,
        totalRuns,
        totalFailures,
        successRate,
        budgetConsumedPct,
        budgetRemainingPct: Math.max(0, Math.round((100 - budgetConsumedPct) * 10) / 10),
        breached: successRate < TARGET * 100,
        staleJobs: jobs.filter((j) => j.stale).length,
        failingJobs: jobs.filter((j) => j.failures > 0).length,
      },
      jobs,
      generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[superadmin/slo/jobs] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
