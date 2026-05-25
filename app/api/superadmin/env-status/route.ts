import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { getEnvStatus } from "@/lib/superadmin/env-status";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/env-status
 *
 * Devuelve la PRESENCIA (boolean) de cada env var crítica de la plataforma.
 * Auth: sólo superadmin (cookie platform session).
 *
 * SEGURIDAD: este endpoint nunca expone el valor real de ningún secreto —
 * sólo un boolean por key. El cliente no puede leer env vars desde el browser.
 */

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

export async function GET(req: NextRequest) {
  try {
    const rateLimited = applyRateLimit(req, "GENEROUS", "sa-env-status-get");
    if (rateLimited) return rateLimited;

    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ envStatus: getEnvStatus() });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
