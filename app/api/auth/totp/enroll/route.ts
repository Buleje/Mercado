import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { AdminTotpDB } from "@/lib/db/admin-totp.db";
import { generateTotpSecret, buildOtpauthUri } from "@/lib/auth/totp";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * POST /api/auth/totp/enroll
 *
 * Genera un secret TOTP para el admin autenticado y devuelve la URL otpauth
 * para escanear con la app autenticadora. NO activa 2FA todavía — eso requiere
 * verificar el primer token en /api/auth/totp/verify.
 *
 * Auth: requireAdmin (cualquier rol de tenant admin)
 * Rate limit: 5 req / 15 min por IP — protege contra enumeración
 * Body: ninguno requerido
 *
 * Respuesta 200: { secret: string, otpauthUrl: string }
 */

// Rate limiter independiente para flujos 2FA (más estricto que el preset STRICT)
const enrollLimiter = createRateLimiter({ maxRequests: 5, windowMs: 15 * 60 * 1000 });

export async function POST(req: NextRequest) {
  // 1. Rate limit
  const rateLimited = applyRateLimit(req, enrollLimiter);
  if (rateLimited) return rateLimited;

  // 2. Auth
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // 3. Generar secret y URI
    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpauthUri(secret, auth.username, "Buleje");

    // 4. Guardar secret pendiente (totpEnabledAt queda null hasta verify)
    await AdminTotpDB.saveSecret(auth.tenantId, auth.username, secret);

    logger.info("[totp/enroll] Secret generado", {
      username: auth.username,
      tenantId: auth.tenantId,
    });

    // 5. Audit log fire-and-forget
    logActivity(
      "totp_enroll_started",
      "AdminUser",
      `Admin ${auth.username} inició enrolamiento TOTP`,
      undefined,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch(() => {});

    return NextResponse.json({ secret, otpauthUrl });
  } catch (err) {
    logger.error("[totp/enroll] Error generando secret TOTP", {
      username: auth.username,
      tenantId: auth.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
