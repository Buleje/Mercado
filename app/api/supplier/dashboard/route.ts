import { NextRequest, NextResponse } from "next/server";
import { requireSupplier } from "@/lib/require-supplier";
import { prisma } from "@/lib/prisma";
import { SupplierRatingDB } from "@/lib/db/supplier-portal.db";
import { toErrorPayload } from "@/lib/api-error";

/**
 * GET /api/supplier/dashboard
 * Dashboard del proveedor autenticado:
 * - Stats del mes: pedidos, monto total, fill-rate, ranking
 * - Últimos 10 pedidos de compra
 * - Alertas de reorden de sus productos
 */
export async function GET(req: NextRequest) {
  try {
    const supplier = await requireSupplier(req);
    if (!supplier) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { supplierId, tenantId } = supplier;

    // ── Periodo actual ──────────────────────────────────────────────────────
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const currentPeriod = `${year}-${month}`;
    const monthStart = new Date(year, now.getMonth(), 1);

    // ── Stats del mes: pedidos y monto ─────────────────────────────────────
    const [ordersAgg, lastOrders, stockAlerts, rating] = await Promise.all([
      prisma.purchaseOrder.aggregate({
        where: { supplierId, tenantId, createdAt: { gte: monthStart } },
        _count: true,
        _sum: { total: true },
      }),

      prisma.purchaseOrder.findMany({
        where: { supplierId, tenantId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          total: true,
          status: true,
          deliveryDate: true,
          createdAt: true,
          items: { select: { name: true, quantity: true, unitCost: true } },
        },
      }),

      // Productos del proveedor en stock bajo (basado en purchaseItems previos)
      prisma.$queryRaw<{ productId: number; name: string; stock: number; stockMin: number }[]>`
        SELECT DISTINCT p.id as "productId", p.name, p.stock, p."stockMin"
        FROM "Product" p
        INNER JOIN "PurchaseItem" pi ON pi."productId" = p.id
        INNER JOIN "PurchaseOrder" po ON po.id = pi."purchaseOrderId"
        WHERE po."supplierId" = ${supplierId}
          AND po."tenantId" = ${tenantId}
          AND p."tenantId" = ${tenantId}
          AND p."deletedAt" IS NULL
          AND p."stock" IS NOT NULL
          AND p."stockMin" IS NOT NULL
          AND p.stock <= p."stockMin"
        LIMIT 20
      `,

      SupplierRatingDB.getBySupplierId(supplierId).then((ratings) =>
        ratings.find((r) => r.period === currentPeriod) ?? null,
      ),
    ]);

    // ── Ranking en el tenant ───────────────────────────────────────────────
    const ranking = await SupplierRatingDB.getRanking(tenantId, supplierId, currentPeriod);

    return NextResponse.json({
      period: currentPeriod,
      stats: {
        ordersThisMonth: ordersAgg._count,
        totalAmountThisMonth: ordersAgg._sum.total ?? 0,
        fillRate: rating?.fillRate ?? null,
        ranking,
      },
      lastOrders: lastOrders.map((o) => ({
        id: o.id,
        total: o.total,
        status: o.status,
        deliveryDate: o.deliveryDate?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
        itemCount: o.items.length,
      })),
      stockAlerts: stockAlerts.map((p) => ({
        productId: p.productId,
        name: p.name,
        stock: p.stock,
        stockMin: p.stockMin,
      })),
    });
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
