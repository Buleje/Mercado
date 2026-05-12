import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { phone } = await params;
  const tenantId = auth.tenantId;

  try {
    // Aggregate active fiados
    // eslint-disable-next-line no-restricted-properties -- aggregation tenant-scoped; migration to lib/db/fiados.db.ts pendiente.
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
      // eslint-disable-next-line no-restricted-properties -- lookup tenant-scoped; migration pendiente.
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
    logger.error("[Fiado Resumen]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: "Error al obtener resumen de fiado" },
      { status: 500 }
    );
  }
}
