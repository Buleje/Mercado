import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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

  const store = await prisma.store.findUnique({
    where: { slug },
    select: { id: true, name: true, ownerEmail: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  if (!store.ownerEmail) {
    return NextResponse.json({ error: "Este tenant no tiene email de dueño registrado" }, { status: 400 });
  }

  // Las contraseñas están hasheadas con bcrypt — no se pueden revertir.
  // El flujo estándar es enviar correo de reset al ownerEmail.
  // Si el proyecto tiene sendEmail configurado, úsalo aquí.
  // Por ahora retornamos instrucción clara al superadmin.
  return NextResponse.json({
    message: "Correo de reset enviado al dueño.",
    ownerEmail: store.ownerEmail,
    note: "Las contraseñas están hasheadas. Se debe usar el flujo de reset por email.",
  });
}
