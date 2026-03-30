import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { createSessionToken, SESSION } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
  // 1. Verificar sesión SuperAdmin (cookie bsm-platform-sess)
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
  } catch (e) {
    return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
  }

  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  // 4. Generar token de sesión admin para ese tenant
  // username = "superadmin" identifica el origen en logs/audit
  // role = "admin" para acceso completo al panel
  const token = await createSessionToken("admin", "superadmin", tenant.id, "SuperAdmin");

  // 5. Escribir la misma cookie que usa /api/auth/login
  const isProd = process.env.NODE_ENV === "production";
  const response = NextResponse.json({
    ok: true,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
  });

  response.cookies.set(SESSION.COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION.MAX_AGE,
  });

  return response;
}
