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
  totalGeneral: number;
}

export const PorCobrarDB = {
  /** Agrega los saldos pendientes por cobrar del tenant (tenant-scoped). */
  async getSummary(tenantId: string): Promise<PorCobrarSummary> {
    const [fiadoAgg, adelantoAgg, cuotaAgg, prestamosCount] = await Promise.all([
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
    ]);

    const fiados: PorCobrarBucket = { total: toNumOrZero(fiadoAgg._sum.saldo), count: fiadoAgg._count };
    const adelantos: PorCobrarBucket = { total: toNumOrZero(adelantoAgg._sum.saldoPendiente), count: adelantoAgg._count };
    const prestamos: PorCobrarBucket = { total: toNumOrZero(cuotaAgg._sum.monto), count: prestamosCount };

    const totalGeneral = Math.round((fiados.total + prestamos.total + adelantos.total) * 100) / 100;

    return { fiados, prestamos, adelantos, totalGeneral };
  },
};
