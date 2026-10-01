import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import { rangoDelMesLima } from "@/lib/finance/ingresos-del-periodo";

/**
 * IgvDelMesDB — el IGV que está REGISTRADO en un mes, sólo lectura.
 *
 * Lo usa el Resumen de Mi Plata (`/api/finanzas/igv-del-mes`), que antes
 * mostraba como «IGV a pagar» ventas y gastos × 18/118 — un derivado con una
 * tasa que en la Amazonía (Ley 27037) puede ni aplicar. Acá sólo campos
 * propios:
 *  - ventas: Σ `SunatInvoice.igv` de boletas y facturas del mes que no fueron
 *    rechazadas ni dadas de baja, menos las notas de crédito;
 *  - compras: Σ `Expense.igvAmount` de los gastos del mes que lo traen (sin las
 *    plantillas de gasto fijo, ADR-374), y cuántos gastos hubo, para poder
 *    decir «0 de 5».
 *
 * El mes es el de LIMA. Los comprobantes son instantes (`createdAt`). Los
 * gastos mezclan dos cosas en `date`: la fecha sola del formulario (guardada
 * 00:00:00.000 UTC, un día de calendario) y el instante de pago de un gasto
 * fijo. Por eso el rango de gastos es el de Lima MÁS la medianoche UTC del 01
 * de este mes y MENOS la del 01 del siguiente (misma regla que `mesDeGasto`).
 *
 * Medido 2026-09-28: 0 comprobantes electrónicos y 0 de 24 gastos con IGV en
 * toda la base.
 */

export interface IgvRegistrado {
  mes: string;
  ventas: { igv: number; comprobantes: number };
  compras: { igv: number; conIgv: number; gastos: number };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const VIVOS = { notIn: ["rejected", "voided"] };

export const IgvDelMesDB = {
  async leer(tenantId: string, mes: string): Promise<IgvRegistrado> {
    const { start, end } = rangoDelMesLima(mes);
    const [y, m] = mes.split("-").map(Number);
    const fechaSolaDelMes = new Date(Date.UTC(y, m - 1, 1));
    const fechaSolaDelSiguiente = new Date(Date.UTC(y, m, 1));
    const fechaDeGasto = {
      AND: [
        { OR: [{ date: { gte: start, lt: end } }, { date: fechaSolaDelMes }] },
        { NOT: { date: fechaSolaDelSiguiente } },
      ],
    };
    return getOrSet(`finanzas:igv-del-mes:${tenantId}:${mes}`, 120, async () => {
      const [emitidos, notas, conIgv, gastos] = await Promise.all([
        prisma.sunatInvoice.aggregate({
          _sum: { igv: true },
          _count: { _all: true },
          where: { tenantId, createdAt: { gte: start, lt: end }, type: { in: ["boleta", "factura"] }, sunatStatus: VIVOS },
        }),
        prisma.sunatInvoice.aggregate({
          _sum: { igv: true },
          where: { tenantId, createdAt: { gte: start, lt: end }, type: "nota_credito", sunatStatus: VIVOS },
        }),
        prisma.expense.aggregate({
          _sum: { igvAmount: true },
          _count: { _all: true },
          where: { tenantId, ...fechaDeGasto, recurring: false, igvAmount: { gt: 0 } },
        }),
        prisma.expense.count({ where: { tenantId, ...fechaDeGasto, recurring: false } }),
      ]);
      return {
        mes,
        ventas: { igv: r2(toNumOrZero(emitidos._sum.igv) - toNumOrZero(notas._sum.igv)), comprobantes: emitidos._count._all },
        compras: { igv: r2(toNumOrZero(conIgv._sum.igvAmount)), conIgv: conIgv._count._all, gastos },
      };
    });
  },
};
