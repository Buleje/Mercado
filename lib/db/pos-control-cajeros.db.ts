import "server-only";
import { prisma } from "@/lib/prisma";
import { ACCION_QUITADO, ENTIDAD_QUITADO } from "@/lib/pos/quitados";

/**
 * Control del mes por cajero (Turnos › Cajeros): descuentos dados en el POS.
 *
 * Hasta el 11-10 los descuentos se sumaban sólo por turno
 * (`/api/turnos/[id]/summary`). Misma regla que ese resumen: el descuento al
 * TOTAL del ticket (`Sale.descuentoMonto`, donde también va el trueque); el
 * descuento por producto ya baja `SaleItem.price` y no se puede separar.
 *
 * `Sale.cashierId` guarda el `username` (ventas viejas, el id): la clave sale
 * tal cual y la pantalla la cruza con la lista de cajeros.
 */
export const PosControlCajerosDB = {
  async descuentosPorCajero(
    tenantId: string,
    desde: Date,
    hasta: Date,
  ): Promise<{ cajero: string; monto: number; tickets: number }[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.sale.groupBy({
      by: ["cashierId"],
      where: {
        tenantId,
        createdAt: { gte: desde, lt: hasta },
        descuentoMonto: { gt: 0 },
        cashierId: { not: null },
      },
      _sum: { descuentoMonto: true },
      _count: { _all: true },
    });
    return filas
      .filter((f) => !!f.cashierId)
      .map((f) => ({
        cajero: f.cashierId as string,
        monto: Math.round(Number(f._sum.descuentoMonto ?? 0) * 100) / 100,
        tickets: f._count._all,
      }));
  },

  /**
   * Los renglones de productos quitados del ticket en el rango, del más nuevo
   * al más viejo (`ActivityLog`, ver `lib/pos/quitados.ts`). Con `usuario`,
   * sólo los de ese cajero. Tope de 2.000: una bodega no llega en un mes.
   */
  async quitadosDelMes(
    tenantId: string,
    desde: Date,
    hasta: Date,
    usuario?: string,
  ): Promise<{ id: string; user: string; createdAt: Date; detail: string }[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.activityLog.findMany({
      where: {
        tenantId,
        entity: ENTIDAD_QUITADO,
        action: ACCION_QUITADO,
        createdAt: { gte: desde, lt: hasta },
        ...(usuario ? { user: usuario } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { id: true, user: true, createdAt: true, detail: true },
    });
  },
};
