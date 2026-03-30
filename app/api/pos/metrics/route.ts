export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";

  try {
    // Find active turno
    const turno = await prisma.turno.findFirst({
      where: { tenantId, status: "ABIERTO" },
      orderBy: { abrioEn: "desc" },
    });

    if (!turno) {
      return NextResponse.json({ turnoActivo: false });
    }

    // Calculate minutes since opening
    const ahora = new Date();
    const turnoMinutos = Math.floor(
      (ahora.getTime() - turno.abrioEn.getTime()) / 60000
    );

    // Aggregate sales since turno opened
    const salesAgg = await prisma.sale.aggregate({
      where: {
        tenantId,
        createdAt: { gte: turno.abrioEn },
      },
      _sum: { total: true },
      _count: true,
    });

    const totalVentas = salesAgg._sum.total ?? 0;
    const cantidadVentas = salesAgg._count ?? 0;
    const ticketPromedio =
      cantidadVentas > 0 ? Number(totalVentas) / cantidadVentas : 0;

    return NextResponse.json({
      turnoActivo: true,
      turnoId: turno.id,
      turnoMinutos,
      totalVentas: Number(totalVentas),
      cantidadVentas,
      ticketPromedio: Math.round(ticketPromedio * 100) / 100,
    });
  } catch (e) {
    console.error("[POS Metrics]", e);
    return NextResponse.json(
      { error: "Error al obtener metricas" },
      { status: 500 }
    );
  }
}
