import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { DeliveryTrackingDB, type DeliveryStatus, type DeliveryActorType } from "@/lib/db/delivery.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { assertCsrf } from "@/lib/auth/csrf";

const StatusSchema = z.enum([
  "preparing",
  "ready",
  "picked_up",
  "in_transit",
  "nearby",
  "delivered",
  "failed",
  "cancelled",
]);

const ActorSchema = z.enum(["driver", "system", "admin", "customer"]);

const AddBody = z.object({
  orderId:      z.string().min(1).max(100),
  status:       StatusSchema,
  description:  z.string().max(300).optional(),
  lat:          z.number().min(-90).max(90).optional(),
  lng:          z.number().min(-180).max(180).optional(),
  distanceM:    z.number().int().nonnegative().optional(),
  etaMinutes:   z.number().int().nonnegative().optional(),
  actorId:      z.string().max(100).optional(),
  actorType:    ActorSchema.optional(),
  photoUrl:     z.string().url().max(500).optional(),
  metadataJson: z.string().max(2000).optional(),
});

/**
 * POST /api/admin/delivery/tracking
 * Agregar un evento al timeline del envío.
 * Roles: admin, cajero, delivery, almacenero.
 */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero", "delivery", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AddBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await DeliveryTrackingDB.add({
      tenantId:     auth.tenantId,
      orderId:      parsed.data.orderId,
      status:       parsed.data.status as DeliveryStatus,
      description:  parsed.data.description,
      lat:          parsed.data.lat,
      lng:          parsed.data.lng,
      distanceM:    parsed.data.distanceM,
      etaMinutes:   parsed.data.etaMinutes,
      actorId:      parsed.data.actorId ?? auth.username,
      actorType:    (parsed.data.actorType as DeliveryActorType | undefined) ?? "admin",
      photoUrl:     parsed.data.photoUrl,
      metadataJson: parsed.data.metadataJson,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    logger.error("[delivery/tracking] add failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/delivery/tracking",
      tenantId: auth.tenantId,
      extra: {
        verb: "POST",
        orderId: parsed.data.orderId,
        status: parsed.data.status,
      },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * GET /api/admin/delivery/tracking?orderId=...
 * GET /api/admin/delivery/tracking           → último evento de cada order activo
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "delivery", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const orderId = req.nextUrl.searchParams.get("orderId");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);

  try {
    if (orderId) {
      const events = await DeliveryTrackingDB.listByOrder(auth.tenantId, orderId);
      return NextResponse.json(
        { data: events },
        {
          headers: {
            "X-Total-Count": String(events.length),
          },
        },
      );
    }

    const latest = await DeliveryTrackingDB.latestPerOrder(auth.tenantId, limit);
    return NextResponse.json(
      { data: latest },
      {
        headers: {
          "X-Total-Count": String(latest.length),
        },
      },
    );
  } catch (err) {
    logger.error("[delivery/tracking] list failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/delivery/tracking",
      tenantId: auth.tenantId,
      extra: { verb: "GET" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
