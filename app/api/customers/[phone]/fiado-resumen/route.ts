export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { phone } = await params;
  const tenantId = auth.tenantId ?? "main";

  try {
    // Aggregate active fiados
    const agg = await prisma.fiado.aggregate({
      where: {
        tenantId,
        customerId: phone,
        status: "ACTIVO",
      },
      _sum: { saldo: true },
      _count: true,
    });

    const montoPendiente = Number(agg._sum.saldo ?? 0);
    const cantidadFiados = agg._count ?? 0;

    // Find oldest active fiado to calculate days overdue
    let diasVencido = 0;
    let hasFiadosVencidos = false;

    if (cantidadFiados > 0) {
      const oldest = await prisma.fiado.findFirst({
        where: {
          tenantId,
          customerId: phone,
          status: "ACTIVO",
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, fechaVence: true },
      });

      if (oldest) {
        const now = new Date();
        diasVencido = Math.floor(
          (now.getTime() - oldest.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (oldest.fechaVence && oldest.fechaVence < now) {
          hasFiadosVencidos = true;
        }
      }
    }

    return NextResponse.json({
      montoPendiente,
      cantidadFiados,
      diasVencido,
      hasFiadosVencidos,
    });
  } catch (e) {
    console.error("[Fiado Resumen]", e);
    return NextResponse.json(
      { error: "Error al obtener resumen de fiado" },
      { status: 500 }
    );
  }
}
