import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requirePartner } from "@/lib/delivery/partner-session";
import { DeliverySOSDb } from "@/lib/db/delivery-sos.db";

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
