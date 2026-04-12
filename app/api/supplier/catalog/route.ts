import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSupplier } from "@/lib/require-supplier";
import { toNumOrZero } from "@/lib/decimal-utils";
import { prisma } from "@/lib/prisma";
import { SupplierPriceVersionDB } from "@/lib/db/supplier-portal.db";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload } from "@/lib/api-error";

const priceUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        newPrice: z.number().positive(),
        sku: z.string().optional(),
      }),
    )
    .min(1, "Se requiere al menos un producto"),
});

/**
 * GET /api/supplier/catalog
 * Productos que este proveedor ha suministrado históricamente (via PurchaseItems).
 * Incluye precio actual y últimas 5 versiones de precio.
 */
export async function GET(req: NextRequest) {
  try {
    const supplier = await requireSupplier(req);
    if (!supplier) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { supplierId, tenantId } = supplier;

    // Productos suministrados por este proveedor (vía purchaseItems)
    const suppliedProducts = await prisma.$queryRaw<
      {
        productId: number;
        name: string;
        price: number;
        costPrice: number | null;
        unit: string;
        sku: string | null;
        stock: number | null;
      }[]
    >`
      SELECT DISTINCT
        p.id AS "productId",
        p.name,
        p.price,
        p."costPrice",
        p.unit,
        p.barcode AS sku,
        p.stock
      FROM "Product" p
      INNER JOIN "PurchaseItem" pi ON pi."productId" = p.id
      INNER JOIN "PurchaseOrder" po ON po.id = pi."purchaseOrderId"
      WHERE po."supplierId" = ${supplierId}
        AND po."tenantId" = ${tenantId}
        AND p."tenantId" = ${tenantId}
        AND p."deletedAt" IS NULL
      ORDER BY p.name ASC
    `;

    // Historial de precios por producto (últimas 5 versiones)
    const priceVersions = await SupplierPriceVersionDB.getBySupplierId(supplierId, 200);

    const priceHistoryByProduct: Record<number, typeof priceVersions> = {};
    for (const v of priceVersions) {
      const pid = parseInt(v.sku ?? "", 10);
      if (!isNaN(pid)) {
        if (!priceHistoryByProduct[pid]) priceHistoryByProduct[pid] = [];
        priceHistoryByProduct[pid].push(v);
      }
    }

    return NextResponse.json({
      products: suppliedProducts.map((p) => ({
        productId: p.productId,
        name: p.name,
        currentPrice: p.price,
        costPrice: p.costPrice,
        unit: p.unit,
        sku: p.sku,
        stock: p.stock,
        priceHistory: (priceHistoryByProduct[p.productId] ?? []).slice(0, 5),
      })),
    });
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}

/**
 * PUT /api/supplier/catalog
 * Actualizar precios de productos.
 * Registra versión histórica en SupplierPriceVersion.
 */
export async function PUT(req: NextRequest) {
  try {
    const supplier = await requireSupplier(req);
    if (!supplier) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { supplierId, supplierName, tenantId } = supplier;

    const body = await req.json().catch(() => ({}));
    const parsed = priceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const results: { productId: number; name: string; oldPrice: number; newPrice: number }[] = [];

    for (const update of parsed.data.updates) {
      const product = await prisma.product.findFirst({
        where: { id: update.productId, tenantId, deletedAt: null },
        select: { id: true, name: true, price: true, barcode: true },
      });

      if (!product) continue;

      // TD-018: product.price es Decimal
      const oldPriceNum = toNumOrZero(product.price);

      // Registrar versión de precio histórica
      await SupplierPriceVersionDB.create(tenantId, {
        supplierId,
        productName: product.name,
        sku: update.sku ?? product.barcode ?? undefined,
        oldPrice: oldPriceNum,
        newPrice: update.newPrice,
      });

      results.push({
        productId: product.id,
        name: product.name,
        oldPrice: oldPriceNum,
        newPrice: update.newPrice,
      });
    }

    logActivity(
      "UPDATE",
      "supplier-catalog",
      `Proveedor ${supplierName} actualizó precios de ${results.length} producto(s)`,
      supplierId,
      supplierName,
    ).catch(() => {});

    return NextResponse.json({ updated: results.length, results });
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
