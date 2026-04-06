import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/email-verification";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/verify-email?token=xxx
 *
 * Valida el token de verificación de email.
 *   - Token válido   → redirect a /t/{slug}/admin?verified=1
 *   - Token inválido/expirado → redirect a /verificar-email?error=expired
 *   - Token ausente  → redirect a /verificar-email?error=missing
 */
export async function GET(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const token = req.nextUrl.searchParams.get("token");

  if (!token || token.trim() === "") {
    logger.warn("[verify-email] Token ausente en la solicitud", { requestId });
    return NextResponse.redirect(
      new URL("/verificar-email?error=missing", req.url),
    );
  }

  let result: { success: boolean; tenantSlug?: string };
  try {
    result = await verifyEmailToken(token);
  } catch (err) {
    logger.error("[verify-email] Error al validar token", { requestId, err });
    return NextResponse.redirect(
      new URL("/verificar-email?error=expired", req.url),
    );
  }

  if (!result.success) {
    logger.warn("[verify-email] Token inválido o expirado", { requestId });
    return NextResponse.redirect(
      new URL("/verificar-email?error=expired", req.url),
    );
  }

  logger.info("[verify-email] Email verificado exitosamente", {
    requestId,
    tenantSlug: result.tenantSlug,
  });

  return NextResponse.redirect(
    new URL(`/t/${result.tenantSlug}/admin?verified=1`, req.url),
  );
}
