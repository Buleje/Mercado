import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { requireTotpStepUp } from "@/lib/auth/totp-step-up";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { revokeSessionsBefore } from "@/lib/auth/session-revocation";
import { logger } from "@/lib/logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

async function mainAdmin(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ username: string; totpEnabledAt: Date | null }[]>(
    `SELECT username, "totpEnabledAt" FROM "AdminUser"
     WHERE "tenantId" = $1 AND active = true
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, "createdAt" ASC
     LIMIT 1`,
    tenantId,
  );
  return rows[0] ?? null;
}

// GET — estado de seguridad del admin principal del tenant (panel ADR-133).
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const admin = await mainAdmin(tenant.id);
    const lastLogin = await prisma.activityLog.findFirst({
      where: { tenantId: tenant.id, action: "login_success" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, detail: true },
    }).catch(() => null);
    return NextResponse.json({
      username: admin?.username ?? null,
      twoFactorEnabled: !!admin?.totpEnabledAt,
      lastLoginAt: lastLogin?.createdAt ?? null,
      lastLoginDetail: lastLogin?.detail ?? null,
    });
  } catch (e) {
    logger.error("[security] get error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const actionSchema = z.object({ action: z.enum(["force-change", "reset-2fa", "logout-all"]) });

// POST — acciones de seguridad (TOTP step-up obligatorio).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = applyRateLimit(req, "AUTH", "sa-tenant-security"); if (rl) return rl;
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const totpFail = await requireTotpStepUp(session.username, body);
  if (totpFail) return totpFail;
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Acción inválida" }, { status: 400 });

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const admin = await mainAdmin(tenant.id);
    if (!admin) return NextResponse.json({ error: "Sin admin activo" }, { status: 400 });

    if (parsed.data.action === "force-change") {
      await prisma.$executeRawUnsafe(
        `UPDATE "AdminUser" SET "mustChangePassword" = true, "updatedAt" = NOW() WHERE "tenantId" = $1 AND username = $2`,
        tenant.id, admin.username,
      );
    } else if (parsed.data.action === "reset-2fa") {
      // Reset 2FA: el admin deberá volver a enrolar TOTP.
      await prisma.$executeRawUnsafe(
        `UPDATE "AdminUser" SET "totpSecret" = NULL, "totpEnabledAt" = NULL, "totpLastUsedStep" = NULL, "updatedAt" = NOW() WHERE "tenantId" = $1 AND username = $2`,
        tenant.id, admin.username,
      );
    } else {
      // logout-all: cerrar TODAS las sesiones activas de TODOS los admins del
      // tenant (ADR-133). Corte de revocación masiva por el jti embebido.
      const admins = await prisma.$queryRawUnsafe<{ username: string }[]>(
        `SELECT username FROM "AdminUser" WHERE "tenantId" = $1 AND active = true`,
        tenant.id,
      );
      const now = Date.now();
      for (const a of admins) revokeSessionsBefore(tenant.id, a.username, now);
    }
    const auditAction =
      parsed.data.action === "force-change" ? "force_password_change"
        : parsed.data.action === "reset-2fa" ? "reset_2fa"
        : "logout_all_sessions";
    logSuperadminAction(
      auditAction,
      `${parsed.data.action} en ${slug} (${tenant.name}), usuario ${admin.username}`,
      { tenantSlug: slug, username: admin.username },
      session.username,
    ).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[security] action error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
