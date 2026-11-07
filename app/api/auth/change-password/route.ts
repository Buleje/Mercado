import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionPayload, SESSION } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { newPasswordSchema } from "@/lib/auth/password-schema";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { TrustedDevicesDB, TRUSTED_DEVICE_COOKIE } from "@/lib/db/trusted-devices.db";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: newPasswordSchema,
});

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "AUTH", "auth:change-password");
  if (rateLimitResponse) return rateLimitResponse;

  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const payload = await getSessionPayload(token);
  if (!payload) return NextResponse.json({ error: "session expired" }, { status: 401 });

  const body = await req.json().catch((err) => { logger.warn("[auth/change-password] invalid JSON body", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    const user = await prisma.adminUser.findUnique({
      where: { tenantId_username: { tenantId: payload.tenantId, username: payload.username } },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    // Verify current password
    const isValid = user.passwordHash.startsWith("$2")
      ? await compare(currentPassword, user.passwordHash)
      : currentPassword === user.passwordHash;

    if (!isValid) {
      return NextResponse.json({ error: "incorrect current password" }, { status: 403 });
    }

    // Hash and save new password + limpiar el flag de cambio forzado (ADR-133).
    // Raw SQL para mustChangePassword (campo nuevo, evita depender de regenerar
    // el cliente Prisma en runtime).
    const newHash = await hash(newPassword, 12);
    await prisma.$executeRawUnsafe(
      `UPDATE "AdminUser" SET "passwordHash" = $1, "mustChangePassword" = false, "updatedAt" = NOW()
       WHERE "tenantId" = $2 AND username = $3`,
      newHash,
      payload.tenantId,
      payload.username,
    );

    // COMPLIANCE 2026-05-06 (audit Ley 29733 #5): trazar cambio de password.
    // Acción crítica de seguridad sin trazabilidad antes — Art. 18 lo requiere.
    try {
      const { logActivity } = await import("@/lib/activity-logger");
      logActivity(
        "password_change",
        "admin",
        `Password actualizado por ${payload.username}`,
        payload.username,
        payload.username,
      ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    } catch { /* logger not available */ }

    // ADR-304 (defensa): cambiar la clave revoca TODOS los dispositivos de
    // confianza — si la clave estaba comprometida, el atacante pierde el skip
    // de 2FA. También limpiamos la cookie trusted de ESTE navegador.
    await TrustedDevicesDB.revokeAll(payload.tenantId, payload.username).catch((err) =>
      logger.error("[auth/change-password] revokeAll trusted-devices failed", { error: String(err) }),
    );
    const okRes = NextResponse.json({ ok: true });
    okRes.cookies.set(TRUSTED_DEVICE_COOKIE, "", { maxAge: 0, path: "/" });
    return okRes;
  } catch {
    return NextResponse.json({ error: "failed to change password" }, { status: 500 });
  }
}
