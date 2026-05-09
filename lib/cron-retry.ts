import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { trackCronExecution } from "@/lib/cron/health-tracker";

/**
 * Wraps a cron job function with retry logic, dead-letter logging, and health tracking.
 */
export async function withCronRetry<T>(
  jobName: string,
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000 } = options;
  const startMs = Date.now();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      trackCronExecution({ jobName, status: "success", durationMs: Date.now() - startMs }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[cron/${jobName}] Attempt failed`, { jobName, attempt, maxRetries, error: message });

      if (attempt === maxRetries) {
        // Dead-letter: log the permanent failure
        try {
          await (prisma as Record<string, unknown> & typeof prisma).$executeRawUnsafe(
            `INSERT INTO "CronDeadLetter" (id, "jobName", error, attempts, payload, "createdAt") VALUES (gen_random_uuid(), $1, $2, $3, NULL, NOW())`,
            jobName,
            message.slice(0, 2000),
            maxRetries
          );
        } catch (dlErr) {
          logger.error(`[cron/${jobName}] Failed to write dead letter`, { error: String(dlErr) });
        }
        trackCronExecution({ jobName, status: "failure", durationMs: Date.now() - startMs, error: message }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
        throw err;
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
    }
  }

  // TypeScript requires this but it's unreachable
  throw new Error("Unreachable");
}
