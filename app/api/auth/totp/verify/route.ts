import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { AdminTotpDB } from "@/lib/db/admin-totp.db";
import { verifyTotpCode } from "@/lib/auth/totp";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * POST /api/auth/totp/verify
 *
 * Verifica el token TOTP de 6 dígitos contra el secret almacenado.
 * Si es válido y aún no estaba activado, setea totpEnabledAt = NOW().
 *
 * Auth: requireAdmin (cualquier rol de tenant admin)
 * Rate limit: 3 req / 5 min por IP — bloqueo anti brute-force
 * Body: { token: string }
 *
 * Respuesta 200: { ok: true, activated: boolean }
 * Respuesta 400: { error: "invalid_token" | "no_secret" | "datos_invalidos" }
 */

// Rate limiter muy estricto: brute-force en TOTP = bypass de 2FA
const verifyLimiter = createRateLimiter({ maxRequests: 3, windowMs: 5 * 60 * 1000 });

const VerifyBodySchema = z.object({
  token: z.string().regex(/^\d{6}$/, "El token debe ser exactamente 6 dígitos"),
});

export async function POST(req: NextRequest) {
  // 1. Rate limit
  const rateLimited = applyRateLimit(req, verifyLimiter);
  if (rateLimited) return rateLimited;

  // 2. Auth
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

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
    const row = await AdminTotpDB.getByUsername(auth.tenantId, auth.username);

    if (!row?.totpSecret) {
      logger.warn("[totp/verify] Intento de verify sin secret enrollado", {
        username: auth.username,
        tenantId: auth.tenantId,
      });
      return NextResponse.json({ error: "no_secret" }, { status: 400 });
    }

    // 5. Verificar token (ventana ±1 step = ±30s de tolerancia de reloj)
    const valid = verifyTotpCode(row.totpSecret, parsed.data.token);

    if (!valid) {
      logger.warn("[totp/verify] Token inválido", {
        username: auth.username,
        tenantId: auth.tenantId,
      });
      // Fire-and-forget audit del intento fallido
      logActivity(
        "totp_verify_failed",
        "AdminUser",
        `Token TOTP inválido para ${auth.username}`,
        undefined,
        auth.username,
        undefined,
        auth.tenantId,
      ).catch((err) => logger.error("[totp/verify] logActivity (verify_failed) failed", { error: String(err) }));
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }

    // 6. Activar 2FA si aún no estaba activo
    const wasAlreadyActive = row.totpEnabledAt !== null;
    if (!wasAlreadyActive) {
      await AdminTotpDB.activate(auth.tenantId, auth.username);
    }

    logger.info("[totp/verify] Token válido", {
      username: auth.username,
      tenantId: auth.tenantId,
      activated: !wasAlreadyActive,
    });

    // 7. Audit log fire-and-forget
    logActivity(
      wasAlreadyActive ? "totp_verify_ok" : "totp_activated",
      "AdminUser",
      wasAlreadyActive
        ? `2FA verificado para ${auth.username}`
        : `2FA activado para ${auth.username}`,
      undefined,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.error("[totp/verify] logActivity (verify_ok/activated) failed", { error: String(err) }));

    return NextResponse.json({ ok: true, activated: !wasAlreadyActive });
  } catch (err) {
    logger.error("[totp/verify] Error verificando token TOTP", {
      username: auth.username,
      tenantId: auth.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
