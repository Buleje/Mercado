import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { trackCronExecution } from "@/lib/cron/health-tracker";
import { logger } from "@/lib/logger";

/**
 * withCronHealth — wrapper compuesto para cron jobs.
 *
 * Combina autenticacion CRON_SECRET + tracking de salud en CronHealthLog.
 * Reemplaza `withCronAuth` cuando ademas quieres metricas de ejecucion.
 *
 * Uso:
 *   export const GET = withCronHealth("settle-commissions", async (req) => {
 *     return NextResponse.json({ ok: true });
 *   });
 *
 * Persiste en CronHealthLog: jobName, status ("success"|"failure"),
 * durationMs, error (truncado a 500 chars).
 */
export function withCronHealth(
  jobName: string,
  handler: (req: NextRequest) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization") ?? "";

    if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
      logger.warn(`[cron/${jobName}] Unauthorized attempt`, {
        ip: req.headers.get("x-forwarded-for") ?? "unknown",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Execute + track ───────────────────────────────────────────────────────
    const start = Date.now();

    try {
      const result = await handler(req);
      const durationMs = Date.now() - start;

      // Fire-and-forget: tracking nunca bloquea la respuesta al cron
      trackCronExecution({ jobName, status: "success", durationMs }).catch((e) =>
        logger.warn(`[cron/${jobName}] health track failed`, { error: String(e) })
      );

      logger.info(`[cron/${jobName}] OK`, { durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);

      trackCronExecution({
        jobName,
        status: "failure",
        durationMs,
        error: errorMsg,
      }).catch((e) =>
        logger.warn(`[cron/${jobName}] health track failed`, { error: String(e) })
      );

      logger.error(`[cron/${jobName}] FAILED`, { error: errorMsg, durationMs });
      return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
    }
  };
}
