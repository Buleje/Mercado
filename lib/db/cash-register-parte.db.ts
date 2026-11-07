import "server-only";
import { prisma } from "@/lib/prisma";
import type { VentaParaParte } from "@/lib/caja/parte-del-dia";

/**
 * CashRegisterParteDB — las ventas del tramo de una caja (apertura → cierre o
 * ahora), para conciliarlas con los movimientos `venta` de esa caja en el
 * parte del día (`lib/caja/parte-del-dia.ts`).
 *
 * Usa el índice `[tenantId, createdAt]` de `Sale`. El tope evita leer meses
 * si una caja quedó abierta por error; el caller marca `truncado` y la
 * pantalla lo dice («al menos…»).
 */
export const TOPE_VENTAS_DEL_TRAMO = 3000;

export const CashRegisterParteDB = {
  async ventasDelTramo(
    tenantId: string,
    desde: Date,
    hasta: Date,
  ): Promise<{ ventas: VentaParaParte[]; truncado: boolean }> {
    const filas = await prisma.sale.findMany({
      where: { tenantId, createdAt: { gte: desde, lte: hasta } },
      select: { id: true, total: true, payment: true, paymentDetails: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: TOPE_VENTAS_DEL_TRAMO,
    });
    return {
      ventas: filas.map((f) => ({
        id: f.id,
        total: Number(f.total) || 0,
        payment: f.payment,
        paymentDetails: f.paymentDetails,
        createdAt: f.createdAt.toISOString(),
      })),
      truncado: filas.length >= TOPE_VENTAS_DEL_TRAMO,
    };
  },
};
