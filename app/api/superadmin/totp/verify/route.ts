import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { SuperadminTotpDB } from "@/lib/db/admin-totp.db";
import { verifyTotpCode } from "@/lib/auth/totp";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/totp/verify
 *
 * Verifica el token TOTP de 6 dígitos contra el secret del SuperadminUser.
 * Si es válido y aún no estaba activado, setea totpEnabledAt = NOW().
 *
 * Auth: getPlatformSession (cookie PLATFORM_SESSION, no requireAdmin)
 * Rate limit: 3 req / 5 min — bloqueo anti brute-force estricto
 * Body: { token: string }
 *
 * Respuesta 200: { ok: true, activated: boolean }
 * Respuesta 400: { error: "invalid_token" | "no_secret" | "datos_invalidos" }
 */

// Brute-force en superadmin TOTP = acceso total a la plataforma → límite muy estricto
const verifyLimiter = createRateLimiter({ maxRequests: 3, windowMs: 5 * 60 * 1000 });

const VerifyBodySchema = z.object({
  token: z.string().regex(/^\d{6}$/, "El token debe ser exactamente 6 dígitos"),
});

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

export async function POST(req: NextRequest) {
  // 1. Rate limit
  const rateLimited = applyRateLimit(req, verifyLimiter);
  if (rateLimited) return rateLimited;

  // 2. Auth superadmin
  const session = await requirePlatform(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. Validación Zod safeParse
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = VerifyBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos_invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // 4. Obtener secret de DB
    const row = await SuperadminTotpDB.getByUsername(session.username);

    if (!row?.totpSecret) {
      logger.warn("[superadmin/totp/verify] Intento de verify sin secret enrollado", {
        username: session.username,
      });
      return NextResponse.json({ error: "no_secret" }, { status: 400 });
    }

    // 5. Verificar token (ventana ±1 step = ±30s de tolerancia de reloj)
    const valid = verifyTotpCode(row.totpSecret, parsed.data.token);

    if (!valid) {
      logger.warn("[superadmin/totp/verify] Token inválido", {
        username: session.username,
      });
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }

    // 6. Activar 2FA si aún no estaba activo
    const wasAlreadyActive = row.totpEnabledAt !== null;
    if (!wasAlreadyActive) {
      await SuperadminTotpDB.activate(session.username);
    }

    logger.info("[superadmin/totp/verify] Token válido", {
      username: session.username,
      activated: !wasAlreadyActive,
    });

    return NextResponse.json({ ok: true, activated: !wasAlreadyActive });
  } catch (err) {
    logger.error("[superadmin/totp/verify] Error verificando token", {
      username: session.username,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
