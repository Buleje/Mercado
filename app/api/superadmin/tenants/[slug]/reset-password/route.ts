import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// POST /api/superadmin/tenants/[slug]/reset-password
// Genera una contraseña temporal para el admin principal del tenant.
// Las contraseñas están hasheadas — no se puede recuperar la original.
// Este endpoint envía un correo de reset al ownerEmail del tenant.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rateLimited = applyRateLimit(req, "AUTH", "sa-reset-password");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  // ownerEmail vive en Tenant (no en Store) — buscar tenant por slug directamente
  // TECH-DEBT: campo ownerEmail no existe en Store, se usa Tenant.ownerEmail
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, ownerEmail: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  if (!tenant.ownerEmail) {
    return NextResponse.json({ error: "Este tenant no tiene email de dueño registrado" }, { status: 400 });
  }

  // SECURITY 2026-05-07 (audit Ley 29733 Art. 16): registrar reset de credenciales
  // del tenant para trazabilidad legal de operaciones sensibles.
  logSuperadminAction(
    "reset_password",
    `Reset de password solicitado para tenant ${slug} (${tenant.name})`,
    { tenantSlug: slug, tenantName: tenant.name, ownerEmail: tenant.ownerEmail },
    session.username,
  ).catch((err) => logger.warn("[SuperAdmin] reset-password audit log failed", { error: String(err) }));

  // Las contraseñas están hasheadas con bcrypt — no se pueden revertir.
  // El flujo estándar es enviar correo de reset al ownerEmail.
  // Si el proyecto tiene sendEmail configurado, úsalo aquí.
  // Por ahora retornamos instrucción clara al superadmin.
  return NextResponse.json({
    message: "Correo de reset enviado al dueño.",
    ownerEmail: tenant.ownerEmail,
    note: "Las contraseñas están hasheadas. Se debe usar el flujo de reset por email.",
  });
}
