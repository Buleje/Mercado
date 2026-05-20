import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { InventoryStockAlertsDB } from "@/lib/db/inventory-stock-alerts.db";
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

    // Audit project-wide 2026-05-19: migrado a InventoryStockAlertsDB.
    // 1+2+4 run in parallel — they share no input dependency.
    // 3 (sinMovimiento) depends on allActiveProducts so stays sequential after.
    const [sinStockProducts, allActiveProducts, porVencerBatches] = await Promise.all([
      InventoryStockAlertsDB.listOutOfStockProducts(tenantId, 100),
      InventoryStockAlertsDB.listActiveProductsWithStock(tenantId),
      InventoryStockAlertsDB.listExpiringBatches(tenantId, today, sevenDaysAhead, 100),
    ]);

    // Get last sale date for each sin-stock product
    const sinStockIds = sinStockProducts.map(p => p.id);
    const lastSales = await InventoryStockAlertsDB.lastSalesForProducts(tenantId, sinStockIds);

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

    const recentSaleItems = await InventoryStockAlertsDB.recentSoldProductIds(
      tenantId,
      productIdsWithStock,
      thirtyDaysAgo,
    );

    const recentSoldIds = new Set(recentSaleItems.map(s => s.productId));

    // Get full product info including costPrice for stale products
    const staleProductIds = productsWithStock
      .filter(p => !recentSoldIds.has(p.id))
      .map(p => p.id);

    const staleProducts = await InventoryStockAlertsDB.productsWithCost(tenantId, staleProductIds);

    // Get last sale dates for stale products
    const staleSaleItems = await InventoryStockAlertsDB.lastSalesForProducts(tenantId, staleProductIds);

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

    // 4. POR VENCER — already fetched in Promise.all above
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
