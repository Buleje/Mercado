import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { resendVerificationEmail } from "@/lib/email-verification";
import { sendVerificationEmail } from "@/lib/email-templates/verify-email";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Rate limit: máximo 3 reenvíos por IP por hora
const resendLimiter = createRateLimiter({ maxRequests: 3, windowMs: 60 * 60 * 1000 });

/**
 * POST /api/auth/resend-verification
 *
 * Regenera y reenvía el email de verificación para el tenant autenticado.
 * Requiere sesión de admin activa.
 * Rate limit: 3 intentos por IP por hora.
 */
export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? undefined;

  // 1. Rate limit
  const ip = getClientIp(req);
  if (!resendLimiter.check(ip)) {
    logger.warn("[resend-verification] Rate limit excedido", { requestId, ip });
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta nuevamente en una hora." },
      {
        status: 429,
        headers: { "Retry-After": "3600" },
      },
    );
  }

  // 2. Auth
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  // 3. Verificar si ya fue verificado (no tiene sentido reenviar)
  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tenantId },
    select: { emailVerified: true, ownerEmail: true, name: true },
  });

  if (!tenant) {
    logger.error("[resend-verification] Tenant no encontrado", {
      requestId,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  if (tenant.emailVerified) {
    return NextResponse.json(
      { message: "El email ya fue verificado anteriormente." },
      { status: 200 },
    );
  }

  if (!tenant.ownerEmail) {
    return NextResponse.json(
      { error: "El tenant no tiene email registrado." },
      { status: 400 },
    );
  }

  // 4. Generar nuevo token y enviar email (fire-and-forget)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.com";

  resendVerificationEmail(auth.tenantId)
    .then((token) => {
      const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
      sendVerificationEmail(tenant.ownerEmail!, tenant.name, verifyUrl).catch(() => {});
    })
    .catch(() => {});

  logger.info("[resend-verification] Reenvío de verificación solicitado", {
    requestId,
    tenantId: auth.tenantId,
  });

  return NextResponse.json({ message: "Email de verificación reenviado." }, { status: 200 });
}
