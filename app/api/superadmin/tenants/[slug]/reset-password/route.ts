import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { requireTotpStepUp } from "@/lib/auth/totp-step-up";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { notifyTenantOwnerSecurity } from "@/lib/auth/security-alerts";
import { logger } from "@/lib/logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

/**
 * Genera una contraseña temporal FUERTE (sin caracteres ambiguos), cumple la
 * policy (letra + número + símbolo), y obliga a cambiarla en el primer login.
 */
function genTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let core = "";
  for (let i = 0; i < 12; i++) core += chars[bytes[i] % chars.length];
  return `${core}#7`; // garantiza símbolo + dígito → cumple newPasswordSchema
}

// POST /api/superadmin/tenants/[slug]/reset-password
// Resetea la contraseña del admin principal del tenant: genera una temporal
// de un solo uso (mustChangePassword=true) y la devuelve UNA vez al superadmin
// para que la entregue por un canal seguro. Las claves están hasheadas (bcrypt)
// — la original NO se puede recuperar; esto es un RESET, no una "recuperación".
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const rateLimited = applyRateLimit(req, "AUTH", "sa-reset-password");
    if (rateLimited) return rateLimited;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;

    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // TOTP step-up obligatorio (P0 2026-05-24) — acción crítica de credenciales.
    const body = await req.json().catch(() => ({}));
    const totpFail = await requireTotpStepUp(session.username, body);
    if (totpFail) return totpFail;

    const { slug } = await params;
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, ownerEmail: true, ownerPhone: true },
    });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    // Admin principal del tenant (owner > admin > primero creado). Raw SQL para
    // no depender de regenerar el cliente Prisma tras añadir mustChangePassword.
    const admins = await prisma.$queryRawUnsafe<{ username: string; role: string }[]>(
      `SELECT username, role FROM "AdminUser"
       WHERE "tenantId" = $1 AND active = true
       ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, "createdAt" ASC
       LIMIT 1`,
      tenant.id,
    );
    const admin = admins[0];
    if (!admin) {
      return NextResponse.json({ error: "El tenant no tiene un admin activo" }, { status: 400 });
    }

    const tempPassword = genTempPassword();
    const passwordHash = await hash(tempPassword, 12);
    await prisma.$executeRawUnsafe(
      `UPDATE "AdminUser" SET "passwordHash" = $1, "mustChangePassword" = true, "updatedAt" = NOW()
       WHERE "tenantId" = $2 AND username = $3`,
      passwordHash,
      tenant.id,
      admin.username,
    );

    // Audit (Ley 29733 Art. 16): operación sensible de credenciales.
    logSuperadminAction(
      "reset_password",
      `Reset de password (temporal) para ${slug} (${tenant.name}), usuario ${admin.username}`,
      { tenantSlug: slug, tenantName: tenant.name, username: admin.username },
      session.username,
    ).catch((err) => logger.warn("[SuperAdmin] reset-password audit failed", { error: String(err) }));

    // ADR-133: avisar al dueño que su acceso fue reseteado por soporte (sin la
    // clave — esa va por el canal seguro que elija el superadmin). Fire-and-forget.
    notifyTenantOwnerSecurity(tenant.id, {
      title: "🔐 Tu acceso a Buleje fue reseteado",
      body:
        "Soporte de Buleje reseteó la contraseña de tu cuenta a una temporal. " +
        "Recibirás la clave por el canal acordado y deberás cambiarla al entrar.\n\n" +
        "Si NO solicitaste esto, contáctanos de inmediato.",
      url: "/admin",
    }).catch((err) => logger.error("[reset-password] owner alert failed", { error: String(err) }));

    return NextResponse.json({
      ok: true,
      tempPassword,
      username: admin.username,
      ownerEmail: tenant.ownerEmail ?? null,
      ownerPhone: tenant.ownerPhone ?? null,
      mustChange: true,
      note: "Temporal de un solo uso. El dueño deberá cambiarla al entrar.",
    });
  } catch (e) {
    logger.error("[reset-password] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
