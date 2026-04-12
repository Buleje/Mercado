import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { SuperadminTotpDB } from "@/lib/db/admin-totp.db";
import { generateTotpSecret, buildOtpauthUri } from "@/lib/auth/totp";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/totp/enroll
 *
 * Genera un secret TOTP para el superadmin autenticado y devuelve la URL
 * otpauth para escanear con la app autenticadora. NO activa 2FA todavía.
 *
 * Auth: getPlatformSession (cookie PLATFORM_SESSION, no requireAdmin)
 * Rate limit: 5 req / 15 min — protección contra enumeración
 * Body: ninguno requerido
 *
 * Respuesta 200: { secret: string, otpauthUrl: string }
 * Respuesta 400: { error: "user_not_found" } — si el SuperadminUser no existe en DB
 */

const enrollLimiter = createRateLimiter({ maxRequests: 5, windowMs: 15 * 60 * 1000 });

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

export async function POST(req: NextRequest) {
  // 1. Rate limit
  const rateLimited = applyRateLimit(req, enrollLimiter);
  if (rateLimited) return rateLimited;

  // 2. Auth superadmin
  const session = await requirePlatform(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // 3. Verificar que el SuperadminUser existe en DB
    const row = await SuperadminTotpDB.getByUsername(session.username);
    if (!row) {
      logger.warn("[superadmin/totp/enroll] Usuario no encontrado en DB", {
        username: session.username,
      });
      return NextResponse.json({ error: "user_not_found" }, { status: 400 });
    }

    // 4. Generar secret y URI
    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpauthUri(secret, session.username, "Buleje Platform");

    // 5. Guardar secret pendiente (totpEnabledAt queda null hasta verify)
    await SuperadminTotpDB.saveSecret(session.username, secret);

    logger.info("[superadmin/totp/enroll] Secret generado", {
      username: session.username,
    });

    return NextResponse.json({ secret, otpauthUrl });
  } catch (err) {
    logger.error("[superadmin/totp/enroll] Error generando secret", {
      username: session.username,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
