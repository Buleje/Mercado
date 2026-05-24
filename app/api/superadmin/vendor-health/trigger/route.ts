/**
 * POST /api/superadmin/vendor-health/trigger
 *
 * Dispara manualmente el cron vendor-identity-recheck desde el dashboard.
 * El handler real vive en /api/cron/vendor-identity-recheck (auth via
 * CRON_SECRET) — acá hacemos un fetch interno con el secret server-side
 * para no duplicar lógica.
 *
 * Auth: requirePlatformAPI (PLATFORM_SESSION) + rate limit STRICT (acción
 * costosa: hits RENIEC/SUNAT, ≤200 vendors por ejecución).
 *
 * Audit ref: TD-058 — control superadmin sobre el ciclo automático.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  // STRICT — esta acción es costosa, no queremos abuse aunque la cookie sea
  // de superadmin (mitiga compromiso de sesión + uso accidental en loop).
  const rl = await applyRateLimit(
    req,
    "STRICT",
    "superadmin-vendor-health-trigger",
  );
  if (rl) return rl;

  // CSRF defense-in-depth — el cliente envía X-CSRF-Token via csrfHeaders()
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error(
      "[superadmin/vendor-health/trigger] CRON_SECRET missing in env",
    );
    return NextResponse.json(
      { error: "CRON_SECRET no configurado en el servidor" },
      { status: 500 },
    );
  }

  // Construir URL absoluta al cron interno (mismo origin).
  const origin = req.nextUrl.origin;
  const cronUrl = `${origin}/api/cron/vendor-identity-recheck`;

  logger.info("[superadmin/vendor-health/trigger] manual trigger requested", {
    by: auth.username,
  });

  try {
    const cronRes = await fetch(cronUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${secret}`,
        // marca para que el cron loggee distinto si quiere
        "x-trigger-source": "superadmin-manual",
        "x-trigger-by": auth.username,
      },
      // No cachear ni reusar — esto es one-shot
      cache: "no-store",
    });

    const body = (await cronRes.json().catch(() => ({}))) as {
      ok?: boolean;
      total?: number;
      checked?: number;
      changed?: number;
      errors?: number;
      [k: string]: unknown;
    };

    if (!cronRes.ok) {
      logger.warn(
        "[superadmin/vendor-health/trigger] cron returned non-2xx",
        { status: cronRes.status, body },
      );
      return NextResponse.json(
        {
          error: `El cron respondió HTTP ${cronRes.status}`,
          detail: body,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Cron ejecutado · summary actualizado",
      cron: body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[superadmin/vendor-health/trigger] failed", { error: msg });
    return NextResponse.json(
      { error: `No se pudo invocar el cron: ${msg}` },
      { status: 500 },
    );
  }
}
