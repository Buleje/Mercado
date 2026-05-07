import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDriver } from "@/lib/auth/driver-session";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// SECURITY 2026-05-06 (audit delivery #15): rate limit centralizado en vez
// de Map per-process. Antes en Vercel multi-region el atacante saltaba el
// RL cambiando de instancia. El helper `rateLimit` usa Upstash si está
// configurado, fallback a Map shareado para dev.

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const { orderId, lat, lng, partnerId } =
      (body ?? {}) as Record<string, unknown>;

    if (!orderId || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json(
        { error: "Se requieren orderId, lat y lng" },
        { status: 400 }
      );
    }

    // partnerId required in body to scope the auth token
    if (typeof partnerId !== "string" || partnerId.length === 0) {
      return NextResponse.json(
        { error: "Se requiere partnerId para autenticación" },
        { status: 400 }
      );
    }

    // Auth: verify the driver token before trusting any GPS data
    const guard = await requireDriver(req, partnerId, prisma);
    if (guard instanceof NextResponse) return guard;
    const { tenantId } = guard;

    // Rate limit: máximo 6 updates por minuto por orderId (~1 cada 10s).
    const rl = rateLimit(`tracking:update:${orderId}`, 6, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Demasiadas actualizaciones. Espera 10 segundos." },
        { status: 429 },
      );
    }

    // Verificar que la asignación existe y pertenece al tenant + partner autenticado
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { orderId: orderId as string },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "No hay delivery asignado para esta orden" },
        { status: 404 }
      );
    }

    // Cross-tenant guard: assignment must belong to the authenticated driver's tenant
    if (assignment.tenantId !== tenantId) {
      logger.warn("[tracking/update] Tenant mismatch", {
        assignmentTenantId: assignment.tenantId,
        driverTenantId: tenantId,
        orderId,
        partnerId,
      });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Ensure the assignment belongs to the authenticated driver (not another driver in same tenant)
    if (assignment.partnerId !== partnerId) {
      logger.warn("[tracking/update] Driver-assignment mismatch", {
        assignmentPartnerId: assignment.partnerId,
        requestPartnerId: partnerId,
        orderId,
      });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Validate coordinates are within sane ranges (GPS spoofing mitigation)
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: "Coordenadas fuera de rango" },
        { status: 422 }
      );
    }

    // Almacenar coordenadas en notes como JSON (sin migración de schema)
    let notesData: Record<string, unknown> = {};
    try {
      notesData = assignment.notes ? JSON.parse(assignment.notes) : {};
    } catch {
      notesData = {};
    }

    notesData.trackingLat = lat;
    notesData.trackingLng = lng;
    notesData.trackingUpdatedAt = new Date().toISOString();

    await prisma.deliveryAssignment.update({
      where: { orderId: orderId as string },
      data: { notes: JSON.stringify(notesData) },
    });

    return NextResponse.json({ ok: true, lat, lng });
  } catch (err) {
    logger.error("[tracking/update] POST error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
