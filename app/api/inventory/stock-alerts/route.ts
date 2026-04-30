/* eslint-disable no-restricted-properties -- deuda existente: agregaciones cross-table de Product/SaleItem/Batch. Tenant-scoped via auth.tenantId. */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

// GET — Consolida 4 tipos de alertas de stock
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenantId = auth.tenantId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAhead = new Date();
    sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
    const today = new Date();

    // 1. SIN STOCK: products with stock = 0
    const sinStockProducts = await prisma.product.findMany({
      where: { tenantId, active: true, deletedAt: null, stock: 0 },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
      take: 100,
    });

    // Get last sale date for each sin-stock product
    const sinStockIds = sinStockProducts.map(p => p.id);
    const lastSales = sinStockIds.length > 0
      ? await prisma.saleItem.findMany({
          where: { productId: { in: sinStockIds } },
          select: { productId: true, sale: { select: { createdAt: true } } },
          orderBy: { sale: { createdAt: "desc" } },
        })
      : [];

    const lastSaleMap = new Map<number, Date>();
    for (const s of lastSales) {
      if (!lastSaleMap.has(s.productId)) {
        lastSaleMap.set(s.productId, s.sale.createdAt);
      }
    }

    const sinStock = sinStockProducts.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      lastSaleDate: lastSaleMap.get(p.id)?.toISOString() ?? null,
    }));

    // 2. STOCK CRÍTICO: stock > 0 but below stockMin
    const allActiveProducts = await prisma.product.findMany({
      where: { tenantId, active: true, deletedAt: null, stock: { gt: 0 } },
      select: { id: true, name: true, stock: true, stockMin: true, category: true },
      orderBy: { name: "asc" },
    });

    const stockCritico = allActiveProducts
      .filter(p => p.stockMin != null && p.stockMin > 0 && (p.stock ?? 0) <= p.stockMin)
      .slice(0, 100)
      .map(p => ({
        id: p.id,
        name: p.name,
        stock: p.stock ?? 0,
        stockMin: p.stockMin ?? 0,
        category: p.category,
      }));

    // 3. SIN MOVIMIENTO: products with stock > 0 but 0 sales in 30 days
    const productsWithStock = allActiveProducts.filter(p => (p.stock ?? 0) > 0);
    const productIdsWithStock = productsWithStock.map(p => p.id);

    const recentSaleItems = productIdsWithStock.length > 0
      ? await prisma.saleItem.findMany({
          where: {
            productId: { in: productIdsWithStock },
            sale: { createdAt: { gte: thirtyDaysAgo }, tenantId },
          },
          select: { productId: true },
          distinct: ["productId"],
        })
      : [];

    const recentSoldIds = new Set(recentSaleItems.map(s => s.productId));

    // Get full product info including costPrice for stale products
    const staleProductIds = productsWithStock
      .filter(p => !recentSoldIds.has(p.id))
      .map(p => p.id);

    const staleProducts = staleProductIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: staleProductIds } },
          select: { id: true, name: true, stock: true, costPrice: true, category: true },
        })
      : [];

    // Get last sale dates for stale products
    const staleSaleItems = staleProductIds.length > 0
      ? await prisma.saleItem.findMany({
          where: { productId: { in: staleProductIds } },
          select: { productId: true, sale: { select: { createdAt: true } } },
          orderBy: { sale: { createdAt: "desc" } },
        })
      : [];

    const staleLastSaleMap = new Map<number, Date>();
    for (const s of staleSaleItems) {
      if (!staleLastSaleMap.has(s.productId)) {
        staleLastSaleMap.set(s.productId, s.sale.createdAt);
      }
    }

    const sinMovimiento = staleProducts.slice(0, 100).map(p => {
      // TD-018: costPrice es Decimal
      const costPriceNum = toNumOrZero(p.costPrice);
      return {
        id: p.id,
        name: p.name,
        stock: p.stock ?? 0,
        costPrice: costPriceNum,
        valorAtado: (p.stock ?? 0) * costPriceNum,
        category: p.category,
        lastSaleDate: staleLastSaleMap.get(p.id)?.toISOString() ?? null,
      };
    });

    const sinMovimientoValor = sinMovimiento.reduce((sum, p) => sum + p.valorAtado, 0);

    // 4. POR VENCER: batches expiring in next 7 days
    const porVencerBatches = await prisma.batch.findMany({
      where: {
        tenantId,
        expiryDate: { lte: sevenDaysAhead, gte: today },
        quantity: { gt: 0 },
      },
      select: {
        id: true,
        productName: true,
        lote: true,
        expiryDate: true,
        quantity: true,
        productId: true,
      },
      orderBy: { expiryDate: "asc" },
      take: 100,
    });

    const porVencer = porVencerBatches.map(b => ({
      batchId: b.id,
      productName: b.productName,
      lote: b.lote,
      productId: b.productId,
      expiryDate: b.expiryDate.toISOString(),
      quantity: b.quantity,
      daysToExpiry: Math.ceil((b.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    }));

    return NextResponse.json({
      sinStock,
      stockCritico,
      sinMovimiento,
      porVencer,
      resumen: {
        sinStockCount: sinStock.length,
        criticoCount: stockCritico.length,
        sinMovimientoCount: sinMovimiento.length,
        sinMovimientoValor: Math.round(sinMovimientoValor * 100) / 100,
        porVencerCount: porVencer.length,
      },
    });
  } catch (e) {
    logger.error("[stock-alerts/GET]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al obtener alertas" }, { status: 500 });
  }
}
