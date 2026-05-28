import { NextRequest, NextResponse } from "next/server";
import { TrackOrderDB } from "@/lib/db/track-order.db";
import { DeliveryTrackingDB } from "@/lib/db/delivery.db";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTenantFromHost } from "@/lib/middleware/tenant";

// Slugs "neutros" — significan que el Host no apunta a un tenant específico
// (localhost dev, vercel preview, dominio raíz). En esos casos NO se aplica
// la verificación cross-tenant porque no hay tenant concreto del Host.
const HOST_NEUTRAL_SLUGS = new Set(["main", "www"]);

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
 *
 * Audit project-wide 2026-05-19: migrado de prisma.* directo a TrackOrderDB.
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
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  // SECURITY 2026-05-06 (audit team): rate limit por IP — endpoint público
  // sin auth permite enumeración de orderIds. Cache 15s mitiga repetidos pero
  // scraping masivo aún era posible. STRICT = 60 req/min/IP.
  const rl = await applyRateLimit(req, "STRICT", "track-public");
  if (rl) return rl;

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

  // Brandon 2026-05-28 P0 (audit #1 SEC — IDOR cross-tenant):
  // El endpoint es público (link de WhatsApp), pero antes no verificaba que
  // el order pertenezca al tenant del Host. Si el orderId era predecible o
  // se filtraba, alguien podía consultarlo desde cualquier subdominio. Ahora
  // resolvemos el tenantId del Host y exigimos coincidencia con order.tenantId.
  // Hosts neutrales (localhost, vercel preview, raíz) saltan el check.
  const hostSlug = resolveTenantFromHost(req);
  const expectedTenantId = HOST_NEUTRAL_SLUGS.has(hostSlug)
    ? null
    : await TrackOrderDB.findTenantIdBySlug(hostSlug);

  try {
    // Cache key incluye expectedTenantId para que pizza-pucallpa y mi-pollo
    // cacheen el mismo orderId por separado si llegan a coincidir en colisión.
    const cacheKey = `track:public:${expectedTenantId ?? "any"}:${orderId}`;
    const data = await getOrSet<PublicTrackingResponse | null>(cacheKey, 15, async () => {
      // Leer el order con raw SQL porque los 8 campos nuevos de D1.4 todavía
      // no están en schema.prisma (el SQL fue aplicado manualmente)
      const order = await TrackOrderDB.findOrderForTracking(orderId);
      if (!order) return null;

      // Cross-tenant guard. Si el Host pide pizza-pucallpa pero el order es de
      // mi-pollo, retornamos null (404). NO leak — la respuesta es idéntica
      // a "no existe", así no se confirma la existencia del orderId.
      if (expectedTenantId && order.tenantId !== expectedTenantId) {
        return null;
      }

      // Buscar el nombre de la tienda (Store) asociada al tenantId
      const storeName = await TrackOrderDB.findStoreNameByTenantId(order.tenantId);

      // Buscar el nombre del driver si hay alguno
      let driverName: string | null = null;
      if (order.driverId) {
        driverName = await TrackOrderDB.findDriverNameByRoute(order.driverId, order.tenantId);
      }

      // Historial de tracking (público — campos seguros)
      const events = await DeliveryTrackingDB.listByOrder(order.tenantId, order.id);

      return {
        orderId:             order.id,
        customerFirstName:   firstName(order.customerName),
        storeName:           storeName ?? "Tienda",
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
