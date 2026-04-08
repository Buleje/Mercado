export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { DeliveryRoutesDB, type RouteStatus } from "@/lib/db/delivery.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";

const RouteStatusSchema = z.enum(["planned", "in_progress", "completed", "cancelled"]);

const CreateBody = z.object({
  storeId:        z.string().min(1).max(100),
  driverId:       z.string().min(1).max(100),
  driverName:     z.string().min(1).max(150),
  driverPhone:    z.string().max(20).optional(),
  vehicleType:    z.enum(["moto", "bici", "auto", "caminando"]).optional(),
  plannedStartAt: z.string().datetime(),
  totalDistanceM: z.number().int().nonnegative().optional(),
  notes:          z.string().max(500).optional(),
});

const PatchBody = z.object({
  routeId: z.string().min(1).max(100),
  status:  RouteStatusSchema,
});

/**
 * POST /api/admin/delivery/routes
 * Crear una ruta del día para un repartidor.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const route = await DeliveryRoutesDB.create({
      tenantId:       auth.tenantId,
      storeId:        parsed.data.storeId,
      driverId:       parsed.data.driverId,
      driverName:     parsed.data.driverName,
      driverPhone:    parsed.data.driverPhone,
      vehicleType:    parsed.data.vehicleType,
      plannedStartAt: parsed.data.plannedStartAt,
      totalDistanceM: parsed.data.totalDistanceM,
      notes:          parsed.data.notes,
    });

    return NextResponse.json({ data: route }, { status: 201 });
  } catch (err) {
    logger.error("[delivery/routes] create failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/delivery/routes",
      tenantId: auth.tenantId,
      extra: { verb: "POST" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * GET /api/admin/delivery/routes?storeId=...&status=...
 * Lista las rutas del día actual (cache 20 s).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "delivery", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const storeId = req.nextUrl.searchParams.get("storeId") ?? undefined;
  const statusRaw = req.nextUrl.searchParams.get("status");
  const status =
    statusRaw && RouteStatusSchema.safeParse(statusRaw).success
      ? (statusRaw as RouteStatus)
      : undefined;

  try {
    const routes = await DeliveryRoutesDB.listToday(auth.tenantId, { storeId, status });
    return NextResponse.json(
      { data: routes },
      {
        headers: {
          "X-Total-Count": String(routes.length),
        },
      },
    );
  } catch (err) {
    logger.error("[delivery/routes] list failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/delivery/routes",
      tenantId: auth.tenantId,
      extra: { verb: "GET" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/delivery/routes
 * Cambiar el status de una ruta existente.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "delivery"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await DeliveryRoutesDB.setStatus(
      auth.tenantId,
      parsed.data.routeId,
      parsed.data.status,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[delivery/routes] patch failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/delivery/routes",
      tenantId: auth.tenantId,
      extra: {
        verb: "PATCH",
        routeId: parsed.data.routeId,
      },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
