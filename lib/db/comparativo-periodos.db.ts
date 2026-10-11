import "server-only";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { toNumOrZero } from "@/lib/decimal-utils";
import { ESTADOS_PEDIDO_QUE_ENTRAN, rangoDelMesLima } from "@/lib/finance/ingresos-del-periodo";
import type { AgregadosDelMes, AgregadosDelRango } from "@/lib/finance/comparativo-periodos";

/**
 * ComparativoPeriodosDB — los agregados de UN mes de Lima para «Reportes
 * comparativos» de Mi Plata. Sólo lee; `tenantId` SIEMPRE 1er parámetro.
 *
 * Qué entra como venta: la regla de `ingresos-del-periodo.ts` (toda venta del
 * POS + los pedidos concretados, sin borrados). El costo se suma sólo de las
 * filas que lo guardaron (`totalCogs`), junto con SU total: así el margen no
 * se infla con ventas sin costo. El fiado dado deja afuera los CANCELADO
 * (perdonados o anulados: no son crédito que se dio y se espera cobrar).
 */
export const ComparativoPeriodosDB = {
  async delMes(tenantId: string, mes: string): Promise<AgregadosDelMes> {
    return ComparativoPeriodosDB.delRango(tenantId, rangoDelMesLima(mes));
  },

  /** Los mismos agregados de `delMes` para cualquier `[start, end)` (instantes UTC). */
  async delRango(tenantId: string, rango: { start: Date; end: Date }): Promise<AgregadosDelMes> {
    const enMes = { gte: rango.start, lt: rango.end };
    const pedidosQueEntran = {
      tenantId,
      deletedAt: null,
      status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] },
      createdAt: enMes,
    };
    const [pos, posConCosto, ped, pedConCosto, clientesNuevos, fiado] = await withDbRetry(() =>
      Promise.all([
        prisma.sale.aggregate({
          where: { tenantId, createdAt: enMes },
          _sum: { total: true },
          _count: { id: true },
        }),
        prisma.sale.aggregate({
          where: { tenantId, createdAt: enMes, totalCogs: { not: null } },
          _sum: { total: true, totalCogs: true },
        }),
        prisma.order.aggregate({
          where: pedidosQueEntran,
          _sum: { total: true },
          _count: { id: true },
        }),
        prisma.order.aggregate({
          where: { ...pedidosQueEntran, totalCogs: { not: null } },
          _sum: { total: true, totalCogs: true },
        }),
        prisma.customer.count({ where: { tenantId, createdAt: enMes } }),
        prisma.fiado.aggregate({
          where: { tenantId, createdAt: enMes, status: { not: "CANCELADO" } },
          _sum: { total: true },
          _count: { id: true },
        }),
      ]),
    );
    return {
      ventasPos: {
        total: toNumOrZero(pos._sum.total),
        cuantas: pos._count.id,
        conCosto: toNumOrZero(posConCosto._sum.total),
        costo: toNumOrZero(posConCosto._sum.totalCogs),
      },
      pedidos: {
        total: toNumOrZero(ped._sum.total),
        cuantos: ped._count.id,
        conCosto: toNumOrZero(pedConCosto._sum.total),
        costo: toNumOrZero(pedConCosto._sum.totalCogs),
      },
      clientesNuevos,
      fiado: { total: toNumOrZero(fiado._sum.total), cuantos: fiado._count.id },
    };
  },

  /**
   * Comparar períodos: lo de `delRango` + clientes únicos (teléfonos
   * distintos entre ventas del POS y pedidos que entran; la venta anónima no
   * cuenta) + devoluciones registradas en el rango.
   */
  async delRangoCompleto(
    tenantId: string,
    rango: { start: Date; end: Date },
  ): Promise<AgregadosDelRango> {
    const enRango = { gte: rango.start, lt: rango.end };
    const [base, telVentas, telPedidos, devoluciones] = await Promise.all([
      ComparativoPeriodosDB.delRango(tenantId, rango),
      withDbRetry(() =>
        prisma.sale.findMany({
          where: { tenantId, createdAt: enRango, customerPhone: { not: null } },
          select: { customerPhone: true },
          distinct: ["customerPhone"],
        }),
      ),
      withDbRetry(() =>
        prisma.order.findMany({
          where: {
            tenantId,
            deletedAt: null,
            status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] },
            createdAt: enRango,
            customerPhone: { not: null },
          },
          select: { customerPhone: true },
          distinct: ["customerPhone"],
        }),
      ),
      withDbRetry(() =>
        prisma.return.aggregate({
          where: { tenantId, createdAt: enRango },
          _sum: { total: true },
          _count: { id: true },
        }),
      ),
    ]);
    const telefonos = new Set<string>();
    for (const f of [...telVentas, ...telPedidos])
      if (f.customerPhone) telefonos.add(f.customerPhone);
    return {
      ...base,
      clientesUnicos: telefonos.size,
      devoluciones: {
        total: toNumOrZero(devoluciones._sum.total),
        cuantas: devoluciones._count.id,
      },
    };
  },
};
