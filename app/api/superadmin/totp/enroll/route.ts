import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { SuperadminTotpDB } from "@/lib/db/admin-totp.db";
import { generateTotpSecret, buildOtpauthUri, verifyTotpCode } from "@/lib/auth/totp";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/totp/enroll
 *
 * Genera un secret TOTP para el superadmin autenticado y devuelve la URL
 * otpauth para escanear con la app autenticadora. NO activa 2FA todavía.
 *
 * Auth: getPlatformSession (cookie PLATFORM_SESSION, no requireAdmin)
 * Rate limit: 5 req / 15 min — protección contra enumeración
 *
 * Audit P2 #3 (2026-05-19): si el usuario YA tiene TOTP activo (totpEnabledAt
 * no es null), requerimos código TOTP actual en el body antes de aceptar
 * re-enrollment. Sin esto, un atacante con cookie de sesión vigente puede
 * rotar el secret silenciosamente y bloquear al dueño legítimo.
 *
 * Body (cuando hay TOTP activo): { code: "123456" }
 * Body (primera vez): ninguno
 *
 * Respuesta 200: { secret: string, otpauthUrl: string }
 * Respuesta 400: { error: "user_not_found" | "totp_required" | "totp_invalid" }
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

    // 4. Audit P2 #3 — si ya hay TOTP activo, exigir código actual antes de
    //    aceptar re-enrollment. Protege contra account takeover si la cookie
    //    de sesión se compromete.
    if (row.totpEnabledAt && row.totpSecret) {
      let body: { code?: unknown } = {};
      try {
        body = await req.json();
      } catch {
        // body vacío — caerá en el branch de "code_required"
      }
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!code) {
        return NextResponse.json(
          { error: "totp_required", message: "Ya tenés TOTP activo. Ingresá el código actual para rotarlo." },
          { status: 400 },
        );
      }
      const valid = verifyTotpCode(row.totpSecret, code, 1);
      if (!valid) {
        logger.warn("[superadmin/totp/enroll] Re-enrollment rechazado: TOTP actual inválido", {
          username: session.username,
        });
        return NextResponse.json(
          { error: "totp_invalid", message: "Código TOTP incorrecto." },
          { status: 400 },
        );
      }
    }

    // 5. Generar secret y URI
    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpauthUri(secret, session.username, "Buleje Platform");

    // 6. Guardar secret pendiente (totpEnabledAt queda null hasta verify)
    await SuperadminTotpDB.saveSecret(session.username, secret);

    logger.info("[superadmin/totp/enroll] Secret generado", {
      username: session.username,
      isReEnroll: Boolean(row.totpEnabledAt),
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
