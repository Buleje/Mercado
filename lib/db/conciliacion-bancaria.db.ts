import "server-only";
import { prisma } from "@/lib/prisma";
import { limaDateKey } from "@/lib/utils";
import { sumarDias, type SystemPayment } from "@/lib/finance/bank-reconciliation";

/**
 * Lo que el sistema anotó y debería verse en el banco, para cuadrar el extracto
 * (`/api/finanzas/conciliacion`). Sólo lectura: no guarda nada.
 *
 * Fuentes (cada movimiento una sola vez):
 *  · Tesorería: los movimientos de la cuenta elegida, o de todas las de banco.
 *  · Ventas de mostrador cobradas por Yape, Plin, tarjeta o transferencia (`Sale.payment`).
 *  · Caja: otros ingresos y egresos digitales que no son una venta (abono de un
 *    fiado por Yape, un pago por transferencia). La venta ya está arriba: su
 *    movimiento de caja (`saleId`) no se cuenta dos veces.
 *  · Pedidos online no cancelados cobrados por medio digital, con su N° de operación de Yape.
 * Una venta o pedido que ya está anotado en Tesorería (`referencia` = su id) no se repite.
 */

/** Cómo se escriben los cobros que llegan al banco en `Sale.payment`, `CashMovement.method` y `Order.paymentMethod`. */
export const MEDIOS_DIGITALES = [
  "yape", "plin", "tarjeta", "transferencia", "deposito", "depósito", "card", "transfer",
  "Yape", "Plin", "Tarjeta", "Transferencia",
];
const CUENTAS_DE_BANCO = ["BANCO_AHORRO", "BANCO_CORRIENTE"] as const;
/** Por fuente: un mes de una bodega son cientos; más que esto se avisa como recortado. */
export const TOPE_POR_FUENTE = 5000;

export interface PedidoDelSistema {
  /** Primer y último día (Lima, `YYYY-MM-DD`), inclusive. */
  desde: string;
  hasta: string;
  /** Una cuenta de Tesorería del negocio; `null` = todas las de banco. */
  cuentaId: string | null;
  /** Sumar los cobros digitales de ventas, caja y pedidos. */
  conVentas: boolean;
}

export interface MovimientosDelSistema {
  pagos: SystemPayment[];
  porFuente: { tesoreria: number; ventas: number; caja: number; pedidos: number };
  /** Alguna fuente llegó al tope: hay más movimientos que no entraron al cruce. */
  recortado: boolean;
}

/** 00:00 de Lima del día `YYYY-MM-DD` (Lima = UTC−5 todo el año). */
const inicioLima = (dia: string) => new Date(`${dia}T05:00:00.000Z`);
const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

export const ConciliacionBancariaDB = {
  async movimientosDelSistema(tenantId: string, pedido: PedidoDelSistema): Promise<MovimientosDelSistema> {
    const createdAt = { gte: inicioLima(pedido.desde), lt: inicioLima(sumarDias(pedido.hasta, 1)) };

    const tesoreria = await prisma.treasuryMovimiento.findMany({
      where: {
        tenantId,
        createdAt,
        ...(pedido.cuentaId
          ? { cuentaId: pedido.cuentaId }
          : { cuenta: { tenantId, tipo: { in: [...CUENTAS_DE_BANCO] } } }),
      },
      select: { id: true, tipo: true, monto: true, referencia: true, descripcion: true, createdAt: true, cuenta: { select: { nombre: true } } },
      orderBy: { createdAt: "asc" },
      take: TOPE_POR_FUENTE,
    });
    const pagos: SystemPayment[] = tesoreria.map((m) => ({
      id: `tesoreria:${m.id}`,
      date: limaDateKey(m.createdAt),
      amount: m.tipo === "INGRESO" || m.tipo === "TRANSFERENCIA_IN" ? num(m.monto) : -num(m.monto),
      ...(m.referencia ? { reference: m.referencia } : {}),
      method: `Tesorería · ${m.cuenta.nombre}`,
      description: m.descripcion,
    }));
    const porFuente = { tesoreria: tesoreria.length, ventas: 0, caja: 0, pedidos: 0 };
    let recortado = tesoreria.length >= TOPE_POR_FUENTE;
    if (!pedido.conVentas) return { pagos, porFuente, recortado };

    const yaEnTesoreria = new Set(tesoreria.map((m) => m.referencia).filter((r): r is string => !!r));
    const [ventas, caja, pedidos] = await Promise.all([
      prisma.sale.findMany({
        where: { tenantId, createdAt, payment: { in: MEDIOS_DIGITALES } },
        select: { id: true, total: true, payment: true, comprobanteNumero: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: TOPE_POR_FUENTE,
      }),
      prisma.cashMovement.findMany({
        where: {
          cashRegister: { tenantId },
          createdAt,
          method: { in: MEDIOS_DIGITALES },
          saleId: null,
          type: { in: ["ingreso", "egreso"] },
        },
        select: { id: true, type: true, amount: true, method: true, description: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: TOPE_POR_FUENTE,
      }),
      prisma.order.findMany({
        where: { tenantId, createdAt, deletedAt: null, status: { not: "cancelado" }, paymentMethod: { in: MEDIOS_DIGITALES } },
        select: { id: true, total: true, paymentMethod: true, yapeOperationNumber: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: TOPE_POR_FUENTE,
      }),
    ]);
    recortado ||= ventas.length >= TOPE_POR_FUENTE || caja.length >= TOPE_POR_FUENTE || pedidos.length >= TOPE_POR_FUENTE;

    for (const v of ventas) {
      if (yaEnTesoreria.has(v.id)) continue;
      porFuente.ventas++;
      pagos.push({
        id: `venta:${v.id}`,
        date: limaDateKey(v.createdAt),
        amount: num(v.total),
        method: `Venta · ${v.payment.toLowerCase()}`,
        description: v.comprobanteNumero ? `Venta ${v.comprobanteNumero}` : "Venta de mostrador",
      });
    }
    for (const c of caja) {
      porFuente.caja++;
      pagos.push({
        id: `caja:${c.id}`,
        date: limaDateKey(c.createdAt),
        amount: c.type === "egreso" ? -Math.abs(num(c.amount)) : Math.abs(num(c.amount)),
        method: `Caja · ${c.method.toLowerCase()}`,
        description: c.description || (c.type === "egreso" ? "Egreso de caja" : "Ingreso a caja"),
      });
    }
    for (const p of pedidos) {
      if (yaEnTesoreria.has(p.id)) continue;
      porFuente.pedidos++;
      pagos.push({
        id: `pedido:${p.id}`,
        date: limaDateKey(p.createdAt),
        amount: num(p.total),
        ...(p.yapeOperationNumber ? { reference: p.yapeOperationNumber } : {}),
        method: `Pedido · ${(p.paymentMethod ?? "").toLowerCase()}`,
        description: `Pedido ${p.id.slice(-6)}`,
      });
    }
    return { pagos, porFuente, recortado };
  },
};
