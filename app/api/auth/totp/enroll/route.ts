import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { AdminTotpDB } from "@/lib/db/admin-totp.db";
import { generateTotpSecret, buildOtpauthUri } from "@/lib/auth/totp";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { compare } from "bcryptjs";
import { z } from "zod";

/**
 * POST /api/auth/totp/enroll
 *
 * Genera un secret TOTP para el admin autenticado y devuelve la URL otpauth
 * para escanear con la app autenticadora. NO activa 2FA todavía — eso requiere
 * verificar el primer token en /api/auth/totp/verify.
 *
 * Auth: requireAdmin (cualquier rol de tenant admin)
 * Rate limit: 5 req / 15 min por IP — protege contra enumeración
 * Body: { currentPassword: string } — re-autenticación obligatoria (pentest F2)
 *
 * Respuesta 200: { secret: string, otpauthUrl: string }
 */

// SECURITY 2026-05-07 (pentest F2): schema con currentPassword obligatorio.
// Sin este chequeo, un atacante con cookie robada podía generar nuevo secret
// y bloquear al admin real al rotar el QR.
const EnrollBodySchema = z.object({
  currentPassword: z.string().min(1, "La contraseña actual es obligatoria"),
});

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
    // 2b. SECURITY 2026-05-07 (pentest F2): re-autenticar contraseña actual.
    // Un atacante con cookie robada no puede hacer enroll si no conoce la clave.
    const body = await req.json().catch(() => ({}));
    const parsed = EnrollBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Se requiere la contraseña actual para activar 2FA", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const adminUser = await AdminUsersDB.getPasswordHashForReauth(auth.tenantId, auth.username);
    if (!adminUser) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const validPassword = await compare(parsed.data.currentPassword, adminUser.passwordHash);
    if (!validPassword) {
      logger.warn("[totp/enroll] Contraseña incorrecta en re-auth", { username: auth.username, tenantId: auth.tenantId });
      return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 403 });
    }

    // SECURITY 2026-05-06 (pentest H003): rechazar re-enroll silencioso si
    // 2FA YA está activo. Antes saveSecret reescribía secret sin chequear
    // → atacante con sesión robada bloqueaba al admin real al rotar el QR.
    const existing = await AdminTotpDB.getByUsername(auth.tenantId, auth.username);
    if (existing?.totpEnabledAt) {
      return NextResponse.json(
        {
          error: "2FA ya está activo. Para rotar el secret debes desactivar primero (requiere código TOTP actual).",
          code: "TOTP_ALREADY_ENROLLED",
        },
        { status: 409 },
      );
    }

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
    ).catch((err) => logger.error("[totp/enroll] logActivity failed", { error: String(err) }));

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
