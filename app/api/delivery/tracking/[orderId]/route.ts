export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { orderId },
      include: {
        partner: { select: { name: true, phone: true } },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "No hay delivery asignado para esta orden" },
        { status: 404 }
      );
    }

    // Leer coordenadas GPS almacenadas en notes (JSON temporal sin migración)
    let trackingLat: number | null = null;
    let trackingLng: number | null = null;
    let trackingUpdatedAt: string | null = null;
    try {
      if (assignment.notes) {
        const notesData = JSON.parse(assignment.notes);
        trackingLat = typeof notesData.trackingLat === "number" ? notesData.trackingLat : null;
        trackingLng = typeof notesData.trackingLng === "number" ? notesData.trackingLng : null;
        trackingUpdatedAt = notesData.trackingUpdatedAt ?? null;
      }
    } catch {
      // notes no es JSON válido — ignorar
    }

    return NextResponse.json({
      status: assignment.status,
      partnerName: assignment.partner.name,
      partnerPhone: assignment.partner.phone,
      fee: assignment.fee,
      pickedUpAt: assignment.pickedUpAt,
      deliveredAt: assignment.deliveredAt,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      trackingLat,
      trackingLng,
      trackingUpdatedAt,
    });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
