import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { createSessionToken, SESSION } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

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
  // Brandon 2026-05-21 audit blindaje S4: STRICT en lugar de GENEROUS.
  // Impersonate es escalada de privilegios → tratarlo como auth-tier.
  // GENEROUS permitía ~100 req/min = enumeración rápida de tenants.
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-impersonate"); if (_rl) return _rl;

  // P0 fix 2026-05-24: CSRF double-submit obligatorio.
  // Impersonate = escalada de privilegios cross-tenant. Sin CSRF, una página
  // atacante visitada por un superadmin logueado podía pedirle credenciales
  // de cualquier tenant programáticamente. Ahora requiere el header
  // X-CSRF-Token == cookie csrf-token — defense-in-depth contra confused deputy.
  if (!validateSuperadminCsrf(req)) {
    logger.warn("[superadmin/impersonate] CSRF token inválido", {
      ip: req.headers.get("x-forwarded-for") ?? null,
    });
    return csrfForbiddenResponse();
  }

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

  // Audit 2026-05-17 05-P2-8: log de impersonación AWAITED antes de emitir
  // token. Ley 29733 Art. 16 exige trazabilidad de accesos a datos personales
  // — si el log falla post-emisión, el superadmin queda con sesión vigente
  // sin registro. Bloquear el flow garantiza que toda impersonación queda
  // registrada antes de poder usarse.
  try {
    await logSuperadminAction(
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
    );
  } catch (err) {
    logger.error("[superadmin/impersonate] audit log failed — refusing impersonation", {
      err: err instanceof Error ? err.message : String(err),
      superadmin: platformSession.username,
      targetTenant: tenant.slug,
    });
    return NextResponse.json(
      { error: "audit_log_unavailable", message: "Audit trail no disponible — no se puede impersonar." },
      { status: 503 },
    );
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

  // 5. Escribir la misma cookie que usa /api/auth/login
  const isProd = process.env.NODE_ENV === "production";
  // P1 fix 2026-05-24: secureJson — no-store + nosniff para evitar que un
  // proxy cachee la respuesta con datos cross-tenant.
  const response = NextResponse.json(
    {
      ok: true,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );

  // Brandon 2026-05-21 audit blindaje S3: TTL reducido de 30min → 10min.
  // 30min permitía ventana de escalada de privilegios si la sesión
  // superadmin se compromete. 10min cubre operaciones típicas (revisar,
  // ajustar, salir) y fuerza re-impersonate para sesiones largas, que
  // queda logueado en audit trail dando trazabilidad fina.
  const IMPERSONATE_MAX_AGE = 10 * 60; // 10 min en segundos
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
