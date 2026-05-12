/**
 * #45 2FA tenant admin — Setup
 * POST /api/admin/2fa/setup
 *
 * Genera un nuevo secret TOTP + URI otpauth para que el admin lo escanee
 * con su app autenticadora.
 *
 * Requiere migration: prisma/migrations/proposed-admin-totp.sql
 * Si las columnas totpSecret/totpEnabledAt no existen, retorna 501.
 *
 * Auth: requireAdmin con rol "admin" (RBAC).
 * Multi-tenant: sí — opera sobre el AdminUser del tenant autenticado.
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { generateTotpSecret, buildOtpauthUri } from "@/lib/auth/totp";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const ISSUER = "Buleje";

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-2fa-setup"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  // 1. Auth — solo rol "admin" puede configurar su propio 2FA
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // 2. Generar secret TOTP
  const secret = generateTotpSecret();

  // 3. Intentar persistir el secret (pendiente de activación — totpEnabledAt sigue NULL)
  //    Si la columna no existe (migración pendiente), degradar gracefully.
  try {
    await prisma.adminUser.update({
      where: {
        tenantId_username: {
          tenantId: auth.tenantId,
          username: auth.username,
        },
      },
      data: {
        totpSecret: secret,
        // totpEnabledAt permanece NULL hasta verify exitoso
      },
    });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    const isMissingColumn =
      msg.includes("totpSecret") ||
      msg.includes("Unknown argument") ||
      msg.includes("column") ||
      msg.includes("does not exist");

    if (isMissingColumn) {
      return NextResponse.json(
        {
          error:
            "Requiere migration — ver prisma/migrations/proposed-admin-totp.sql",
          code: "MIGRATION_PENDING",
        },
        { status: 501 },
      );
    }

    // Error inesperado
    logger.error("[2fa/setup] Error al guardar secret", { error: msg });
    return NextResponse.json(
      { error: "Error interno al configurar 2FA" },
      { status: 500 },
    );
  }

  // 4. Construir URI otpauth para QR
  const account = `${auth.username}@${auth.tenantId}`;
  const otpauthUri = buildOtpauthUri(secret, account, ISSUER);

  return NextResponse.json({
    secret,
    otpauthUri,
    message:
      "Escanea el QR con tu app autenticadora y luego confirma con POST /api/admin/2fa/verify",
  });
}
