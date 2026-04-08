export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { DeliveryRouteStopsDB, type RouteStopStatus } from "@/lib/db/delivery.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";

const StopStatusSchema = z.enum(["pending", "arrived", "delivered", "failed", "skipped"]);

const AddStopBody = z.object({
  orderId:            z.string().min(1).max(100),
  address:            z.string().min(1).max(500),
  addressDetail:      z.string().max(300).optional(),
  lat:                z.number().min(-90).max(90).optional(),
  lng:                z.number().min(-180).max(180).optional(),
  customerName:       z.string().min(1).max(150),
  customerPhone:      z.string().max(20).optional(),
  estimatedArrivalAt: z.string().datetime().optional(),
  notes:              z.string().max(500).optional(),
});

const MarkStopBody = z.object({
  stopId:            z.string().min(1).max(100),
  status:            StopStatusSchema,
  failureReason:     z.string().max(300).optional(),
  proofPhotoUrl:     z.string().url().max(500).optional(),
  proofSignatureUrl: z.string().url().max(500).optional(),
  lat:               z.number().min(-90).max(90).optional(),
  lng:               z.number().min(-180).max(180).optional(),
});

/**
 * POST /api/admin/delivery/routes/[routeId]/stops
 * Agrega una parada al final de la ruta (auto-sequence).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { routeId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AddStopBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const stop = await DeliveryRouteStopsDB.addStop({
      tenantId:           auth.tenantId,
      routeId,
      orderId:            parsed.data.orderId,
      address:            parsed.data.address,
      addressDetail:      parsed.data.addressDetail,
      lat:                parsed.data.lat,
      lng:                parsed.data.lng,
      customerName:       parsed.data.customerName,
      customerPhone:      parsed.data.customerPhone,
      estimatedArrivalAt: parsed.data.estimatedArrivalAt,
      notes:              parsed.data.notes,
    });
    return NextResponse.json({ data: stop }, { status: 201 });
  } catch (err) {
    logger.error("[delivery/stops] add failed", { err: String(err), routeId });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/delivery/stops",
      tenantId: auth.tenantId,
      extra: { verb: "POST", routeId },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * GET /api/admin/delivery/routes/[routeId]/stops
 * Lista las paradas de una ruta ordenadas por sequence.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero", "delivery", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { routeId } = await params;

  try {
    const stops = await DeliveryRouteStopsDB.listByRoute(auth.tenantId, routeId);
    return NextResponse.json(
      { data: stops },
      {
        headers: {
          "X-Total-Count": String(stops.length),
        },
      },
    );
  } catch (err) {
    logger.error("[delivery/stops] list failed", { err: String(err), routeId });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/delivery/stops",
      tenantId: auth.tenantId,
      extra: { verb: "GET", routeId },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/delivery/routes/[routeId]/stops
 * Marca una parada como arrived|delivered|failed|skipped.
 * Si delivered/failed → emite automáticamente un DeliveryTracking event
 * para el Order asociado.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero", "delivery"]);
  if (auth instanceof NextResponse) return auth;

  const { routeId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = MarkStopBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await DeliveryRouteStopsDB.markStop({
      tenantId:          auth.tenantId,
      stopId:            parsed.data.stopId,
      status:            parsed.data.status as RouteStopStatus,
      failureReason:     parsed.data.failureReason,
      proofPhotoUrl:     parsed.data.proofPhotoUrl,
      proofSignatureUrl: parsed.data.proofSignatureUrl,
      lat:               parsed.data.lat,
      lng:               parsed.data.lng,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[delivery/stops] patch failed", { err: String(err), routeId });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/delivery/stops",
      tenantId: auth.tenantId,
      extra: {
        verb: "PATCH",
        routeId,
        stopId: parsed.data.stopId,
      },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
