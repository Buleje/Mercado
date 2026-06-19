import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/delivery/partner-session";
import { DeliveryAssignmentsDB } from "@/lib/db/delivery-assignments.db";
import { sequenceStops, type RouteStop, type RoutePoint } from "@/lib/delivery/route";
import { coordsFromLocation } from "@/lib/geo-utils";
import { logger } from "@/lib/logger";

/**
 * GET /api/delivery/me/route
 * Ruta apilada del repartidor: agrega TODOS sus pedidos activos y los ordena
 * por cercanía (vecino-más-cercano) desde su posición actual, con ETA por
 * parada. Estilo Rappi/Uber "pedidos apilados". Read-only.
 *
 * Query opcional: ?lat=&lng= (posición GPS del repartidor). Si falta, usamos
 * las coords por defecto de la bodega como punto de inicio.
 */

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

interface RouteStopData {
  assignmentId: string;
  status: string;
  fee: number;
  tipAmount: number;
  orderId: string;
  customerName: string;
  customerPhone: string | null;
  customerLocation: string | null;
  customerReference: string | null;
  total: number;
  hasGps: boolean;
  items: { name: string; quantity: number; unit: string }[];
}

export async function GET(req: NextRequest) {
  try {
    const session = await requirePartner(req);
    if (session instanceof NextResponse) return session;

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      lat: url.searchParams.get("lat") ?? undefined,
      lng: url.searchParams.get("lng") ?? undefined,
    });

    // Punto de inicio: GPS del repartidor o, en su defecto, la bodega.
    const fallback = coordsFromLocation("");
    const start: RoutePoint =
      parsed.success && parsed.data.lat != null && parsed.data.lng != null
        ? { lat: parsed.data.lat, lng: parsed.data.lng }
        : { lat: fallback.lat, lng: fallback.lon };

    // Scope por partnerId (frontera = sesión HMAC); ver listActiveForPartner.
    const assignments = await DeliveryAssignmentsDB.listActiveForPartner(
      session.partnerId,
    );

    const stops: RouteStop<RouteStopData>[] = assignments.map((a) => {
      // Preferimos las coords del pedido; si no hay, parseamos "GPS:" del texto.
      let point: RoutePoint | null = null;
      if (a.order.dropoffLat != null && a.order.dropoffLng != null) {
        point = { lat: a.order.dropoffLat, lng: a.order.dropoffLng };
      } else if (a.order.customerLocation?.includes("GPS:")) {
        const c = coordsFromLocation(a.order.customerLocation);
        point = { lat: c.lat, lng: c.lon };
      }
      return {
        point,
        data: {
          assignmentId: a.id,
          status: a.status,
          fee: Number(a.fee),
          tipAmount: Number(a.tipAmount),
          orderId: a.order.id,
          customerName: a.order.customerName,
          customerPhone: a.order.customerPhone,
          customerLocation: a.order.customerLocation,
          customerReference: a.order.customerReference,
          total: Number(a.order.total),
          hasGps: point !== null,
          items: a.order.items,
        },
      };
    });

    const { ordered, totalDistanceKm, totalDurationMin } = sequenceStops(start, stops);
    const totalEarnings = stops.reduce((sum, s) => sum + s.data.fee + s.data.tipAmount, 0);

    return NextResponse.json({
      count: ordered.length,
      totalDistanceKm,
      totalDurationMin,
      totalEarnings,
      stops: ordered.map((s) => ({
        sequence: s.sequence,
        legDistanceKm: s.legDistanceKm,
        legDurationMin: s.legDurationMin,
        cumulativeDistanceKm: s.cumulativeDistanceKm,
        cumulativeDurationMin: s.cumulativeDurationMin,
        ...s.data,
      })),
    });
  } catch (e) {
    logger.error("[delivery/me/route] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
