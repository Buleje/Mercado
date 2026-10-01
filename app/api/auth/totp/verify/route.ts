import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { AdminTotpDB } from "@/lib/db/admin-totp.db";
import { prisma } from "@/lib/prisma";
import { alertNewDeviceLogin } from "@/lib/auth/security-alerts";
import { verifyTotpCode } from "@/lib/auth/totp";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import {
  getPendingTotpPayload,
  createSessionToken,
  createRefreshToken,
  SESSION,
  REFRESH,
  PENDING_TOTP_COOKIE,
} from "@/lib/session";
import type { AdminRole } from "@/lib/session";
import { TrustedDevicesDB, TRUSTED_DEVICE_COOKIE, TRUSTED_DEVICE_MAX_AGE, deviceLabelFromUA } from "@/lib/db/trusted-devices.db";

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
  // ADR-304: "confiar en este dispositivo" → salta el 2FA los próximos 30 días.
  trustDevice: z.boolean().optional(),
});

function makeAccessCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION.MAX_AGE,
    path: "/",
  };
}

function makeRefreshCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: REFRESH.MAX_AGE,
    path: "/",
  };
}

export async function POST(req: NextRequest) {
  // 1. Rate limit
  const rateLimited = applyRateLimit(req, verifyLimiter);
  if (rateLimited) return rateLimited;

  // 2. Auth — dos caminos:
  //    a) Flujo 2FA post-login: cookie `pending-totp` (role restringido).
  //    b) Flujo enrollment panel: cookie de sesión normal (`requireAdmin`).
  const pendingToken = req.cookies.get(PENDING_TOTP_COOKIE)?.value;
  const pendingPayload = pendingToken
    ? await getPendingTotpPayload(pendingToken)
    : null;

  // Determinar identidad y modo (post-login vs enrollment)
  let authUsername: string;
  let authTenantId: string;
  let authName: string;
  let authOriginalRole: AdminRole | undefined;
  let isPostLoginFlow: boolean;

  if (pendingPayload) {
    // Camino a: viniendo del login con 2FA requerido
    authUsername = pendingPayload.username;
    authTenantId = pendingPayload.tenantId;
    authName = pendingPayload.name;
    authOriginalRole = pendingPayload.originalRole;
    isPostLoginFlow = true;
  } else {
    // Camino b: enrollment desde panel (sesión ya activa)
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    authUsername = auth.username;
    authTenantId = auth.tenantId;
    authName = auth.name ?? "";
    authOriginalRole = auth.role as AdminRole;
    isPostLoginFlow = false;
  }

  // Objeto de contexto unificado para el resto del handler
  const auth = { username: authUsername, tenantId: authTenantId, name: authName };

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
    const currentStep = Math.floor(Date.now() / 30_000);
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

    // SECURITY 2026-05-06 (pentest H002): replay protection. Rechazar si el
    // step actual o adyacente ya fue consumido (mismo código replay-eado en
    // su ventana de 60s).
    if (row.totpLastUsedStep != null && Math.abs(currentStep - row.totpLastUsedStep) <= 1) {
      logger.warn("[totp/verify] TOTP replay attempt", {
        username: auth.username,
        currentStep,
        lastUsed: row.totpLastUsedStep,
      });
      return NextResponse.json({ error: "code_already_used" }, { status: 400 });
    }

    // 6. Activar 2FA si aún no estaba activo + persistir step consumido
    const wasAlreadyActive = row.totpEnabledAt !== null;
    if (!wasAlreadyActive) {
      await AdminTotpDB.activate(auth.tenantId, auth.username);
    }
    await AdminTotpDB.setLastUsedStep(auth.tenantId, auth.username, currentStep);

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

    // 8. Flujo post-login: emitir tokens de sesión completos + limpiar cookie temporal.
    if (isPostLoginFlow && authOriginalRole) {
      const [sessionToken, refreshToken] = await Promise.all([
        createSessionToken(authOriginalRole, auth.username, auth.tenantId, auth.name),
        createRefreshToken(authOriginalRole, auth.username, auth.tenantId, auth.name),
      ]);
      // ADR-133 follow-up: forzar cambio de clave también tras 2FA (no solo login
      // directo). Raw SQL: campo nuevo, evita depender del cliente Prisma regenerado.
      let mustChangePassword = false;
      try {
        const rows = await prisma.$queryRawUnsafe<{ mustChangePassword: boolean }[]>(
          `SELECT "mustChangePassword" FROM "AdminUser" WHERE "tenantId" = $1 AND username = $2 LIMIT 1`,
          auth.tenantId,
          auth.username,
        );
        mustChangePassword = rows[0]?.mustChangePassword ?? false;
      } catch { /* si falla, no bloquear el login */ }
      const response = NextResponse.json({ ok: true, activated: !wasAlreadyActive, loggedIn: true, mustChangePassword });
      response.cookies.set(SESSION.COOKIE_NAME, sessionToken, makeAccessCookie());
      response.cookies.set(REFRESH.COOKIE_NAME, refreshToken, makeRefreshCookie());
      // Eliminar cookie temporal
      response.cookies.set(PENDING_TOTP_COOKIE, "", { maxAge: 0, path: "/" });

      // ADR-304: si pidió confiar en este dispositivo, emitir cookie trusted
      // (salta el 2FA los próximos 30 días en ESTE navegador). El password se
      // sigue pidiendo siempre — esto sólo evita el segundo factor. Best-effort:
      // si falla, el login igual se completa (sin confianza).
      if (parsed.data.trustDevice) {
        try {
          const label = deviceLabelFromUA(req.headers.get("user-agent"));
          const trustedToken = await TrustedDevicesDB.issue(auth.tenantId, auth.username, label, new Date());
          response.cookies.set(TRUSTED_DEVICE_COOKIE, trustedToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: TRUSTED_DEVICE_MAX_AGE,
            path: "/",
          });
        } catch (err) {
          logger.error("[totp/verify] trusted-device issue failed", { error: String(err) });
        }
      }

      // ADR-133: aviso de dispositivo nuevo también en el flujo 2FA (el login
      // con 2FA completa acá, no en /api/auth/login). Fire-and-forget.
      const ipRaw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
      alertNewDeviceLogin({
        tenantId: auth.tenantId,
        username: auth.username,
        role: authOriginalRole,
        ip: ipRaw ? ipRaw.slice(0, 45) : null,
        userAgent: req.headers.get("user-agent"),
      }).catch((err) => logger.error("[totp/verify] alertNewDeviceLogin failed", { error: String(err) }));
      return response;
    }

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
