import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// GET /api/turnos/activo — get currently open turno for authenticated admin
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Buscar CUALQUIER turno abierto del tenant (no solo del usuario actual)
    const turno = await prisma.turno.findFirst({
      where: { tenantId: auth.tenantId, status: "ABIERTO" },
      orderBy: { abrioEn: "desc" },
    });

    if (!turno) {
      return NextResponse.json({ turnoActivo: false, turno: null });
    }

    return NextResponse.json({
      turnoActivo: true,
      turno: {
        id: turno.id,
        adminUserId: turno.adminUserId,
        inicioEfectivo: Number(turno.inicioEfectivo),
        ventasTotal: Number(turno.ventasTotal),
        status: turno.status,
        abrioEn: turno.abrioEn.toISOString(),
        minutosActivo: Math.floor((Date.now() - turno.abrioEn.getTime()) / 60000),
      },
    });
  } catch (e) {
    logger.error("[turnos/activo] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
