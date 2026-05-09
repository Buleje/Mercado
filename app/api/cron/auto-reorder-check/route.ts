import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { ProductsDB } from "@/lib/db/products.db";
import { PurchasesDB } from "@/lib/db/purchases.db";
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
      ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

      // ── #20: Create draft OCs grouped by preferred supplier ───────────
      const draftOCs: { poId: string; supplierId: string; supplierName: string; itemCount: number; total: number }[] = [];

      if (sugerencias.length > 0) {
        // Group suggestions by supplier
        const bySupplier = new Map<
          string,
          { supplierName: string; items: typeof sugerencias }
        >();

        for (const s of sugerencias) {
          const key = s.proveedor.id;
          if (!bySupplier.has(key)) {
            bySupplier.set(key, { supplierName: s.proveedor.nombre, items: [] });
          }
          bySupplier.get(key)!.items.push(s);
        }

        for (const [supplierId, { supplierName, items }] of bySupplier.entries()) {
          const total = items.reduce((sum, i) => {
            const unitCost = (i as Record<string, unknown>).costPrice as number | undefined ?? 0;
            return sum + i.cantidadSugerida * unitCost;
          }, 0);

          const poId = `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          const now = new Date().toISOString();

          try {
            await PurchasesDB.add({
              id: poId,
              supplierId,
              supplierName,
              total: Math.round(total * 100) / 100,
              status: "pendiente",
              notes: `OC sugerida auto-generada por cron auto-reorder — ${new Date().toLocaleDateString("es-PE")}`,
              items: items.map((i) => ({
                productId: i.productoId,
                name: i.nombre,
                quantity: i.cantidadSugerida,
                unitCost: 0, // Cost unknown at suggestion level
                unit: i.unidad,
              })),
              createdAt: now,
              updatedAt: now,
            }, "main");

            draftOCs.push({
              poId,
              supplierId,
              supplierName,
              itemCount: items.length,
              total: Math.round(total * 100) / 100,
            });

            // Fire-and-forget: log activity
            logActivity(
              "auto-reorder-draft-oc",
              "PurchaseOrder",
              `OC draft creada para ${supplierName}: ${items.length} producto(s)`,
              poId,
              "cron",
            ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
          } catch (ocErr) {
            logger.warn("[cron/auto-reorder-check] Error creating draft OC", {
              supplierId,
              error: ocErr instanceof Error ? ocErr.message : String(ocErr),
            });
          }
        }

        logger.info("[cron/auto-reorder-check] Draft OCs created", {
          count: draftOCs.length,
        });
      }

      return {
        ok: true,
        total: sugerencias.length,
        sugerencias,
        sinProveedor,
        draftOCs,
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
