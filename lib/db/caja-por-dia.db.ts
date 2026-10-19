import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { ESTADOS_PEDIDO_QUE_ENTRAN } from "@/lib/finance/ingresos-del-periodo";
import {
  armarDiasDeCaja,
  cuadreDeCajas,
  type CajaCerradaDelDia,
  type CuadreDelDia,
  type DiaDeCaja,
  type TotalesDeCaja,
} from "@/lib/caja/cierres-por-dia";
import { limaDateKey } from "@/lib/utils";
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";

/**
 * CajaPorDiaDB — el cierre de cada día con el conteo real (Caja › Historial ›
 * Caja por día y el resumen del cron). La cuenta es `lib/caja/cierres-por-dia`;
 * acá sólo se trae lo del rango, siempre por `tenantId`.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
/** Lima es UTC−5 fijo: el día `YYYY-MM-DD` empieza a las 05:00 UTC. */
const inicioDelDiaLima = (dia: string) => new Date(`${dia}T05:00:00.000Z`);

const SELECT_CAJA = { openedAt: true, closedAt: true, expectedAmount: true, closingAmount: true, difference: true, notes: true } as const;

type Monto = Parameters<typeof toNumOrZero>[0];
type FilaCaja = { openedAt: Date; closedAt: Date | null; expectedAmount: Monto; closingAmount: Monto; difference: Monto; notes: string | null };

const montoONull = (v: Monto) => (v == null ? null : toNumOrZero(v));

function aCaja(r: FilaCaja): CajaCerradaDelDia {
  return {
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    expectedAmount: montoONull(r.expectedAmount),
    closingAmount: montoONull(r.closingAmount),
    difference: montoONull(r.difference),
    notes: r.notes,
  };
}

export const CajaPorDiaDB = {
  /** Los últimos `dias` días de Lima (hoy incluido), del más nuevo al más viejo. */
  async listar(tenantId: string, opts: { dias: number; ahora?: Date }): Promise<{ desde: string; dias: DiaDeCaja[]; totales: TotalesDeCaja }> {
    if (!tenantId) throw new Error("tenantId is required");
    const ahora = opts.ahora ?? new Date();
    const desde = limaDateKey(new Date(ahora.getTime() - (opts.dias - 1) * DIA_MS));
    const gte = inicioDelDiaLima(desde);

    const [cajas, ventas, pedidos, resumenes] = await Promise.all([
      prisma.cashRegister.findMany({
        where: { tenantId, status: "cerrada", OR: [{ closedAt: { gte } }, { closedAt: null, openedAt: { gte } }] },
        select: SELECT_CAJA,
      }),
      prisma.sale.findMany({ where: { tenantId, createdAt: { gte } }, select: { createdAt: true, total: true } }),
      prisma.order.findMany({
        where: { tenantId, deletedAt: null, status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] }, createdAt: { gte } },
        select: { createdAt: true, total: true, status: true },
      }),
      /* `fecha` = el día a medianoche UTC. */
      prisma.dailySummary.findMany({
        where: { tenantId, fecha: { gte: new Date(`${desde}T00:00:00.000Z`) } },
        select: {
          id: true, fecha: true, fiadosCobrados: true, fiadosNuevos: true, fiadosVencidos: true, mejorHora: true,
          productoTop: true, stockAlertas: true, notas: true, creadoPor: true, createdAt: true,
        },
      }),
    ]);

    const armado = armarDiasDeCaja({
      cajas: cajas.map(aCaja),
      ventas,
      pedidos,
      resumenes: resumenes.map((r) => ({ ...r, fiadosCobrados: toNumOrZero(r.fiadosCobrados), fiadosNuevos: toNumOrZero(r.fiadosNuevos) })),
      desde,
    });
    return { desde, ...armado };
  },

  /** El cuadre de las cajas cerradas en el día `YYYY-MM-DD` de Lima (lo que haya cerrado hasta ahora). */
  async cuadreDelDia(tenantId: string, dia: string): Promise<CuadreDelDia> {
    if (!tenantId) throw new Error("tenantId is required");
    const gte = inicioDelDiaLima(dia);
    const lt = new Date(gte.getTime() + DIA_MS);
    const cajas = await prisma.cashRegister.findMany({
      where: { tenantId, status: "cerrada", OR: [{ closedAt: { gte, lt } }, { closedAt: null, openedAt: { gte, lt } }] },
      select: SELECT_CAJA,
    });
    return cuadreDeCajas(cajas.map(aCaja));
  },

  /**
   * El efectivo que tiene que haber AHORA en las cajas abiertas (fondo + ventas
   * en efectivo + ingresos − retiros, `saldoEsperadoDeCaja`): lo que se cuenta
   * en «Cerrar el día». Dos consultas para todas las cajas abiertas.
   */
  async esperadoDeAbiertas(tenantId: string): Promise<{ cajas: number; esperado: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const abiertas = await prisma.cashRegister.findMany({
      where: { tenantId, status: "abierta", closedAt: null },
      select: { id: true, openingAmount: true },
    });
    if (abiertas.length === 0) return { cajas: 0, esperado: 0 };
    const grupos = await prisma.cashMovement.groupBy({
      by: ["cashRegisterId", "type", "method"],
      where: { cashRegisterId: { in: abiertas.map((c) => c.id) }, cashRegister: { tenantId } },
      _sum: { amount: true },
    });
    let esperado = 0;
    for (const c of abiertas) {
      const movs = grupos
        .filter((g) => g.cashRegisterId === c.id)
        .map((g) => ({ type: g.type, method: g.method, amount: toNumOrZero(g._sum.amount) }));
      esperado += saldoEsperadoDeCaja(toNumOrZero(c.openingAmount), movs).esperado;
    }
    return { cajas: abiertas.length, esperado: Math.round(esperado * 100) / 100 };
  },
};
