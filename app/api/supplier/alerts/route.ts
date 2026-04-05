export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSupplier } from "@/lib/require-supplier";
import { prisma } from "@/lib/prisma";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/supplier/alerts
 * Alertas de reorden: productos del proveedor en stock bajo en las bodegas del tenant.
 * Oportunidad de venta proactiva para el proveedor.
 */
export async function GET(req: NextRequest) {
  try {
    const supplier = await requireSupplier(req);
    if (!supplier) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { supplierId, tenantId } = supplier;

    // Productos en stock bajo que este proveedor ha suministrado antes
    const alerts = await prisma.$queryRaw<
      {
        productId: number;
        name: string;
        category: string;
        unit: string;
        stock: number;
        stockMin: number;
        stockMax: number | null;
        lastPurchaseDate: Date | null;
        lastUnitCost: number | null;
      }[]
    >`
      SELECT DISTINCT ON (p.id)
        p.id            AS "productId",
        p.name,
        p.category,
        p.unit,
        p.stock,
        p."stockMin",
        p."stockMax",
        po."createdAt"  AS "lastPurchaseDate",
        pi."unitCost"   AS "lastUnitCost"
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
      ORDER BY p.id, po."createdAt" DESC
      LIMIT 50
    `;

    logger.debug("[SUPPLIER-ALERTS] stock-low count", { supplierId, count: alerts.length });

    return NextResponse.json({
      alerts: alerts.map((a) => ({
        productId: a.productId,
        name: a.name,
        category: a.category,
        unit: a.unit,
        currentStock: a.stock,
        stockMin: a.stockMin,
        stockMax: a.stockMax,
        urgency: a.stock === 0 ? "crítico" : a.stock <= Math.ceil(a.stockMin / 2) ? "alto" : "medio",
        lastPurchaseDate: a.lastPurchaseDate?.toISOString() ?? null,
        lastUnitCost: a.lastUnitCost,
        suggestedQty: a.stockMax != null ? a.stockMax - a.stock : a.stockMin * 2,
      })),
      total: alerts.length,
    });
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
