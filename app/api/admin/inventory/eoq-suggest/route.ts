import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ProductsDB } from "@/lib/db/products.db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/inventory/eoq-suggest
 *
 * Calcula Economic Order Quantity (EOQ) para cada SKU activo con demanda:
 *
 *   EOQ = √(2 × D × S / H)
 *
 * Donde:
 *   D = demanda anual en unidades
 *   S = costo fijo por pedido (default S/ 10)
 *   H = costo de mantener 1 unidad/año (default 20% del costPrice)
 *
 * Query params opcionales:
 *   - orderCost: S (default 10)
 *   - holdingRate: porcentaje H/costPrice (default 0.2)
 *   - topN: limitar resultados (default 30)
 *
 * Ordena por urgencia = daysRemaining ASC (los que se agotan primero primero).
 *
 * Autorización: Bearer admin session.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req, ["owner", "admin", "manager"]);
    if (admin instanceof NextResponse) return admin;

    const url = new URL(req.url);
    const tenantId = req.headers.get("x-tenant-id") || "main";
    const orderCost = Number(url.searchParams.get("orderCost") ?? 10);
    const holdingRate = Number(url.searchParams.get("holdingRate") ?? 0.2);
    const topN = Math.min(100, Number(url.searchParams.get("topN") ?? 30));

    const allProducts = await ProductsDB.getAll(tenantId);
    const active = allProducts.filter((p) => p.active);

    // Demanda últimos 365 días
    const last365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const productIds = active.map((p) => p.id);
    const [orderItems, saleItems] = await Promise.all([
      prisma.orderItem.findMany({
        where: {
          productId: { in: productIds },
          order: { createdAt: { gte: last365 }, status: { not: "cancelado" as never } },
        },
        select: { productId: true, quantity: true },
      }),
      prisma.saleItem.findMany({
        where: {
          productId: { in: productIds },
          sale: { createdAt: { gte: last365 } },
        },
        select: { productId: true, quantity: true },
      }),
    ]);

    const demandMap = new Map<number | string, number>();
    orderItems.forEach((i) => {
      if (i.productId == null) return;
      const cur = demandMap.get(i.productId) ?? 0;
      demandMap.set(i.productId, cur + i.quantity);
    });
    saleItems.forEach((i) => {
      if (i.productId == null) return;
      const cur = demandMap.get(i.productId) ?? 0;
      demandMap.set(i.productId, cur + i.quantity);
    });

    const suggestions = active
      .map((p) => {
        const D = demandMap.get(p.id) ?? 0;
        if (D <= 0) return null;
        const costPrice = p.costPrice ?? p.price * 0.7;
        const H = Math.max(0.01, costPrice * holdingRate);
        const eoq = Math.round(Math.sqrt((2 * D * orderCost) / H));
        const dailyRate = D / 365;
        const daysRemaining =
          dailyRate > 0 ? Math.round((p.stock ?? 0) / dailyRate) : 999;
        const reorderPoint = Math.ceil(dailyRate * 7); // 7 días lead time
        const cyclesPerYear = eoq > 0 ? Math.round(D / eoq) : 0;
        const needsReorder = (p.stock ?? 0) <= reorderPoint;
        return {
          productId: p.id,
          name: p.name,
          stockActual: p.stock ?? 0,
          demandaAnual: D,
          dailyRate: Math.round(dailyRate * 10) / 10,
          daysRemaining,
          eoq,
          reorderPoint,
          cyclesPerYear,
          needsReorder,
          costPrice: Math.round(costPrice * 100) / 100,
          montoSugerido: Math.round(eoq * costPrice),
          category: p.category ?? "otros",
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => {
        // Urgencia: needsReorder primero, luego menor daysRemaining
        if (a.needsReorder !== b.needsReorder) return a.needsReorder ? -1 : 1;
        return a.daysRemaining - b.daysRemaining;
      })
      .slice(0, topN);

    const totalSuggestedAmount = suggestions.reduce((s, r) => s + r.montoSugerido, 0);
    const urgent = suggestions.filter((s) => s.needsReorder).length;

    logger.info("[inventory/eoq-suggest] calculated", {
      total: suggestions.length,
      urgent,
      totalAmount: totalSuggestedAmount,
      tenantId,
    });

    return NextResponse.json({
      ok: true,
      params: { orderCost, holdingRate, topN },
      summary: {
        total: suggestions.length,
        urgent,
        totalSuggestedAmount,
        generatedAt: new Date().toISOString(),
      },
      suggestions,
    });
  } catch (err) {
    logger.error("[inventory/eoq-suggest] failed", { error: String(err) });
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
