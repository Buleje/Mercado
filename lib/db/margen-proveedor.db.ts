import "server-only";

/**
 * Cuánto ganas con cada proveedor (ver `lib/analytics/margen-por-proveedor.ts`).
 * Lee las compras recibidas (para saber a quién le compraste cada producto la
 * última vez) y las líneas vendidas del período con la misma consulta que
 * Rentabilidad por producto. Sólo lectura.
 */
import { prisma } from "@/lib/prisma";
import { AnalyticsRentabilidadDB } from "./analytics-rentabilidad.db";
import { margenPorProveedor, ultimaCompraPorProducto, type MargenPorProveedor, type UltimaCompra } from "@/lib/analytics/margen-por-proveedor";

/** Las órdenes que LLEGARON: la pendiente puede no llegar nunca y la anulada no cuenta. */
const LLEGARON = ["recibido", "parcial"] as const;

export const MargenProveedorDB = {
  async ultimaCompraPorProducto(tenantId: string): Promise<Map<number, UltimaCompra>> {
    const rows = await prisma.purchaseItem.findMany({
      where: { purchaseOrder: { tenantId, status: { in: [...LLEGARON] } } },
      select: {
        productId: true,
        purchaseOrder: { select: { supplierId: true, supplierName: true, receivedDate: true, createdAt: true, supplier: { select: { name: true } } } },
      },
      take: 50_000,
    });
    return ultimaCompraPorProducto(
      rows.map((r) => ({
        productId: r.productId,
        supplierId: r.purchaseOrder.supplierId,
        // El nombre de hoy del proveedor; el de la orden si ya no está en el padrón.
        proveedor: r.purchaseOrder.supplier.name || r.purchaseOrder.supplierName,
        fecha: r.purchaseOrder.receivedDate ?? r.purchaseOrder.createdAt,
      })),
    );
  },

  async delPeriodo(tenantId: string, since: Date): Promise<MargenPorProveedor> {
    const [ventas, pedidos, ultima] = await Promise.all([
      AnalyticsRentabilidadDB.getSaleLinesByProduct(tenantId, since),
      AnalyticsRentabilidadDB.getOrderLinesByProduct(tenantId, since),
      MargenProveedorDB.ultimaCompraPorProducto(tenantId),
    ]);
    return margenPorProveedor([...ventas, ...pedidos], ultima);
  },
};
