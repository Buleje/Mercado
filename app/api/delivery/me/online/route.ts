import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * POST /api/delivery/me/online
 * Body: { isOnline, lat?, lng? }
 *
 * Toggle online/offline + setea GPS inicial. Cuando isOnline=true se
 * activa para recibir ofertas; lastPingAt se setea a now() para que
 * el matching lo considere "fresh".
 */
const BodySchema = z.object({
  isOnline: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(req: NextRequest) {
  // SECURITY 2026-05-06 (audit delivery #6): rate limit para frenar
  // toggle-spam (ej. partner comprometido o auto-script).
  const rl = applyRateLimit(req, "MODERATE", "delivery-online");
  if (rl) return rl;
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const data: Record<string, unknown> = {
    isOnline: parsed.data.isOnline,
    lastPingAt: new Date(),
  };
  if (parsed.data.lat != null) data.lat = parsed.data.lat;
  if (parsed.data.lng != null) data.lng = parsed.data.lng;

  await prisma.deliveryPartner.update({
    where: { id: session.partnerId },
    data,
  });

  logger.info("[delivery/me/online]", {
    partnerId: session.partnerId,
    isOnline: parsed.data.isOnline,
  });

  return NextResponse.json({ ok: true, isOnline: parsed.data.isOnline });
}
