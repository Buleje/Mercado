import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * POST /api/delivery/me/ping
 * Body: { lat, lng }
 *
 * Heartbeat — la app móvil llama cada 30s mientras está en línea.
 * Actualiza lat/lng + lastPingAt. Sin esto el matching marca offline.
 *
 * SECURITY 2026-05-06 (audit delivery #5/#6): GPS spoofing protections.
 * Antes el partner podía mandar lat/lng arbitrario para ganar offers
 * cercanos en cascada Rappi-style (fraude de fees). Ahora:
 *  - Rate limit estricto (1 req cada 5s).
 *  - Validar delta vs último ping: si en <2 min el partner se "movió" más
 *    de MAX_DELTA_KM, lo loggeamos como anomalía y aceptamos el último
 *    valor (seguimos actualizando para no romper UX, pero queda traza).
 */
const BodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const MAX_DELTA_KM_PER_2MIN = 6; // ~180 km/h máx (auto rápido)

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "STRICT", "delivery-ping");
  if (rl) return rl;

  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "lat/lng inválidos" }, { status: 400 });
  }

  const previous = await prisma.deliveryPartner.findUnique({
    where: { id: session.partnerId },
    select: { lat: true, lng: true, lastPingAt: true },
  });

  if (
    previous?.lat != null &&
    previous?.lng != null &&
    previous?.lastPingAt
  ) {
    const elapsedMin = (Date.now() - previous.lastPingAt.getTime()) / 60_000;
    if (elapsedMin < 2) {
      const deltaKm = haversineKm(
        previous.lat,
        previous.lng,
        parsed.data.lat,
        parsed.data.lng,
      );
      if (deltaKm > MAX_DELTA_KM_PER_2MIN) {
        logger.warn("[delivery/ping] anomalía GPS — posible spoofing", {
          partnerId: session.partnerId,
          deltaKm: deltaKm.toFixed(2),
          elapsedMin: elapsedMin.toFixed(2),
        });
        // No bloqueamos (puede ser red intermitente + relocalización legítima),
        // pero queda registro para auditoría / reglas futuras.
      }
    }
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
