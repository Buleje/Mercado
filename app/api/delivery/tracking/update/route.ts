export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rate-limit map: orderId → last update timestamp (in-memory, per instance)
const lastUpdateMap = new Map<string, number>();
const RATE_LIMIT_MS = 10_000; // 10 segundos

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, lat, lng } = body ?? {};

    if (!orderId || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json(
        { error: "Se requieren orderId, lat y lng" },
        { status: 400 }
      );
    }

    // Rate limit: máximo 1 update cada 10 segundos por orderId
    const now = Date.now();
    const last = lastUpdateMap.get(orderId) ?? 0;
    if (now - last < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: "Demasiadas actualizaciones. Espera 10 segundos." },
        { status: 429 }
      );
    }
    lastUpdateMap.set(orderId, now);

    // Verificar que la asignación existe
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { orderId },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "No hay delivery asignado para esta orden" },
        { status: 404 }
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
      where: { orderId },
      data: { notes: JSON.stringify(notesData) },
    });

    return NextResponse.json({ ok: true, lat, lng });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
