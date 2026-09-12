import "server-only";

/**
 * lib/db/por-cobrar.db.ts
 *
 * Tablero consolidado de cuentas por cobrar (auditoría 2026-06): el concepto
 * "plata que me deben" estaba repartido en Fiados, Préstamos y Adelantos sin
 * una vista única. Esta clase NO fusiona los módulos (cada uno conserva su
 * semántica y su pantalla) — solo agrega los saldos pendientes en un resumen.
 *
 * Fuentes de saldo:
 *  - Fiados:    Fiado.saldo            (status ACTIVO | VENCIDO)
 *  - Préstamos: cuotas impagas         (PrestamoCuota.monto where pagadoEn=null,
 *                                       préstamo ACTIVO | VENCIDO)
 *  - Adelantos: Adelanto.saldoPendiente (status ABIERTO — EXCEDIDO es deuda del
 *                                        negocio, NO por cobrar)
 *  - Madera:    saldo de la cuenta corriente forestal (ADR-322), sumando sólo
 *               las partes con saldo A FAVOR del CTP.
 *
 * Por qué la madera entra acá (2026-09-11): la guía de salida ahora anota la
 * venta en la cuenta del cliente, y sin este bucket «Todo lo que me deben»
 * mentía por omisión — el aserradero despachaba S/ 5.000 a cuenta y el tablero
 * decía cero. Es la misma plata que el resto: alguien la tiene que pagar.
 *
 * El saldo NO está guardado: se deriva sumando cargos menos abonos por parte
 * (`cuenta-corriente.ts`), porque un saldo almacenado se desincroniza con la
 * primera corrección. Acá se hace la misma cuenta y se cuentan sólo las partes
 * que quedan debiendo: una parte con saldo a favor SUYO es deuda del negocio,
 * no algo por cobrar — el mismo criterio que ya aplica a los adelantos.
 */

import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

export interface PorCobrarBucket {
  total: number;
  count: number;
}

export interface PorCobrarSummary {
  fiados: PorCobrarBucket;
  prestamos: PorCobrarBucket;
  adelantos: PorCobrarBucket;
  /** Cuenta corriente forestal: madera despachada que todavía no se cobró. */
  madera: PorCobrarBucket;
  totalGeneral: number;
}

export const PorCobrarDB = {
  /** Agrega los saldos pendientes por cobrar del tenant (tenant-scoped). */
  async getSummary(tenantId: string): Promise<PorCobrarSummary> {
    const [fiadoAgg, adelantoAgg, cuotaAgg, prestamosCount, movsForestales] = await Promise.all([
      prisma.fiado.aggregate({
        where: { tenantId, status: { in: ["ACTIVO", "VENCIDO"] }, saldo: { gt: 0 } },
        _sum: { saldo: true },
        _count: true,
      }),
      prisma.adelanto.aggregate({
        where: { tenantId, status: "ABIERTO", saldoPendiente: { gt: 0 } },
        _sum: { saldoPendiente: true },
        _count: true,
      }),
      // Saldo de préstamos = cuotas aún no pagadas de préstamos vivos.
      prisma.prestamoCuota.aggregate({
        where: { pagadoEn: null, prestamo: { tenantId, status: { in: ["ACTIVO", "VENCIDO"] } } },
        _sum: { monto: true },
      }),
      prisma.prestamo.count({ where: { tenantId, status: { in: ["ACTIVO", "VENCIDO"] } } }),
      /* Cuenta corriente forestal: se traen los movimientos y se suman por
         parte, porque el saldo es un derivado (cargos − abonos) y no una
         columna. Son decenas por tenant, no miles. */
      prisma.forestCuentaMov.findMany({
        where: { tenantId, deletedAt: null },
        select: { parteId: true, tipo: true, monto: true },
      }),
    ]);

    const fiados: PorCobrarBucket = { total: toNumOrZero(fiadoAgg._sum.saldo), count: fiadoAgg._count };
    const adelantos: PorCobrarBucket = { total: toNumOrZero(adelantoAgg._sum.saldoPendiente), count: adelantoAgg._count };
    const prestamos: PorCobrarBucket = { total: toNumOrZero(cuotaAgg._sum.monto), count: prestamosCount };

    /* Sólo las partes que QUEDAN DEBIENDO: el saldo negativo de una parte es
       plata que le debemos nosotros, y sumarla acá restaría de lo que nos
       deben —dos deudas de signo contrario no se compensan en un tablero de
       cobranza—. */
    const porParte = new Map<string, number>();
    for (const m of movsForestales) {
      const monto = toNumOrZero(m.monto);
      porParte.set(m.parteId, (porParte.get(m.parteId) ?? 0) + (m.tipo === "cargo" ? monto : -monto));
    }
    const deudores = [...porParte.values()].filter((saldo) => saldo > 0.005);
    const madera: PorCobrarBucket = {
      total: Math.round(deudores.reduce((a, s) => a + s, 0) * 100) / 100,
      count: deudores.length,
    };

    const totalGeneral =
      Math.round((fiados.total + prestamos.total + adelantos.total + madera.total) * 100) / 100;

    return { fiados, prestamos, adelantos, madera, totalGeneral };
  },
};
