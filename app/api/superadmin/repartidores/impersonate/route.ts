/**
 * Superadmin · Acceso directo a cuenta de repartidor.
 *
 * Crea una cookie `buleje-partner-sess` válida para el partner indicado,
 * sin requerir su contraseña. Audit log obligatorio.
 *
 * Uso típico: el superadmin abre la app del repartidor para diagnosticar
 * un problema reportado (ej: pedidos que no llegan, GPS off, etc.).
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import {
  createPartnerToken,
  setPartnerCookie,
} from "@/lib/delivery/partner-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

const ImpersonateSchema = z.object({
  partnerId: z.string().min(1).max(64),
});

export async function POST(req: NextRequest) {
  // P0 fix 2026-05-24: STRICT rate-limit (antes GENEROUS) — escalada
  // privilegios merece tier de auth, no de listing.
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-repartidores-impersonate"); if (_rl) return _rl;

  // P0 fix 2026-05-24: CSRF double-submit obligatorio.
  // Sin esto, un atacante con sesión de superadmin víctima (XSS/sameSite-lax)
  // podía emitir cookie de partner para cualquier repartidor activo.
  if (!validateSuperadminCsrf(req)) {
    logger.warn("[superadmin/repartidores/impersonate] CSRF token inválido", {
      ip: req.headers.get("x-forwarded-for") ?? null,
    });
    return csrfForbiddenResponse();
  }

  // 1. Verify superadmin session.
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  // 2. Parse body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const parsed = ImpersonateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 3. Look up partner.
  const partner = await prisma.deliveryPartner.findUnique({
    where: { id: parsed.data.partnerId },
    select: { id: true, name: true, tenantId: true, isActive: true },
  });
  if (!partner) {
    return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 });
  }
  if (!partner.isActive) {
    return NextResponse.json(
      { error: "Repartidor inactivo — actívalo antes de acceder" },
      { status: 409 },
    );
  }

  // 4. Issue partner cookie.
  const partnerToken = await createPartnerToken(partner.id, partner.tenantId, partner.name);
  const res = NextResponse.json({
    success: true,
    redirect: "/delivery-app",
    partnerName: partner.name,
  });
  setPartnerCookie(res, partnerToken);

  // 5. Audit log (fire-and-forget).
  logSuperadminAction(
    "impersonate-partner",
    `partner ${partner.name}`,
    { partnerId: partner.id, tenantId: partner.tenantId },
    session.username,
  ).catch((err) =>
    logger.error("[superadmin/repartidores/impersonate] audit failed", { error: String(err) }),
  );

  logger.info("[superadmin/repartidores/impersonate] access granted", {
    by: session.username,
    partnerId: partner.id,
  });

  return res;
}
