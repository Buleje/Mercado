import { prisma } from "@/lib/prisma";

/**
 * Wraps a cron job function with retry logic and dead-letter logging.
 * On permanent failure (all retries exhausted), logs to CronDeadLetter table.
 */
export async function withCronRetry<T>(
  jobName: string,
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[cron/${jobName}] Attempt ${attempt}/${maxRetries} failed: ${message}`);

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
          console.error(`[cron/${jobName}] Failed to write dead letter:`, dlErr);
        }
        throw err;
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
    }
  }

  // TypeScript requires this but it's unreachable
  throw new Error("Unreachable");
}
