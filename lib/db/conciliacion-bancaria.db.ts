import "server-only";
import { prisma } from "@/lib/prisma";
import { limaDateKey } from "@/lib/utils";
import { medioDigital, mediosDeLaCuenta, sumarDias, type SystemPayment } from "@/lib/finance/bank-reconciliation";
import { ESTADOS_PEDIDO_QUE_ENTRAN } from "@/lib/finance/ingresos-del-periodo";
import { desglosarPago } from "@/lib/caja/desglosar-pago";

/**
 * Lo que el sistema anotó y debería verse en el banco, para cuadrar el extracto
 * (`/api/finanzas/conciliacion`). Sólo lectura: no guarda nada.
 *
 * Fuentes (cada movimiento una sola vez):
 *  · Tesorería: los movimientos de la cuenta elegida, o de todas las de banco.
 *  · Ventas de mostrador cobradas por Yape, Plin, tarjeta o transferencia
 *    (`Sale.payment`). Una venta MIXTA se parte en sus medios con el mismo
 *    reparto que la caja (`desglosarPago`): de «efectivo 30 + Yape 20» entran
 *    los 20. Se lee de `Sale` y no de las líneas `venta` de la caja porque la
 *    venta sin caja abierta no deja línea (medido 11-10: 11 de 45 ventas la
 *    tienen), y el medio de una línea `venta` no se corrige («Cambiar medio»
 *    sólo toca ingresos y egresos: `lib/caja/cambiar-medio.ts`).
 *  · Caja: otros ingresos y egresos digitales que no son una venta (abono de un
 *    fiado por Yape, un pago por transferencia). La venta ya está arriba: su
 *    movimiento de caja (`saleId`) no se cuenta dos veces.
 *  · Pedidos online que ya son plata del negocio (`ESTADOS_PEDIDO_QUE_ENTRAN`,
 *    los mismos de Mi Plata) cobrados por medio digital, más los no cancelados
 *    con N° de operación de Yape (el cliente dice que ya pagó: cruzarlo con el
 *    banco es justo lo que sirve). Un pendiente sin N° no está en el banco.
 * Con una cuenta elegida, sólo los medios que caen en ella (`mediosDeLaCuenta`).
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

    const cuenta = pedido.cuentaId
      ? await prisma.treasuryCuenta.findFirst({ where: { id: pedido.cuentaId, tenantId }, select: { tipo: true, nombre: true, banco: true } })
      : null;
    const medios = mediosDeLaCuenta(cuenta);
    if (medios && medios.size === 0) return { pagos, porFuente, recortado };
    const admite = (medio: string | null | undefined) => {
      const m = medioDigital(medio);
      return !!m && (!medios || medios.has(m));
    };

    const yaEnTesoreria = new Set(tesoreria.map((m) => m.referencia).filter((r): r is string => !!r));
    const [ventas, caja, pedidos] = await Promise.all([
      prisma.sale.findMany({
        where: {
          tenantId,
          createdAt,
          OR: [{ payment: { in: MEDIOS_DIGITALES } }, { payment: { equals: "mixto", mode: "insensitive" } }],
        },
        select: { id: true, total: true, payment: true, paymentDetails: true, comprobanteNumero: true, createdAt: true },
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
        where: {
          tenantId,
          createdAt,
          deletedAt: null,
          paymentMethod: { in: MEDIOS_DIGITALES },
          OR: [
            { status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] } },
            // `gt: ""` = con N° de operación escrito (ni null ni vacío).
            { status: { not: "cancelado" }, yapeOperationNumber: { gt: "" } },
          ],
        },
        select: { id: true, total: true, paymentMethod: true, yapeOperationNumber: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: TOPE_POR_FUENTE,
      }),
    ]);
    recortado ||= ventas.length >= TOPE_POR_FUENTE || caja.length >= TOPE_POR_FUENTE || pedidos.length >= TOPE_POR_FUENTE;

    for (const v of ventas) {
      if (yaEnTesoreria.has(v.id)) continue;
      const lineas = desglosarPago(v.payment, v.paymentDetails, num(v.total)).filter((l) => admite(l.method));
      const nombre = v.comprobanteNumero ? `Venta ${v.comprobanteNumero}` : "Venta de mostrador";
      lineas.forEach((l, i) => {
        porFuente.ventas++;
        pagos.push({
          id: lineas.length === 1 && medioDigital(v.payment) ? `venta:${v.id}` : `venta:${v.id}:${i}`,
          date: limaDateKey(v.createdAt),
          amount: num(l.amount),
          method: `Venta · ${l.method.toLowerCase()}`,
          description: medioDigital(v.payment) ? nombre : `${nombre} (pago mixto)`,
        });
      });
    }
    for (const c of caja) {
      if (!admite(c.method)) continue;
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
      if (yaEnTesoreria.has(p.id) || !admite(p.paymentMethod)) continue;
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
