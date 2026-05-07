import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  partnerId: z.string().min(1, "partnerId requerido"),
  isOnline: z.boolean(),
});

/**
 * POST /api/delivery/toggle-online
 * Alterna el estado online/offline del repartidor.
 * El campo isActive de DeliveryPartner se usa como indicador de disponibilidad.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos inválidos",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 }
      );
    }

    const { partnerId, isOnline } = parsed.data;

    // SECURITY 2026-05-07 (CRM-SEC F2): findFirst con tenantId para evitar
    // que admin A deshabilite partners de tenant B con partnerId conocido.
    const partner = await prisma.deliveryPartner.findFirst({
      where: { id: partnerId, tenantId: auth.tenantId },
      select: { id: true, name: true },
    });

    if (!partner) {
      return NextResponse.json(
        { error: "Repartidor no encontrado" },
        { status: 404 }
      );
    }

    // updateMany preserva el scope tenantId aunque Prisma no soporte
    // compound unique en deliveryPartner para where de update.
    const updateResult = await prisma.deliveryPartner.updateMany({
      where: { id: partnerId, tenantId: auth.tenantId },
      data: { isActive: isOnline },
    });

    if (updateResult.count === 0) {
      return NextResponse.json({ error: "No se pudo actualizar" }, { status: 404 });
    }

    const updated = { id: partner.id, name: partner.name, isActive: isOnline };

    logActivity(
      "Actualizar",
      "deliveryPartner",
      `${partner.name} cambió a ${isOnline ? "online" : "offline"}`,
      partnerId,
      auth.username
    ).catch((err) => logger.warn("[crm-sec] op failed", { err: String(err) }));

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      isOnline: updated.isActive,
    });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
