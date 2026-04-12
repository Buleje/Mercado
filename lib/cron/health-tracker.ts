import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface CronExecution {
  jobName: string;
  status: "success" | "failure";
  durationMs: number;
  error?: string;
}

const recentExecutions = new Map<string, CronExecution & { timestamp: Date }>();

export async function trackCronExecution(exec: CronExecution): Promise<void> {
  recentExecutions.set(exec.jobName, { ...exec, timestamp: new Date() });

  if (recentExecutions.size > 200) {
    const oldest = [...recentExecutions.entries()].sort(
      (a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime()
    );
    for (let i = 0; i < 50; i++) recentExecutions.delete(oldest[i][0]);
  }

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CronHealthLog" (id, "jobName", status, "durationMs", error, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      exec.jobName,
      exec.status,
      exec.durationMs,
      exec.error?.slice(0, 500) ?? null
    );
  } catch (err) {
    logger.warn("[CronHealth] Failed to persist execution log", { error: String(err), job: exec.jobName });
  }
}

export interface CronHealthSummary {
  jobName: string;
  lastRun: Date | null;
  lastStatus: string;
  lastDurationMs: number;
  successCount24h: number;
  failureCount24h: number;
  successRate24h: number;
}

export async function getCronHealthSummary(): Promise<CronHealthSummary[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      jobName: string;
      lastRun: Date;
      lastStatus: string;
      lastDurationMs: number;
      successCount: bigint;
      failureCount: bigint;
    }>>(
      `SELECT
        "jobName",
        MAX("createdAt") AS "lastRun",
        (SELECT status FROM "CronHealthLog" c2 WHERE c2."jobName" = c1."jobName" ORDER BY "createdAt" DESC LIMIT 1) AS "lastStatus",
        (SELECT "durationMs" FROM "CronHealthLog" c3 WHERE c3."jobName" = c1."jobName" ORDER BY "createdAt" DESC LIMIT 1) AS "lastDurationMs",
        COUNT(*) FILTER (WHERE status = 'success' AND "createdAt" > NOW() - INTERVAL '24 hours') AS "successCount",
        COUNT(*) FILTER (WHERE status = 'failure' AND "createdAt" > NOW() - INTERVAL '24 hours') AS "failureCount"
      FROM "CronHealthLog" c1
      GROUP BY "jobName"
      ORDER BY "jobName"`
    );

    return rows.map((r) => {
      const success = Number(r.successCount);
      const failure = Number(r.failureCount);
      const total = success + failure;
      return {
        jobName: r.jobName,
        lastRun: r.lastRun,
        lastStatus: r.lastStatus,
        lastDurationMs: Number(r.lastDurationMs),
        successCount24h: success,
        failureCount24h: failure,
        successRate24h: total > 0 ? success / total : 1,
      };
    });
  } catch {
    const fallback: CronHealthSummary[] = [];
    for (const [name, exec] of recentExecutions) {
      fallback.push({
        jobName: name,
        lastRun: exec.timestamp,
        lastStatus: exec.status,
        lastDurationMs: exec.durationMs,
        successCount24h: exec.status === "success" ? 1 : 0,
        failureCount24h: exec.status === "failure" ? 1 : 0,
        successRate24h: exec.status === "success" ? 1 : 0,
      });
    }
    return fallback;
  }
}

export function formatCronHealthTable(summaries: CronHealthSummary[]): string {
  const header = "| Job | Last Run | Status | Duration | Success 24h | Failures 24h | Rate |";
  const sep = "|-----|----------|--------|----------|-------------|--------------|------|";
  const rows = summaries.map((s) => {
    const emoji = s.lastStatus === "success" ? "🟢" : "🔴";
    const ago = s.lastRun ? `${Math.round((Date.now() - s.lastRun.getTime()) / 60000)}m ago` : "never";
    return `| ${s.jobName} | ${ago} | ${emoji} ${s.lastStatus} | ${s.lastDurationMs}ms | ${s.successCount24h} | ${s.failureCount24h} | ${(s.successRate24h * 100).toFixed(0)}% |`;
  });
  return [header, sep, ...rows].join("\n");
}
