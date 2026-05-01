import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { compare, hash } from "bcryptjs";
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
  const rl = applyRateLimit(req, "AUTH", "delivery-login");
  if (rl) return rl;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const phoneDigits = parsed.data.phone.replace(/\D/g, "");
  const partner = await prisma.deliveryPartner.findFirst({
    where: { phone: phoneDigits },
    select: {
      id: true,
      name: true,
      tenantId: true,
      isActive: true,
      passwordHash: true,
    },
  });

  if (!partner) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }
  if (!partner.isActive) {
    return NextResponse.json(
      { error: "Tu cuenta está pendiente de aprobación" },
      { status: 403 },
    );
  }

  // Auto-bootstrap: si no hay passwordHash, primer login = phone como password.
  // Tras login se obliga a cambiar (TODO endpoint /me/password).
  let passwordOk = false;
  if (partner.passwordHash) {
    passwordOk = await compare(parsed.data.password, partner.passwordHash);
  } else if (parsed.data.password === phoneDigits) {
    passwordOk = true;
    // Persistir el hash bootstrapeado para próximos logins.
    const hashed = await hash(phoneDigits, 10);
    await prisma.deliveryPartner.update({
      where: { id: partner.id },
      data: { passwordHash: hashed },
    });
  }

  if (!passwordOk) {
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
    logger.error("[delivery/me/login] error", { error: String(err), stack: err instanceof Error ? err.stack : null });
    return NextResponse.json({ error: "login failed", detail: String(err) }, { status: 500 });
  }
}
