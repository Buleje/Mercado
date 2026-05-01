import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";

/**
 * POST /api/delivery/me/ping
 * Body: { lat, lng }
 *
 * Heartbeat — la app móvil llama cada 30s mientras está en línea.
 * Actualiza lat/lng + lastPingAt. Sin esto el matching marca offline.
 */
const BodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(req: NextRequest) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "lat/lng inválidos" }, { status: 400 });
  }

  await prisma.deliveryPartner.update({
    where: { id: session.partnerId },
    data: {
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      lastPingAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
