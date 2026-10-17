import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import {
  ESTADOS_ABIERTOS,
  planearBorradorDeReposicion,
  type LineaSugerida,
} from "@/lib/compras/borrador-reposicion";

/**
 * ReorderAlertsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/reorder-alerts.
 * Borradores de órdenes de compra cuando un producto baja de su mínimo.
 *
 * Aislamiento (10-10): sólo `listProductsWithMinStock` recorre todos los
 * negocios (cron de plataforma, ADR-082). Todo lo demás recibe `tenantId`
 * primero y lo exige en el WHERE del proveedor, de los productos y de las
 * órdenes. Antes el proveedor se buscaba por NOMBRE en toda la base: 34
 * órdenes de `main` quedaron apuntando a un proveedor y a productos de `demo`.
 */

export type ResultadoBorrador = {
  accion: "creada" | "actualizada" | "sin-cambios";
  purchaseOrderId: string | null;
  supplierId: string;
  supplierName: string;
  lineas: number;
  total: number;
};

export const ReorderAlertsDB = {
  /**
   * Productos activos con stock conocido y, si tienen mínimo propio, debajo
   * de él — base del filtro "low stock" hecho en memoria por el caller.
   *
   * @cross-tenant intentional — cron platform-wide; el caller agrupa por `tenantId`.
   */
  async listProductsWithMinStock() {
    // Un solo stock mínimo (09-10): también los que no tienen mínimo propio
    // (el caller los mide contra el global de su negocio con `enStockBajo`).
    return prisma.product.findMany({
      where: {
        active: true,
        deletedAt: null,
        stock: { not: null },
        // Un servicio no se repone por saldo (Compras C01/O07, 17-10).
        NOT: { type: "service" },
        OR: [
          { stockMin: { not: null }, stock: { lte: prisma.product.fields.stockMin } },
          { stockMin: null },
        ],
      },
      select: {
        id: true, name: true, stock: true, stockMin: true, stockMax: true,
        category: true, unit: true, tenantId: true, costPrice: true,
      },
    });
  },

  /**
   * Último proveedor de cada producto según el historial de compras DEL MISMO
   * negocio: la línea, su orden y el proveedor de esa orden tienen que ser del
   * `tenantId`. Una orden cruzada vieja no vuelve a contagiar al cron.
   */
  async ultimoProveedorPorProducto(
    tenantId: string,
    productIds: number[],
  ): Promise<Map<number, { supplierId: string; supplierName: string }>> {
    const mapa = new Map<number, { supplierId: string; supplierName: string }>();
    if (productIds.length === 0) return mapa;
    const filas = await prisma.purchaseItem.findMany({
      where: {
        productId: { in: productIds },
        product: { tenantId },
        purchaseOrder: { tenantId, supplier: { tenantId } },
      },
      select: {
        productId: true,
        purchaseOrder: { select: { supplierId: true, supplier: { select: { name: true } } } },
      },
      orderBy: { purchaseOrder: { createdAt: "desc" } },
    });
    for (const f of filas) {
      if (mapa.has(f.productId)) continue;
      mapa.set(f.productId, { supplierId: f.purchaseOrder.supplierId, supplierName: f.purchaseOrder.supplier.name });
    }
    return mapa;
  },

  /**
   * Repone el borrador automático de un proveedor SIN duplicar:
   *   · candado por (negocio, proveedor) — dos corridas del cron a la vez
   *     (hoy corren dos a las 06:34 y 06:38) no crean dos órdenes;
   *   · proveedor y productos se releen con `tenantId` en el WHERE: lo ajeno
   *     no entra, aunque el caller lo mande;
   *   · el costo de cada línea es el `costPrice` del producto del MISMO negocio
   *     y el total, la suma de las líneas (`planearBorradorDeReposicion`);
   *   · estado `auto_generated`: es una sugerencia que el dueño aprueba.
   */
  async reponerBorrador(
    tenantId: string,
    data: { supplierId: string; nuevoId: string; notes: string; sugeridas: Array<{ productId: number; quantity: number }> },
  ): Promise<ResultadoBorrador> {
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
        `reorden-auto:${tenantId}:${data.supplierId}`,
      );
      const proveedor = await tx.supplier.findFirst({
        where: { id: data.supplierId, tenantId },
        select: { id: true, name: true },
      });
      const vacio: ResultadoBorrador = {
        accion: "sin-cambios", purchaseOrderId: null, supplierId: data.supplierId, supplierName: "", lineas: 0, total: 0,
      };
      if (!proveedor) return vacio;

      const productos = await tx.product.findMany({
        where: { tenantId, id: { in: data.sugeridas.map((s) => s.productId) }, deletedAt: null },
        select: { id: true, name: true, unit: true, costPrice: true },
      });
      const porId = new Map(productos.map((p) => [p.id, p]));
      const sugeridas: LineaSugerida[] = [];
      for (const s of data.sugeridas) {
        const p = porId.get(s.productId);
        if (!p) continue;
        sugeridas.push({
          productId: p.id,
          name: p.name,
          quantity: Math.max(1, Math.ceil(s.quantity)),
          unitCost: toNumOrZero(p.costPrice),
          unit: p.unit,
        });
      }
      if (sugeridas.length === 0) return { ...vacio, supplierName: proveedor.name };

      const abiertas = await tx.purchaseOrder.findMany({
        where: { tenantId, supplierId: proveedor.id, status: { in: [...ESTADOS_ABIERTOS] } },
        select: { id: true, status: true, items: { select: { id: true, productId: true, quantity: true, unitCost: true } } },
        orderBy: { createdAt: "desc" },
      });
      const plan = planearBorradorDeReposicion({
        abiertas: abiertas.map((o) => ({
          id: o.id,
          status: o.status,
          items: o.items.map((i) => ({ ...i, unitCost: toNumOrZero(i.unitCost) })),
        })),
        sugeridas,
      });

      if (plan.accion === "nada") {
        return { ...vacio, purchaseOrderId: plan.purchaseOrderId, supplierName: proveedor.name };
      }
      if (plan.accion === "crear") {
        await tx.purchaseOrder.create({
          data: {
            id: data.nuevoId,
            tenantId,
            supplierId: proveedor.id,
            supplierName: proveedor.name,
            total: plan.total,
            status: "auto_generated",
            notes: data.notes,
            items: { create: plan.lineas },
          },
        });
        return {
          accion: "creada", purchaseOrderId: data.nuevoId, supplierId: proveedor.id,
          supplierName: proveedor.name, lineas: plan.lineas.length, total: plan.total,
        } satisfies ResultadoBorrador;
      }
      for (const c of plan.cambios) {
        await tx.purchaseItem.updateMany({
          where: { id: c.itemId, purchaseOrderId: plan.purchaseOrderId, purchaseOrder: { tenantId } },
          data: { quantity: c.quantity, unitCost: c.unitCost },
        });
      }
      if (plan.nuevas.length > 0) {
        await tx.purchaseItem.createMany({
          data: plan.nuevas.map((l) => ({ ...l, purchaseOrderId: plan.purchaseOrderId })),
        });
      }
      await tx.purchaseOrder.updateMany({
        where: { id: plan.purchaseOrderId, tenantId, status: "auto_generated" },
        data: { total: plan.total },
      });
      return {
        accion: "actualizada", purchaseOrderId: plan.purchaseOrderId, supplierId: proveedor.id,
        supplierName: proveedor.name, lineas: plan.cambios.length + plan.nuevas.length, total: plan.total,
      } satisfies ResultadoBorrador;
    }, { timeout: 15_000, maxWait: 5_000 });

    if (resultado.accion !== "sin-cambios") invalidateAdminCache.afterPurchase(tenantId);
    return resultado;
  },
};
