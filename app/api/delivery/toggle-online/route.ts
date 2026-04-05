export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
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

    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true },
    });

    if (!partner) {
      return NextResponse.json(
        { error: "Repartidor no encontrado" },
        { status: 404 }
      );
    }

    const updated = await prisma.deliveryPartner.update({
      where: { id: partnerId },
      data: { isActive: isOnline },
      select: { id: true, name: true, isActive: true },
    });

    logActivity(
      "Actualizar",
      "deliveryPartner",
      `${partner.name} cambió a ${isOnline ? "online" : "offline"}`,
      partnerId,
      auth.username
    ).catch(() => {});

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      isOnline: updated.isActive,
    });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
