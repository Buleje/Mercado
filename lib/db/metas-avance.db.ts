import "server-only";
/**
 * lib/db/metas-avance.db.ts — lecturas de SÓLO LECTURA para el avance de las
 * metas comerciales (ADR-488). Lo que ninguna clase existente agregaba por
 * rango: pedidos que entran como ingreso, unidades vendidas, clientes nuevos,
 * clientes que vuelven, cierres de caja y compras que esperan recepción.
 *
 * Todas las ventanas son `[gte, lt)` en instantes (día de Lima ya resuelto por
 * `ventanaDeMeta`). Nunca escribe; la caché vive un piso arriba
 * (`lib/metas/avance/index.ts`, `getOrSet` por meta).
 */
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { ESTADOS_PEDIDO_QUE_ENTRAN } from "@/lib/finance/ingresos-del-periodo";

/** Pedidos que cuentan como venta: no borrados y en un estado que ya es ingreso (confirmado/en camino/entregado). */
function wherePedidos(tenantId: string, gte: Date, lt: Date, source?: string) {
  return {
    tenantId,
    deletedAt: null,
    status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] },
    createdAt: { gte, lt },
    ...(source ? { source } : {}),
  };
}

export interface CierreDeCaja {
  expectedAmount: number | null;
  closingAmount: number | null;
  difference: number | null;
  notes: string | null;
  closedAt: string | null;
}

export const MetasAvanceDB = {
  /** Cantidad y total de los pedidos que entran como venta. `source` = «marketplace» para los del marketplace. */
  async pedidosDelRango(tenantId: string, gte: Date, lt: Date, source?: string): Promise<{ n: number; total: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.order.aggregate({
      where: wherePedidos(tenantId, gte, lt, source),
      _sum: { total: true },
      _count: { id: true },
    });
    return { n: r._count.id, total: toNumOrZero(r._sum.total) };
  },

  /** Unidades que salieron: ítems de las ventas del POS + ítems de los pedidos que entran. */
  async unidadesVendidas(tenantId: string, gte: Date, lt: Date): Promise<{ ventas: number; pedidos: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const [ventas, pedidos] = await Promise.all([
      prisma.saleItem.aggregate({ where: { sale: { tenantId, createdAt: { gte, lt } } }, _sum: { quantity: true } }),
      prisma.orderItem.aggregate({ where: { order: wherePedidos(tenantId, gte, lt) }, _sum: { quantity: true } }),
    ]);
    return { ventas: ventas._sum.quantity ?? 0, pedidos: pedidos._sum.quantity ?? 0 };
  },

  /** Clientes que se dieron de alta en la ventana. */
  async clientesNuevos(tenantId: string, gte: Date, lt: Date): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.customer.count({ where: { tenantId, createdAt: { gte, lt } } });
  },

  /**
   * Teléfonos que compraron en la ventana (`activos`) y cuántos de ellos
   * compraron 2 veces o más (`volvieron`). Las ventas sin teléfono no se pueden
   * seguir: se cuentan aparte en `sinTelefono`.
   */
  async retencion(tenantId: string, gte: Date, lt: Date): Promise<{ activos: number; volvieron: number; sinTelefono: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const [grupos, sinTelefono] = await Promise.all([
      prisma.sale.groupBy({
        by: ["customerPhone"],
        where: { tenantId, createdAt: { gte, lt }, customerPhone: { not: null } },
        _count: { _all: true },
      }),
      prisma.sale.count({ where: { tenantId, createdAt: { gte, lt }, OR: [{ customerPhone: null }, { customerPhone: "" }] } }),
    ]);
    const conTelefono = grupos.filter((g) => (g.customerPhone ?? "").trim() !== "");
    return {
      activos: conTelefono.length,
      volvieron: conTelefono.filter((g) => g._count._all >= 2).length,
      sinTelefono,
    };
  },

  /**
   * Cajas CERRADAS en la ventana, con lo necesario para `veredictoArqueo`. Al
   * cerrar, `close()` congela el esperado y la diferencia, así que no hace falta
   * `CashRegistersDB.getAll` (toda la historia + 100 movimientos por caja).
   */
  async cierresDelRango(tenantId: string, gte: Date, lt: Date): Promise<CierreDeCaja[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.cashRegister.findMany({
      where: { tenantId, status: "cerrada", closedAt: { gte, lt } },
      select: { expectedAmount: true, closingAmount: true, difference: true, notes: true, closedAt: true },
    });
    return rows.map((r) => ({
      expectedAmount: r.expectedAmount == null ? null : toNumOrZero(r.expectedAmount),
      closingAmount: r.closingAmount == null ? null : toNumOrZero(r.closingAmount),
      difference: r.difference == null ? null : toNumOrZero(r.difference),
      notes: r.notes,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    }));
  },

  /**
   * Órdenes de compra que todavía no llegaron, con la misma fecha efectiva que
   * usa Plata (`deliveryDate`, o `createdAt` si no tiene): no cuentan hasta
   * recibirlas, pero el ⓘ lo dice.
   */
  async comprasPendientes(tenantId: string, gte: Date, lt: Date): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.purchaseOrder.count({
      where: {
        tenantId,
        status: "pendiente",
        OR: [{ deliveryDate: { gte, lt } }, { deliveryDate: null, createdAt: { gte, lt } }],
      },
    });
  },
};
