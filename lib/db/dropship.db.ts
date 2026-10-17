import "server-only";
import { prisma } from "@/lib/prisma";
import { withRlsTx } from "@/lib/prisma-rls";

/**
 * DropshipDB (ADR-298)
 *
 * Fulfillment automático al proveedor para tiendas dropshipping.
 * Cuando entra un pedido pagado en una tienda con `dropshipEnabled`, se agrupan
 * los OrderItem cuyo Product.isDropship por proveedor y se crea un
 * DropshipFulfillment por proveedor (el proveedor despacha directo al cliente).
 *
 * tenantId 1er parámetro siempre. Sin fallback "main".
 */

export interface DropshipItemSnapshot {
  productId: number | null;
  name: string;
  qty: number;
  unitCost: number;
  supplierSku: string | null;
}

interface StatusPatch {
  status?: string;
  supplierOrderRef?: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  notifiedAt?: Date;
}

interface LinkPatch {
  isDropship?: boolean;
  dropshipSupplierId?: string | null;
  supplierSku?: string | null;
  supplierUrl?: string | null;
}

export const DropshipDB = {
  /** ¿La tienda tiene dropshipping activado? */
  async isEnabled(tenantId: string): Promise<boolean> {
    const s = await prisma.settings.findFirst({
      where: { tenantId },
      select: { dropshipEnabled: true },
    });
    return s?.dropshipEnabled ?? false;
  },

  /** Lista los fulfillments del tenant (más recientes primero). */
  async listFulfillments(tenantId: string) {
    return prisma.dropshipFulfillment.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  },

  /**
   * Actualiza estado/tracking de un fulfillment (scoped por tenant).
   * TD-116: check + update en UNA tx con el UPDATE re-scopeado por tenantId
   * (cierra el TOCTOU entre findFirst y update; el where {id, tenantId} usa
   * extended-where-unique para que el write nunca toque otro tenant).
   */
  async updateStatus(tenantId: string, id: string, patch: StatusPatch) {
    return withRlsTx(tenantId, async (tx) => {
      const existing = await tx.dropshipFulfillment.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) return null;
      return tx.dropshipFulfillment.update({ where: { id, tenantId }, data: patch });
    });
  },

  /** Vincula un producto a un proveedor de dropship (admin). TD-116 (ver arriba). */
  async linkProductSupplier(tenantId: string, productId: number, patch: LinkPatch) {
    return withRlsTx(tenantId, async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true },
      });
      if (!existing) return null;
      return tx.product.update({ where: { id: productId, tenantId }, data: patch });
    });
  },

  /**
   * Crea los DropshipFulfillment de una orden, agrupando ítems dropship por
   * proveedor. IDEMPOTENTE: si la orden ya tiene fulfillments, no duplica.
   * @returns cantidad de fulfillments creados.
   */
  async createFulfillmentsFromOrder(tenantId: string, orderId: string): Promise<number> {
    // Idempotencia SEGURA ante concurrencia (doble-confirm, retry, bulk+single):
    // advisory lock transaccional por orderId que serializa las confirmaciones
    // del MISMO pedido sin depender de un unique constraint en DB. Es pooler-safe
    // (xact-scoped → se libera al COMMIT, compatible con pgBouncer transaction
    // mode). Dos llamadas concurrentes: la 2ª espera el lock y, al entrar, ve
    // already>0 → no duplica. Queries secuenciales: Prisma desaconseja paralelo
    // dentro de una tx interactiva.
    return withRlsTx(tenantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dropship:${orderId}`})::bigint)`;

      const already = await tx.dropshipFulfillment.count({ where: { tenantId, orderId } });
      if (already > 0) return 0;

      const order = await tx.order.findFirst({
        where: { id: orderId, tenantId },
        select: {
          id: true, customerName: true, customerPhone: true,
          customerLocation: true, customerReference: true,
        },
      });
      if (!order) return 0;

      // OrderItem no tiene columna tenantId → scopeado por la relación.
      const items = await tx.orderItem.findMany({
        where: { orderId, order: { tenantId } },
        select: {
          productId: true, name: true, quantity: true, costPrice: true,
          product: { select: { isDropship: true, dropshipSupplierId: true, supplierSku: true, costPrice: true } },
        },
      });

      // Solo ítems cuyo producto es dropship
      const dropItems = items.filter((i) => i.product?.isDropship === true);
      if (dropItems.length === 0) return 0;

      // Agrupar por proveedor (null → "sin-proveedor")
      const groups = new Map<string, typeof dropItems>();
      for (const it of dropItems) {
        const key = it.product?.dropshipSupplierId ?? "__none__";
        const arr = groups.get(key) ?? [];
        arr.push(it);
        groups.set(key, arr);
      }

      let created = 0;
      for (const [supplierKey, groupItems] of groups) {
        const supplierId = supplierKey === "__none__" ? null : supplierKey;
        let costTotal = 0;
        const snapshot: DropshipItemSnapshot[] = groupItems.map((it) => {
          const unitCost = Number(it.costPrice ?? it.product?.costPrice ?? 0);
          costTotal += unitCost * it.quantity;
          return {
            productId: it.productId,
            name: it.name,
            qty: it.quantity,
            unitCost,
            supplierSku: it.product?.supplierSku ?? null,
          };
        });

        await tx.dropshipFulfillment.create({
          data: {
            tenantId,
            orderId: order.id,
            supplierId,
            status: "pending",
            itemsJson: JSON.stringify(snapshot),
            costTotal,
            shipName: order.customerName,
            shipPhone: order.customerPhone ?? null,
            shipLocation: order.customerLocation || null,
            shipReference: order.customerReference || null,
          },
        });
        created++;
      }

      return created;
    });
  },
};
