import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { resendVerificationEmail } from "@/lib/email-verification";
import { enqueueEmail } from "@/lib/queue";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

function buildVerificationHtml(storeName: string, verifyUrl: string): string {
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#00B4A6,#8b5cf6);padding:32px 24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Verifica tu email</h1>
        <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px;">Un paso más para activar tu tienda en Buleje</p>
      </div>
      <div style="padding:32px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 16px;line-height:1.6;">
          Hola, para activar tu tienda <strong>${storeName}</strong> necesitamos confirmar que este email te pertenece.
        </p>
        <p style="font-size:14px;color:#555;margin:0 0 28px;line-height:1.6;">
          Haz clic en el botón de abajo para verificar tu cuenta. El enlace es válido por <strong>24 horas</strong>.
        </p>
        <div style="text-align:center;margin:0 0 32px;">
          <a href="${verifyUrl}" style="background:#00B4A6;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;letter-spacing:0.3px;">
            Verificar mi email
          </a>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 6px;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
            Si el botón no funciona, copia este enlace en tu navegador:
          </p>
          <p style="margin:0;font-size:12px;color:#00B4A6;word-break:break-all;">
            <a href="${verifyUrl}" style="color:#00B4A6;">${verifyUrl}</a>
          </p>
        </div>
        <p style="font-size:13px;color:#888;margin:0;line-height:1.5;">
          Si no creaste esta cuenta, ignora este correo. No pasará nada.
        </p>
      </div>
      <div style="background:#f8fafc;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#999;">
          ¿Necesitas ayuda? Responde a este correo y te asistimos.
        </p>
        <p style="margin:4px 0 0;font-size:11px;color:#bbb;">
          Buleje &mdash; Plataforma SaaS para bodegas y tiendas &mdash; Pucallpa, Perú
        </p>
      </div>
    </div>`;
}

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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.pe";

  resendVerificationEmail(auth.tenantId)
    .then((token) => {
      const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
      const storeName = tenant.name;
      enqueueEmail({
        to: tenant.ownerEmail!,
        subject: `Verifica tu email para activar ${storeName}`,
        html: buildVerificationHtml(storeName, verifyUrl),
        tenantId: auth.tenantId,
      }).catch(() => {});
    })
    .catch(() => {});

  logger.info("[resend-verification] Reenvío de verificación solicitado", {
    requestId,
    tenantId: auth.tenantId,
  });

  return NextResponse.json({ message: "Email de verificación reenviado." }, { status: 200 });
}
