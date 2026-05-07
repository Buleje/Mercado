import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { createSessionToken, SESSION } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const ImpersonateSchema = z.object({
  slug: z.string().min(1).max(64),
});

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

/**
 * POST /api/superadmin/impersonate
 *
 * Permite al SuperAdmin autenticado acceder al panel admin de cualquier tenant
 * sin necesitar la contraseña del tenant. Genera un token de sesión admin
 * idéntico al que produce /api/auth/login y lo escribe en la cookie de sesión.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-impersonate"); if (_rl) return _rl;
  // 1. Verificar sesión SuperAdmin (cookie buleje-platform-sess)
  const platformSession = await requirePlatform(req);
  if (!platformSession) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. Validar body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de solicitud inválido" }, { status: 400 });
  }

  const parsed = ImpersonateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { slug } = parsed.data;

  // 3. Buscar el tenant por slug
  let tenant: { id: string; name: string; slug: string } | null = null;
  try {
    tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
  } catch {
    return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
  }

  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  // 4. Generar token de sesión admin para ese tenant
  // username = "superadmin" identifica el origen en logs/audit
  // role = "admin" para acceso completo al panel
  // Use tenant.id (canonical ID) — NOT tenant.slug
  // SECURITY: el token incluye impersonator + impersonatedAt para trazabilidad
  // en audit y para que /api/superadmin/impersonate/exit valide que es sesion impersonada.
  const token = await createSessionToken(
    "admin",
    `impersonated-by:${platformSession.username}`,
    tenant.id,
    `SuperAdmin→${tenant.slug}`,
  );

  // ── Audit trail (Ley 29733 Art. 16) ────────────────────────────────────
  // OBLIGATORIO: la impersonación da acceso completo a datos personales
  // del tenant. Sin registro, no hay trazabilidad y la plataforma
  // queda expuesta a multas y demandas. Fire-and-forget para no bloquear
  // el flujo, pero el error se logea internamente.
  logSuperadminAction(
    "impersonate",
    `Superadmin "${platformSession.username}" impersonó tenant "${tenant.slug}" (${tenant.name})`,
    {
      targetTenantId: tenant.id,
      targetTenantSlug: tenant.slug,
      targetTenantName: tenant.name,
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
      userAgent: req.headers.get("user-agent") || null,
      timestamp: new Date().toISOString(),
    },
    platformSession.username,
  ).catch((err) => logger.warn("[superadmin] op failed", { err: String(err) }));

  // 5. Escribir la misma cookie que usa /api/auth/login
  const isProd = process.env.NODE_ENV === "production";
  const response = NextResponse.json({
    ok: true,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
  });

  // Sesion de impersonacion: TTL reducido a 30 min (no se puede renovar con refresh normal)
  const IMPERSONATE_MAX_AGE = 30 * 60; // 30 min en segundos
  response.cookies.set(SESSION.COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: IMPERSONATE_MAX_AGE,
  });

  // Set active-tenant cookie with canonical Tenant.id for proxy.ts resolution
  response.cookies.set("active-tenant", tenant.id, {
    path: "/",
    maxAge: IMPERSONATE_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
  });

  // Set active-tenant-slug cookie for admin UI (readable by client JS)
  response.cookies.set("active-tenant-slug", tenant.slug, {
    path: "/",
    maxAge: IMPERSONATE_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
  });

  return response;
}
