import "server-only";
import { prisma } from "@/lib/prisma";
import { OrdersDB } from "@/lib/db/orders.db";

/**
 * Read-only paginated queries para Order — separadas de orders.db.ts (zona
 * de peligro: state machine + idempotency). Este módulo NO muta nada,
 * solo lee con skip/take Prisma-side.
 *
 * Audit 2026-05-17 B-P0-4: el route antiguo hacía
 * `getAllFiltered() + orders.slice(start, start + limit)` cargando TODA
 * la tabla en RAM (50MB+ con >50k órdenes → OOM en Vercel Fluid 512MB).
 * Ahora Prisma traduce skip/take a `OFFSET ... LIMIT ...` y memoria es
 * O(limit), no O(total).
 */

// Reusamos el mapeo desde orders.db.ts via getById (mismo shape).
// Para evitar duplicar mapOrder, traemos rows + transformamos via OrdersDB.getById
// NO — eso sería N+1. Mejor: el shape DbOrder se construye importando el
// helper. Como mapOrder no se exporta, usamos una helper local.

// Normalize phone (idéntico al patrón en orders.db.ts).
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type PaginatedOrders = {
  items: Array<{
    id: string;
    customerName: string;
    customerPhone: string | null;
    total: number;
    status: string;
    paymentMethod: string | null;
    createdAt: string;
    updatedAt: string;
    items: Array<{
      productId: number | null;
      name: string;
      price: number;
      quantity: number;
      unit: string;
    }>;
  }>;
  total: number;
};

export const OrdersPaginatedDB = {
  /**
   * Offset pagination DB-side. Equivalente a OrdersDB.getAllFiltered + slice,
   * pero memoria O(limit) en vez de O(total).
   */
  async listFiltered(opts: {
    status?: string;
    since?: string;
    phone?: string;
    tenantId: string;
    page: number;
    limit: number;
  }): Promise<PaginatedOrders> {
    const where: Record<string, unknown> = { tenantId: opts.tenantId };
    if (opts.status) {
      const statuses = opts.status.split(",").map((s) => s.trim());
      where.status = { in: statuses };
    }
    if (opts.since) {
      const since = new Date(opts.since);
      if (!isNaN(since.getTime())) where.createdAt = { gte: since };
    }
    if (opts.phone) where.customerPhone = normalizePhone(opts.phone);

    const skip = Math.max(0, (opts.page - 1) * opts.limit);

    const [rows, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: opts.limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        total: Number(r.total),
        status: r.status as string,
        paymentMethod: r.paymentMethod,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        items: r.items.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: Number(i.price),
          quantity: i.quantity,
          unit: i.unit,
        })),
      })),
      total,
    };
  },
};

// Re-export por compat — para que callers que ya importan OrdersDB sigan funcionando.
export { OrdersDB };
