/**
 * GET /api/delivery/hot-zones
 *
 * Devuelve las 6 zonas de alta demanda de Pucallpa para la app del repartidor.
 *
 * Query params (opcionales):
 *   lat  — latitud actual del repartidor (float)
 *   lng  — longitud actual del repartidor (float)
 *
 * Auth: cookie `buleje-partner-sess` (requirePartner).
 * Cache: "use cache" en DeliveryHotZonesDb.getHotZones — revalidate 300s.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePartner } from "@/lib/delivery/partner-session";
import { DeliveryHotZonesDb } from "@/lib/db/delivery-hot-zones.db";


export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  // ── Query params ─────────────────────────────────────────────────────────────
  const { searchParams } = req.nextUrl;

  const rawLat = searchParams.get("lat");
  const rawLng = searchParams.get("lng");

  const partnerLat =
    rawLat !== null && rawLat !== "" ? parseFloat(rawLat) : undefined;
  const partnerLng =
    rawLng !== null && rawLng !== "" ? parseFloat(rawLng) : undefined;

  // Descartar si parseFloat produjo NaN (ej. "abc")
  const validLat =
    partnerLat !== undefined && Number.isFinite(partnerLat)
      ? partnerLat
      : undefined;
  const validLng =
    partnerLng !== undefined && Number.isFinite(partnerLng)
      ? partnerLng
      : undefined;

  // ── Lógica ───────────────────────────────────────────────────────────────────
  try {
    const zones = await DeliveryHotZonesDb.getHotZones(
      session.tenantId,
      validLat,
      validLng,
    );

    return NextResponse.json({ zones });
  } catch (err) {
    return NextResponse.json(
      { error: "Error al obtener hot zones" },
      { status: 500 },
    );
  }
}
