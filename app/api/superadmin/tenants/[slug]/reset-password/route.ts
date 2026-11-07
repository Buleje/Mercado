import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { requireTotpStepUp } from "@/lib/auth/totp-step-up";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { notifyTenantOwnerSecurity } from "@/lib/auth/security-alerts";
import { SuperadminCredencialesDB } from "@/lib/db/superadmin-credenciales.db";
import { desbloqueoVigente } from "@/lib/superadmin/candado";
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

const BodySchema = z.object({
  /** Usuario de ESA tienda al que se le genera la contraseña; sin él, el admin principal. */
  adminUserId: z.string().trim().min(1).max(64).optional(),
});

// POST /api/superadmin/tenants/[slug]/reset-password  `{ totpCode, adminUserId? }`
// Genera una contraseña temporal de un solo uso (mustChangePassword=true) para un
// usuario de la tienda —el elegido o, sin `adminUserId`, el admin principal— y la
// devuelve UNA vez al superadmin. Las claves están hasheadas (bcrypt): la original
// NO se puede recuperar; esto es un RESET, no una "recuperación".
// Exige, en este orden: sesión de plataforma (401), candado de credenciales abierto
// (423) y step-up TOTP (412 sin código o sin 2FA enrolado / 401 código errado).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const rateLimited = applyRateLimit(req, "AUTH", "sa-reset-password");
    if (rateLimited) return rateLimited;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;

    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Candado de credenciales (pestaña «Credenciales»): sin desbloqueo vigente no
    // se genera ninguna contraseña, aunque el TOTP esté a mano.
    if (!(await desbloqueoVigente(req, session.username))) {
      return NextResponse.json(
        { error: "candado_cerrado", message: "Abre el candado de credenciales para generar una contraseña." },
        { status: 423 },
      );
    }

    // TOTP step-up obligatorio (P0 2026-05-24) — acción crítica de credenciales.
    const body = await req.json().catch(() => ({}));
    const totpFail = await requireTotpStepUp(session.username, body);
    if (totpFail) return totpFail;
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const { slug } = await params;
    const tenant = await SuperadminCredencialesDB.tiendaPorSlug(slug);
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    const elegido = parsed.data.adminUserId;
    const admin = elegido
      ? await SuperadminCredencialesDB.usuarioActivo(tenant.id, elegido)
      : await SuperadminCredencialesDB.adminPrincipal(tenant.id);
    if (!admin) {
      return elegido
        ? NextResponse.json({ error: "Ese usuario no es de esta tienda o está inactivo" }, { status: 404 })
        : NextResponse.json({ error: "El tenant no tiene un admin activo" }, { status: 400 });
    }

    const tempPassword = genTempPassword();
    const passwordHash = await hash(tempPassword, 12);
    // Tienda + usuario + activo en el WHERE: 0 filas = cambió entre la lectura y el write.
    const tocadas = await SuperadminCredencialesDB.ponerContrasenaTemporal(tenant.id, admin.id, passwordHash);
    if (tocadas === 0) {
      return NextResponse.json({ error: "El usuario ya no está activo" }, { status: 409 });
    }

    // Audit (Ley 29733 Art. 16): operación sensible de credenciales.
    logSuperadminAction(
      "reset_password",
      `Reset de password (temporal) para ${slug} (${tenant.name}), usuario ${admin.username}`,
      { tenantSlug: slug, tenantName: tenant.name, username: admin.username, adminUserId: admin.id },
      session.username,
    ).catch((err) => logger.warn("[SuperAdmin] reset-password audit failed", { error: String(err) }));

    // ADR-133: avisar al dueño que un acceso fue reseteado por soporte (sin la
    // clave — esa va por el canal seguro que elija el superadmin). Fire-and-forget.
    notifyTenantOwnerSecurity(tenant.id, {
      title: "🔐 Un acceso a tu negocio en Buleje fue reseteado",
      body:
        `Soporte de Buleje reseteó a una temporal la contraseña del usuario «${admin.username}». ` +
        "La clave llega por el canal acordado y hay que cambiarla al entrar.\n\n" +
        "Si NO solicitaste esto, contáctanos de inmediato.",
      url: "/admin",
    }).catch((err) => logger.error("[reset-password] owner alert failed", { error: String(err) }));

    return NextResponse.json(
      {
        ok: true,
        tempPassword,
        username: admin.username,
        adminUserId: admin.id,
        ownerEmail: tenant.ownerEmail ?? null,
        ownerPhone: tenant.ownerPhone ?? null,
        mustChange: true,
        note: "Temporal de un solo uso. El usuario deberá cambiarla al entrar.",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    logger.error("[reset-password] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
