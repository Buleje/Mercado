import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { productosBajoMinimo, reponerPorNegocio } from "@/lib/compras/reposicion-automatica";

/**
 * GET /api/cron/auto-reorder-check
 *
 * Productos bajo su mínimo, el último proveedor de cada uno y un borrador de
 * orden por proveedor — negocio por negocio.
 *
 * Aislamiento (10-10): antes leía sólo `"main"` (escrito a mano) y buscaba el
 * proveedor en el historial de TODOS los negocios. Ahora comparte el camino de
 * `/api/reorder-alerts` (`reponerPorNegocio`): historial, proveedor y
 * productos del mismo `tenantId`, y sin duplicar el borrador que ya existe
 * (las dos rutas corren el mismo día; la segunda no crea nada nuevo).
 *
 * vercel.json: "7 6 * * *" · Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("auto-reorder-check", async () => {
      const productos = await productosBajoMinimo();
      if (productos.length === 0) {
        logger.info("[cron/auto-reorder-check] Sin productos para reorden");
        return { ok: true, total: 0, sugerencias: [], sinProveedor: [], draftOCs: [], generadoA: new Date().toISOString() };
      }

      const porNegocio = await reponerPorNegocio(productos, { crearBorradores: true, origen: "auto-reorder-check" });
      const todos = porNegocio.flatMap((n) => n.productos);
      const sugerencias = todos
        .filter((p) => p.supplierId)
        .map((p) => ({
          tenantId: p.tenantId,
          productoId: p.id,
          nombre: p.name,
          categoria: p.category,
          unidad: p.unit,
          stockActual: p.stock,
          stockMinimo: p.stockMin,
          stockMaximo: p.stockMax,
          cantidadSugerida: p.suggestedQty,
          proveedor: { id: p.supplierId as string, nombre: p.supplier ?? "" },
        }));
      const sinProveedor = todos
        .filter((p) => !p.supplierId)
        .map((p) => ({ tenantId: p.tenantId, productoId: p.id, nombre: p.name, stockActual: p.stock, stockMinimo: p.stockMin }));
      const draftOCs = porNegocio.flatMap((n) =>
        n.borradores
          .filter((b) => b.accion !== "sin-cambios")
          .map((b) => ({ tenantId: n.tenantId, ...b })),
      );

      logger.info("[cron/auto-reorder-check] Sugerencias de reorden", {
        conProveedor: sugerencias.length,
        sinProveedor: sinProveedor.length,
        borradores: draftOCs.length,
      });
      for (const b of draftOCs) {
        logActivity(
          "auto-reorder-draft-oc",
          "PurchaseOrder",
          `OC borrador ${b.accion} para ${b.supplierName}: ${b.lineas} línea(s), S/ ${b.total.toFixed(2)}`,
          b.purchaseOrderId ?? undefined,
          "cron",
          undefined,
          b.tenantId, // sin él la auditoría quedaba en «__unknown__» (security 10-10)
        ).catch((err) =>
          logger.warn("[cron/auto-reorder-check] draft-oc activity log failed", { error: String(err) }),
        );
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
