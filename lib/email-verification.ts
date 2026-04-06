import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Genera un token de verificación de email y lo persiste en el tenant.
 * Expira en 24 horas.
 */
export async function generateVerificationToken(tenantId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { emailVerifyToken: token, emailVerifyExpires: expires },
  });

  return token;
}

/**
 * Valida un token de verificación de email.
 * - Si el token no existe → { success: false }
 * - Si ya fue verificado → { success: true, tenantSlug }  (idempotente)
 * - Si expiró → { success: false }
 * - Si es válido → marca emailVerified=true, limpia el token, retorna { success: true, tenantSlug }
 */
export async function verifyEmailToken(
  token: string,
): Promise<{ success: boolean; tenantSlug?: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { emailVerifyToken: token },
    select: { id: true, slug: true, emailVerifyExpires: true, emailVerified: true },
  });

  if (!tenant) return { success: false };

  // Idempotente: si ya fue verificado, ok
  if (tenant.emailVerified) return { success: true, tenantSlug: tenant.slug };

  // Token expirado
  if (tenant.emailVerifyExpires && tenant.emailVerifyExpires < new Date()) {
    return { success: false };
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
  });

  return { success: true, tenantSlug: tenant.slug };
}

/**
 * Regenera un token de verificación para reenvío.
 * Reutiliza generateVerificationToken para mantener la misma lógica de expiración.
 */
export async function resendVerificationEmail(tenantId: string): Promise<string> {
  return generateVerificationToken(tenantId);
}
