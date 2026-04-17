import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";

/**
 * Wrapper que centraliza la autenticación de cron jobs.
 *
 * Valida Bearer <CRON_SECRET> y el header x-vercel-cron-signature.
 * Uso:
 *   export const GET = withCronAuth("job-name", async (req) => {
 *     // business logic — ya autenticado
 *     return NextResponse.json({ ok: true });
 *   });
 */
export function withCronAuth(
  jobName: string,
  handler: (req: NextRequest) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization") ?? "";

    if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
      logger.warn(`[cron/${jobName}] Unauthorized cron attempt`, {
        ip: req.headers.get("x-forwarded-for") ?? "unknown",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return handler(req);
  };
}
