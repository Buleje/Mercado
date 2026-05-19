import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { newPasswordSchema } from "@/lib/auth/password-schema";
import { logger } from "@/lib/logger";

/**
 * POST /api/delivery/me/password
 * Body: { currentPassword, newPassword }
 *
 * Cambia la contraseña del partner. Requiere current correcto.
 */
const BodySchema = z.object({
  currentPassword: z.string().min(4).max(100),
  newPassword: newPasswordSchema,
});

export async function POST(req: NextRequest) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Nueva contraseña debe tener al menos 6 caracteres" },
      { status: 400 },
    );
  }

  const partner = await prisma.deliveryPartner.findUnique({
    where: { id: session.partnerId },
    select: { id: true, passwordHash: true, phone: true },
  });
  if (!partner) {
    return NextResponse.json({ error: "Partner no existe" }, { status: 404 });
  }

  // Verificar current — admite phone si todavía no hay hash (bootstrap).
  let ok = false;
  if (partner.passwordHash) {
    ok = await compare(parsed.data.currentPassword, partner.passwordHash);
  } else if (parsed.data.currentPassword === partner.phone) {
    ok = true;
  }
  if (!ok) {
    return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 401 });
  }

  const newHash = await hash(parsed.data.newPassword, 10);
  await prisma.deliveryPartner.update({
    where: { id: partner.id },
    data: { passwordHash: newHash },
  });

  logger.info("[delivery/me/password] changed", { partnerId: partner.id });
  return NextResponse.json({ ok: true });
}
