export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

/**
 * GET /api/marketplace/kpis
 * KPIs del marketplace para el panel admin del vendedor.
 * Retorna: publishedProducts, monthOrders, pendingCommissions
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    // Buscar la tienda del tenant actual
    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true },
    });

    if (!store) {
      return NextResponse.json({
        publishedProducts: 0,
        monthOrders: 0,
        pendingCommissions: 0,
      });
    }

    // Inicio del mes actual
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [publishedProducts, monthOrders, pendingCommissions] = await Promise.all([
      // Productos activos en la tienda
      prisma.storeProduct.count({
        where: { storeId: store.id, isActive: true },
      }),

      // Órdenes del marketplace este mes
      prisma.order.count({
        where: {
          tenantId: auth.tenantId,
          source: "marketplace",
          deletedAt: null,
          createdAt: { gte: monthStart },
        },
      }),

      // Comisiones pendientes
      prisma.commissionLedger.aggregate({
        where: {
          storeId: store.id,
          status: "pending",
        },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json({
      publishedProducts,
      monthOrders,
      pendingCommissions: pendingCommissions._sum.amount ?? 0,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
