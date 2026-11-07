import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { createPartnerToken, setPartnerCookie } from "@/lib/delivery/partner-session";
import { logger } from "@/lib/logger";

/**
 * POST /api/delivery/me/login
 * Body: { phone, password }
 *
 * Login para DeliveryPartner. Verifica passwordHash y setea cookie.
 * Si el partner no tiene passwordHash (recién aprobado), el primer login
 * usa "phone" como password temporal — debe cambiar luego.
 */
const BodySchema = z.object({
  phone: z.string().min(6).max(20),
  password: z.string().min(4).max(100),
});

export async function POST(req: NextRequest) {
  try {
  const rl = applyRateLimit(req, "LOGIN", "delivery-login");
  if (rl) return rl;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const phoneDigits = parsed.data.phone.replace(/\D/g, "");
  // SECURITY 2026-05-06 (audit delivery #12): si hay partners con el mismo
  // phone en tenants distintos, probamos contra TODOS y el password matcheo
  // identifica al partner real (mismo patrón que admin login). Antes
  // findFirst devolvía un partner arbitrario.
  const candidates = await prisma.deliveryPartner.findMany({
    where: { phone: phoneDigits, isActive: true },
    select: {
      id: true,
      name: true,
      tenantId: true,
      isActive: true,
      passwordHash: true,
    },
    take: 10,
  });

  if (candidates.length === 0) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  let partner: (typeof candidates)[number] | null = null;
  for (const c of candidates) {
    if (!c.passwordHash) continue;
    if (await compare(parsed.data.password, c.passwordHash)) {
      partner = c;
      break;
    }
  }

  if (!partner) {
    // Detectar si todos los matches son partners sin passwordHash → mensaje específico
    const allBootstrap = candidates.every((c) => !c.passwordHash);
    if (allBootstrap) {
      logger.warn("[delivery/me/login] partner sin passwordHash — bootstrap manual requerido", {
        candidates: candidates.length,
      });
      return NextResponse.json(
        { error: "Tu cuenta está pendiente de configuración. Pide al administrador que te envíe el password inicial." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const token = await createPartnerToken(partner.id, partner.tenantId, partner.name);
  const res = NextResponse.json({
    ok: true,
    partner: { id: partner.id, name: partner.name },
  });
  setPartnerCookie(res, token);
  logger.info("[delivery/me/login] success", { partnerId: partner.id });
  return res;
  } catch (err) {
    // SECURITY 2026-05-06: no filtrar `detail` con stack al cliente.
    logger.error("[delivery/me/login] error", {
      error: String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    return NextResponse.json({ error: "login failed" }, { status: 500 });
  }
}
