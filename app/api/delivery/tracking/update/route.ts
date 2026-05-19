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

    // Audit 2026-05-17 03-P1-1: antes findUnique({orderId}) cargaba data del
    // assignment ANTES de validar tenant/partner — leak de tenantId/partnerId
    // ajenos por timing. Además 2 códigos 403 distintos (tenant-mismatch vs
    // partner-mismatch) permitían enumeration. Ahora findFirst con scope
    // completo y 404 unificado: el atacante no distingue "no existe" de
    // "existe pero no es tuyo".
    const assignment = await prisma.deliveryAssignment.findFirst({
      where: {
        orderId: orderId as string,
        tenantId,
        partnerId,
      },
    });

    if (!assignment) {
      logger.warn("[tracking/update] Assignment not found or out of scope", {
        orderId,
        partnerId,
        tenantId,
      });
      return NextResponse.json(
        { error: "No hay delivery asignado para esta orden" },
        { status: 404 },
      );
    }

    // Validate coordinates are within sane ranges (GPS spoofing mitigation)
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: "Coordenadas fuera de rango" },
        { status: 422 }
      );
    }

    // Audit 2026-05-17 03-P2-3 (TD-056): atómico read-modify-write con
    // SELECT FOR UPDATE para evitar race entre GPS pings concurrentes.
    // Antes: leer notes → parse → merge → write. Dos PATCH a 50ms uno del
    // otro perdían un ping y peor: podían borrar campos como `rated:true`
    // escritos por /api/delivery/rate en la ventana entre read y write.
    // Ahora: la transacción lockea el row mientras hacemos parse+merge+UPDATE
    // serial. PostgreSQL SERIALIZABLE evita el lost update.
    const now = new Date().toISOString();
    try {
      await prisma.$transaction(async (tx) => {
        // Lock pessimista (FOR UPDATE) en el row del assignment durante la tx.
        // Cualquier otro PATCH para el mismo orderId+tenant+partner espera.
        const locked = await tx.$queryRawUnsafe<Array<{ notes: string | null }>>(
          `SELECT notes FROM "DeliveryAssignment"
             WHERE "orderId" = $1 AND "tenantId" = $2 AND "partnerId" = $3
             FOR UPDATE`,
          orderId as string,
          tenantId,
          partnerId,
        );
        if (locked.length === 0) {
          throw new Error("ASSIGNMENT_NOT_FOUND");
        }
        let notesData: Record<string, unknown> = {};
        try {
          notesData = locked[0].notes ? JSON.parse(locked[0].notes) : {};
        } catch {
          notesData = {};
        }
        notesData.trackingLat = lat;
        notesData.trackingLng = lng;
        notesData.trackingUpdatedAt = now;
        await tx.deliveryAssignment.update({
          where: { orderId: orderId as string },
          data: { notes: JSON.stringify(notesData) },
        });
      });
    } catch (txErr) {
      if (txErr instanceof Error && txErr.message === "ASSIGNMENT_NOT_FOUND") {
        return NextResponse.json(
          { error: "No hay delivery asignado para esta orden" },
          { status: 404 },
        );
      }
      throw txErr;
    }

    return NextResponse.json({ ok: true, lat, lng });
  } catch (err) {
    logger.error("[tracking/update] POST error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
