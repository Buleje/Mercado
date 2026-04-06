export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { ProductsDB } from "@/lib/db/products.db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/auto-reorder-check
 *
 * Busca productos con stock < stockMin y, para cada uno,
 * intenta encontrar el proveedor del último pedido de compra
 * que incluyó ese producto. Genera sugerencias de compra.
 *
 * Sugerencia vercel.json: "0 9 * * 1-5" (09:00 días hábiles)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("auto-reorder-check", async () => {
      const allProducts = await ProductsDB.getAll("main");

      // Filtrar productos activos con stock bajo y mínimo definido
      const productosStockBajo = allProducts.filter((p) => {
        if (!p.active || p.stock == null || p.stockMin == null) return false;
        return p.stock < p.stockMin;
      });

      if (productosStockBajo.length === 0) {
        logger.info("[cron/auto-reorder-check] Sin productos para reorden");
        return { ok: true, total: 0, sugerencias: [], generadoA: new Date().toISOString() };
      }

      // Buscar el último proveedor de cada producto vía PurchaseItem → PurchaseOrder
      const productIds = productosStockBajo.map((p) => p.id);

      const lastPurchases = await prisma.purchaseItem.findMany({
        where: { productId: { in: productIds } },
        orderBy: { id: "desc" },
        select: {
          productId: true,
          purchaseOrder: {
            select: {
              supplierId: true,
              supplierName: true,
            },
          },
        },
      });

      // Mapa productId → proveedor (primera coincidencia = más reciente)
      const supplierMap = new Map<
        number,
        { id: string; nombre: string }
      >();
      for (const item of lastPurchases) {
        if (!supplierMap.has(item.productId)) {
          supplierMap.set(item.productId, {
            id: item.purchaseOrder.supplierId,
            nombre: item.purchaseOrder.supplierName,
          });
        }
      }

      // Construir sugerencias solo para productos con proveedor identificado
      const sugerencias = productosStockBajo
        .filter((p) => supplierMap.has(p.id))
        .map((p) => {
          const stock = p.stock as number;
          const min = p.stockMin as number;
          const max = p.stockMax ?? min * 2;
          // Cantidad para llegar al máximo (o al doble del mínimo)
          const cantidadSugerida = Math.max(max - stock, min);

          return {
            productoId: p.id,
            nombre: p.name,
            categoria: p.category,
            unidad: p.unit,
            stockActual: stock,
            stockMinimo: min,
            stockMaximo: max,
            cantidadSugerida,
            proveedor: supplierMap.get(p.id)!,
          };
        });

      // Productos sin proveedor identificado (solo informativo)
      const sinProveedor = productosStockBajo
        .filter((p) => !supplierMap.has(p.id))
        .map((p) => ({ productoId: p.id, nombre: p.name, stockActual: p.stock, stockMinimo: p.stockMin }));

      logger.info("[cron/auto-reorder-check] Sugerencias de reorden generadas", {
        conProveedor: sugerencias.length,
        sinProveedor: sinProveedor.length,
      });

      logActivity(
        "auto-reorder-check",
        "Product",
        `${sugerencias.length} sugerencia(s) de compra generadas por cron (${sinProveedor.length} sin proveedor)`,
        undefined,
        "cron"
      ).catch(() => {});

      return {
        ok: true,
        total: sugerencias.length,
        sugerencias,
        sinProveedor,
        generadoA: new Date().toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/auto-reorder-check] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
