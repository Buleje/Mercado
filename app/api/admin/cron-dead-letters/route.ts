import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import {
  listCronDeadLetters,
  deleteCronDeadLettersByIds,
  deleteCronDeadLettersByJobName,
} from "@/lib/db/admin-cron-dead-letters.db";

/**
 * GET /api/admin/cron-dead-letters
 *
 * Lists cron dead-letter entries — jobs that failed after all retry attempts.
 *
 * Audit project-wide 2026-05-19: migrado de prisma.* directo a AdminCronDeadLettersDB.
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
    const result = await listCronDeadLetters(jobName, limit);

    logger.info("[admin/cron-dead-letters] Listed", { tenantId, count: result.total });

    return NextResponse.json(result);
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
  const _rl = await applyRateLimit(req, "MODERATE", "admin-cron-dead-letters"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
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
      deleted = await deleteCronDeadLettersByIds(body.ids);
    } else if (typeof body.jobName === "string") {
      deleted = await deleteCronDeadLettersByJobName(body.jobName);
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
      ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    } catch { /* logger not available */ }

    return NextResponse.json({ deleted });
  } catch (err) {
    logger.error("[admin/cron-dead-letters] Delete error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
