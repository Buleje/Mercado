export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DeliveryTrackingDB } from "@/lib/db/delivery.db";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { isFeatureEnabled } from "@/lib/feature-flags";

/**
 * GET /api/track/[orderId]
 *
 * Endpoint PÚBLICO (sin auth) — muestra el estado del envío al cliente final.
 * Este es el link que viaja por WhatsApp cuando se envía el pedido:
 *
 *   https://bodegasaas.com/api/track/MKT-A1B2C3D4E5F6
 *
 * Seguridad:
 *   - El orderId es el único secreto — se asume que Brandon lo genera
 *     con suficiente entropía (ya usa crypto.randomUUID slice 12 uppercase)
 *   - NO expone campos sensibles del customer (solo el primer nombre)
 *   - NO expone tenantId, driver personal data, o notas internas
 *   - Cache 15s para evitar hammering del endpoint público
 *   - Se podría agregar `?code=xxx` adicional en una iteración futura
 *     si el dueño quiere más seguridad (por ahora YAGNI)
 */

type PublicTrackingEvent = {
  status: string;
  description: string | null;
  etaMinutes: number | null;
  distanceM: number | null;
  lat: number | null;
  lng: number | null;
  photoUrl: string | null;
  createdAt: string;
};

type PublicTrackingResponse = {
  orderId: string;
  customerFirstName: string;
  storeName: string;
  currentStatus: string;
  deliveredAt: string | null;
  estimatedDeliveryAt: string | null;
  driverName: string | null;
  dropoff: { lat: number | null; lng: number | null };
  events: PublicTrackingEvent[];
};

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;

  // Gate — feature flag del endpoint público
  if (!isFeatureEnabled("delivery-live-public-link")) {
    return NextResponse.json(
      { error: "Tracking temporalmente no disponible" },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  // Validación minimal de formato (prevenir abuso de enumeración)
  if (!orderId || orderId.length < 8 || orderId.length > 100) {
    return NextResponse.json({ error: "Invalid tracking code" }, { status: 400 });
  }

  try {
    const cacheKey = `track:public:${orderId}`;
    const data = await getOrSet<PublicTrackingResponse | null>(cacheKey, 15, async () => {
      // Leer el order con raw SQL porque los 8 campos nuevos de D1.4 todavía
      // no están en schema.prisma (el SQL fue aplicado manualmente)
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenantId: string;
          customerName: string;
          deliveryStatus: string | null;
          driverId: string | null;
          deliveredAt: Date | null;
          estimatedDeliveryAt: Date | null;
          dropoffLat: number | null;
          dropoffLng: number | null;
        }>
      >(
        `SELECT "id","tenantId","customerName","deliveryStatus","driverId",
                "deliveredAt","estimatedDeliveryAt","dropoffLat","dropoffLng"
           FROM "Order"
          WHERE "id" = $1 AND "deletedAt" IS NULL
          LIMIT 1`,
        orderId,
      );
      const order = rows[0];
      if (!order) return null;

      // Buscar el nombre de la tienda (Store) asociada al tenantId
      const store = await prisma.store.findFirst({
        where: { tenantId: order.tenantId },
        select: { name: true },
      });

      // Buscar el nombre del driver si hay alguno
      let driverName: string | null = null;
      if (order.driverId) {
        const routeRows = await prisma.$queryRawUnsafe<
          Array<{ driverName: string }>
        >(
          `SELECT "driverName" FROM "DeliveryRoute"
            WHERE "driverId" = $1 AND "tenantId" = $2
            ORDER BY "createdAt" DESC
            LIMIT 1`,
          order.driverId,
          order.tenantId,
        );
        driverName = routeRows[0]?.driverName ?? null;
      }

      // Historial de tracking (público — campos seguros)
      const events = await DeliveryTrackingDB.listByOrder(order.tenantId, order.id);

      return {
        orderId:             order.id,
        customerFirstName:   firstName(order.customerName),
        storeName:           store?.name ?? "Tienda",
        currentStatus:       order.deliveryStatus ?? "preparing",
        deliveredAt:         order.deliveredAt ? order.deliveredAt.toISOString() : null,
        estimatedDeliveryAt: order.estimatedDeliveryAt
          ? order.estimatedDeliveryAt.toISOString()
          : null,
        driverName,
        dropoff: {
          lat: order.dropoffLat,
          lng: order.dropoffLng,
        },
        events: events.map<PublicTrackingEvent>((e) => ({
          status:      e.status,
          description: e.description,
          etaMinutes:  e.etaMinutes,
          distanceM:   e.distanceM,
          lat:         e.lat,
          lng:         e.lng,
          photoUrl:    e.photoUrl,
          createdAt:   e.createdAt,
        })),
      };
    });

    if (!data) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "public, max-age=10, s-maxage=15",
          "X-Robots-Tag":  "noindex, nofollow",
        },
      },
    );
  } catch (err) {
    logger.error("[track/[orderId]] failed", { err: String(err), orderId });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/track/public",
      tags: { severity_user_facing: "true" },
      extra: { verb: "GET", orderId },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
