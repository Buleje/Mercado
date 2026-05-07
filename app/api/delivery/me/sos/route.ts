import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requirePartner } from "@/lib/delivery/partner-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { DeliverySOSDb } from "@/lib/db/delivery-sos.db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// SECURITY 2026-05-05 (pentest delivery H015): sanity check vs lastPing.
// Si la SOS lat/lng está a >50km del último ping, se descarta — un partner
// comprometido (token robado) podría disparar SOS desde Lima cuando está en
// Pucallpa, desperdiciando respuesta del soporte.
const MAX_SOS_DELTA_KM = 50;

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

/**
 * POST /api/delivery/me/sos
 *
 * El repartidor emite una alerta SOS desde la app movil.
 * Persiste en DeliverySOSAlert y retorna el alertId + telefono de soporte.
 *
 * Auth: cookie buleje-partner-sess (requirePartner)
 */


const BodySchema = z.object({
  lat:     z.number().min(-90).max(90),
  lng:     z.number().min(-180).max(180),
  message: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  // SECURITY 2026-05-06 (audit delivery #6): rate limit STRICT para frenar
  // SOS spam (un partner comprometido podría inundar el panel).
  const rl = applyRateLimit(req, "STRICT", "delivery-sos");
  if (rl) return rl;
  // 1. Auth
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  // 2. Parsear body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { lat, lng, message } = parsed.data;

  // SECURITY 2026-05-05 (pentest delivery H015): sanity check vs último ping.
  const previous = await prisma.deliveryPartner.findUnique({
    where: { id: session.partnerId },
    select: { lat: true, lng: true, lastPingAt: true },
  });
  if (previous?.lat != null && previous?.lng != null && previous?.lastPingAt) {
    const ageMin = (Date.now() - previous.lastPingAt.getTime()) / 60_000;
    if (ageMin < 30) {
      const delta = haversineKm(previous.lat, previous.lng, lat, lng);
      if (delta > MAX_SOS_DELTA_KM) {
        logger.warn("[delivery/sos] lat/lng spoof detectado — descartado", {
          partnerId: session.partnerId,
          deltaKm: delta.toFixed(2),
          ageMin: ageMin.toFixed(1),
        });
        return NextResponse.json(
          { error: "Ubicación inconsistente — verifica GPS" },
          { status: 422 },
        );
      }
    }
  }

  // 3. Persistir alerta — el logger.warn esta dentro de DeliverySOSDb.create
  const alert = await DeliverySOSDb.create(
    session.partnerId,
    lat,
    lng,
    message,
  );

  // 4. Respuesta inmediata con alertId + telefono de soporte
  return NextResponse.json({
    ok:           true,
    alertId:      alert.id,
    supportPhone: process.env.NEXT_PUBLIC_BULEJE_SUPPORT_PHONE ?? "+51000000000",
  });
}
