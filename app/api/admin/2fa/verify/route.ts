/**
 * #45 2FA tenant admin — Verify
 * POST /api/admin/2fa/verify
 *
 * Confirma el código TOTP del usuario y activa el 2FA marcando totpEnabledAt.
 * Debe llamarse después de /api/admin/2fa/setup.
 *
 * Body JSON: { code: string } — 6 dígitos
 *
 * Auth: requireAdmin con rol "admin".
 * Multi-tenant: sí — opera sobre el AdminUser del tenant autenticado.
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { verifyTotpCode } from "@/lib/auth/totp";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const verifySchema = z.object({
  code: z
    .string()
    .length(6, "El código TOTP debe tener exactamente 6 dígitos")
    .regex(/^\d+$/, "El código TOTP debe ser numérico"),
});

export async function POST(req: NextRequest) {
  // 1. Auth
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // 2. Validación Zod (safeParse — nunca parse)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 3. Obtener el secret almacenado para este admin
  let adminUser: { totpSecret?: string | null; totpEnabledAt?: Date | null } & Record<string, unknown>;
  try {
    const raw = await prisma.adminUser.findUnique({
      where: {
        tenantId_username: {
          tenantId: auth.tenantId,
          username: auth.username,
        },
      },
      select: {
        totpSecret: true,
        totpEnabledAt: true,
      },
    });

    if (!raw) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    adminUser = raw as typeof adminUser;
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

    logger.error("[2fa/verify] Error al leer admin", { error: msg });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // 4. Verificar que haya un secret configurado
  if (!adminUser.totpSecret) {
    return NextResponse.json(
      { error: "2FA no configurado. Primero llama a POST /api/admin/2fa/setup" },
      { status: 409 },
    );
  }

  // 5. Verificar el código TOTP con ventana ±1 step
  const isValid = verifyTotpCode(adminUser.totpSecret, parsed.data.code);
  if (!isValid) {
    return NextResponse.json(
      { error: "Código TOTP incorrecto o expirado" },
      { status: 422 },
    );
  }

  // 6. Activar 2FA marcando totpEnabledAt
  try {
    await prisma.adminUser.update({
      where: {
        tenantId_username: {
          tenantId: auth.tenantId,
          username: auth.username,
        },
      },
      data: {
        totpEnabledAt: new Date(),
      },
    });
  } catch (err) {
    logger.error("[2fa/verify] Error al activar 2FA", { error: String((err as Error).message) });
    return NextResponse.json(
      { error: "Error al activar 2FA" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "2FA activado correctamente. A partir de ahora se requerirá código TOTP al iniciar sesión.",
  });
}
