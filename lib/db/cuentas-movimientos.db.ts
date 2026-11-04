import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { toNumOrZero } from "@/lib/decimal-utils";
import { decodeExpenseDescription } from "@/lib/expense-meta";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { TOPE_MOVIMIENTOS, type CuentasDelPeriodo } from "@/lib/finance/cuentas-tipos";
import {
  armarCuentas,
  codigoDeDevolucion,
  filaDeCaja,
  filaDeCobroDeFiado,
  filaDeGasto,
  filaDeLiquidacion,
  filaDePagoAProveedor,
  filaDePedido,
  gastoDelRetiro,
  ventanaAncha,
  type FilaCruda,
  type RangoCuentas,
} from "@/lib/finance/cuentas-del-periodo";

/**
 * CuentasMovimientosDB — trae las filas de «Cuentas» (ADR-527): todo movimiento
 * de plata del negocio en un periodo. Solo lectura y siempre del tenant de la
 * sesión; qué entra, de qué lado y qué se descarta por estar contado en otra
 * tabla lo decide `lib/finance/cuentas-del-periodo.ts` (puro, con tests).
 *
 * Sin caché, igual que `getFinanceAggregates`: es una lectura del momento
 * (después de anotar un gasto, la lista tiene que mostrarlo ya).
 *
 * Volumen: las ventas del POS y los pedidos pueden ser miles en una bodega; de
 * esos se traen solo los `TOPE_MOVIMIENTOS` más nuevos (ninguno más viejo puede
 * entrar en la lista) y la suma completa sale de un `aggregate`. El resto de las
 * fuentes son de a decenas por mes y se traen enteras.
 */

const textoDe = (...partes: Array<string | null | undefined>) =>
  partes.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");

const sinCancelados = { not: "CANCELADO" } as const;
/** Cuentas lee los dos lados a propósito: DADO va a «adelantos», RECIBIDO a «ingresos» (ADR-527). */
const AMBOS_LADOS: Array<"DADO" | "RECIBIDO"> = ["DADO", "RECIBIDO"];

export const CuentasMovimientosDB = {
  async delPeriodo(tenantId: string, rango: RangoCuentas): Promise<CuentasDelPeriodo> {
    if (!tenantId) throw new Error("tenantId is required");
    /** Instantes (createdAt): el corte exacto de Lima. */
    const enRango = rango.inicio ? { gte: rango.inicio, lt: rango.fin } : { lt: rango.fin };
    /** Fechas que pueden venir sin hora: un día de más a cada lado; el corte fino es puro. */
    const ancha = ventanaAncha(rango);
    // Plata cobrada (`esPedidoCobrado`, la regla de la caja del mes): entregado, no a cuenta,
    // en el día de la entrega. `deuda` es nullable: `not: true` dejaría afuera los NULL.
    const pedidosCobrados: Prisma.OrderWhereInput = {
      tenantId, deletedAt: null, status: "entregado", total: { gt: 0 },
      AND: [
        { OR: [{ deuda: false }, { deuda: null }] },
        { OR: [{ deliveredAt: enRango }, { deliveredAt: null, createdAt: enRango }] },
      ],
    };
    // Lo fiado no entró: entra cuando se cobra («Cobro de fiado · …» en la caja). Sumar
    // las dos veces contaba la misma plata en la venta y en el cobro (ADR-451 corta igual).
    const ventasDelRango = {
      tenantId, createdAt: enRango, total: { gt: 0 },
      NOT: { payment: { equals: "fiado", mode: "insensitive" as const } },
    };

    const [
      adelantos, abiertos, ventas, sumaVentas, pedidos, sumaPedidos,
      caja, gastos, tesoreria, gastosMaquina, ingresosMaquina, alquileres, cuotasFiado, pagosProveedor, liquidaciones,
    ] = await Promise.all([
      prisma.adelanto.findMany({
        where: { tenantId, direccion: { in: AMBOS_LADOS }, status: sinCancelados, fechaAdelanto: ancha },
        select: {
          id: true, direccion: true, montoAdelantado: true, moneda: true, fechaAdelanto: true,
          codigoOperacion: true, notas: true, beneficiario: { select: { nombre: true } },
        },
      }),
      // Por cobrar = saldo de HOY: no depende del periodo.
      prisma.adelanto.findMany({
        where: { tenantId, direccion: "DADO", status: "ABIERTO" },
        select: { beneficiarioId: true, saldoPendiente: true, moneda: true, beneficiario: { select: { nombre: true } } },
      }),
      prisma.sale.findMany({
        where: ventasDelRango,
        select: { id: true, total: true, payment: true, createdAt: true, comprobanteNumero: true },
        orderBy: { createdAt: "desc" },
        take: TOPE_MOVIMIENTOS,
      }),
      prisma.sale.aggregate({ where: ventasDelRango, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.findMany({
        where: pedidosCobrados,
        select: { id: true, total: true, status: true, deuda: true, customerName: true, paymentMethod: true, createdAt: true, deliveredAt: true },
        orderBy: { createdAt: "desc" },
        take: TOPE_MOVIMIENTOS,
      }),
      prisma.order.aggregate({ where: pedidosCobrados, _sum: { total: true }, _count: { _all: true } }),
      // `CashMovement` no lleva tenantId: el aislamiento va por su caja.
      prisma.cashMovement.findMany({
        where: {
          cashRegister: { tenantId },
          createdAt: enRango,
          // La venta con `saleId` ya está en `Sale`; apertura/arqueo/cierre no son plata nueva.
          OR: [{ type: { in: ["ingreso", "egreso"] } }, { type: "venta", saleId: null }],
        },
        select: { id: true, type: true, amount: true, description: true, saleId: true, createdAt: true },
      }),
      // Las plantillas de gasto fijo (`recurring`, ADR-374) no son plata que salió.
      prisma.expense.findMany({
        where: { tenantId, recurring: false, OR: [{ paidAt: ancha }, { paidAt: null, date: ancha }] },
        select: {
          id: true, category: true, description: true, amount: true, date: true, paidAt: true, gtfNumber: true,
          documentNumber: true, supplierName: true, paymentMethod: true,
        },
      }),
      // Solo lo anotado a mano: VENTA/GASTO/CIERRE_CAJA/… nacen de otro movimiento que ya está en la lista.
      prisma.treasuryMovimiento.findMany({
        where: { tenantId, origen: "MANUAL", tipo: { in: ["INGRESO", "EGRESO"] }, createdAt: enRango },
        select: { id: true, tipo: true, monto: true, descripcion: true, createdAt: true, cuenta: { select: { nombre: true, moneda: true } } },
      }),
      // El vale del cuaderno de combustible (ADR-533) no es plata que salió: salió al comprar
      // los cilindros. `OR` con null a propósito: `{ not: "cilindros" }` solo también deja afuera los NULL.
      prisma.assetExpense.findMany({
        where: { tenantId, date: ancha, annulledAt: null, OR: [{ fuelSource: null }, { fuelSource: { not: "cilindros" } }] },
        select: { id: true, category: true, amount: true, date: true, notes: true, asset: { select: { name: true } } },
      }),
      // Solo lo cobrado: lo pendiente es una cuenta por cobrar, no plata que entró.
      prisma.assetIncome.findMany({
        where: { tenantId, paid: true, OR: [{ paidAt: ancha }, { paidAt: null, date: ancha }] },
        select: {
          id: true, client: true, amount: true, date: true, paidAt: true, quantity: true, unit: true, notes: true,
          asset: { select: { name: true } },
        },
      }),
      prisma.alquilerPago.findMany({
        where: { tenantId, pagadoEl: ancha, alquiler: { tenantId, deletedAt: null, nuestroPapel: { in: ["inquilino", "arrendador"] } } },
        select: {
          id: true, periodo: true, monto: true, pagadoEl: true, medio: true, numeroOperacion: true,
          alquiler: { select: { nombre: true, nuestroPapel: true, moneda: true, duenoTexto: true, inquilinoTexto: true } },
        },
      }),
      // El cobro de un fiado se guarda aunque no haya caja abierta (`FiadosDB.cobroMasivo`).
      prisma.fiadoCuota.findMany({
        where: { fiado: { tenantId }, pagadoEn: enRango },
        select: { id: true, monto: true, pagadoEn: true, notas: true, fiado: { select: { customer: { select: { name: true } } } } },
      }),
      // Pagos de cuentas por pagar: el de transferencia no pasa por la caja.
      prisma.payment.findMany({
        where: { payable: { tenantId }, date: ancha },
        select: { id: true, amount: true, method: true, date: true, reference: true, payable: { select: { supplierName: true, description: true } } },
      }),
      // Liquidaciones vivas con pago (ADR-413): la plata de la cabecera, haya pasado por la caja o no.
      prisma.liquidacionCuenta.findMany({
        where: { tenantId, anuladaAt: null, fecha: ancha, pagoMonto: { gt: 0 } },
        select: { id: true, codigo: true, fecha: true, pagoDireccion: true, pagoMonto: true, personaNombre: true },
      }),
    ]);

    // Los retiros de caja de un gasto se descartan si su gasto sigue vivo (sea del periodo o no);
    // la devolución de un adelanto anulado, siempre.
    const idsDeGasto = [...new Set(caja.map((m) => gastoDelRetiro(m.id)).filter((g): g is string => g !== null))];
    const hayDevoluciones = caja.some((m) => codigoDeDevolucion(m.description) !== null);
    // Lo descontado de adelantos en los pagos de la semana (sale el neto, no el bruto).
    const [vivos, anulados, descontado] = await Promise.all([
      idsDeGasto.length === 0
        ? []
        : prisma.expense.findMany({ where: { tenantId, recurring: false, id: { in: idsDeGasto } }, select: { id: true } }),
      hayDevoluciones
        ? prisma.adelanto.findMany({ where: { tenantId, direccion: { in: AMBOS_LADOS }, status: "CANCELADO", codigoOperacion: { not: null } }, select: { codigoOperacion: true } })
        : [],
      AdelantosDB.descontadoDeLosGastos(tenantId, gastos),
    ]);
    const contextoCaja = {
      gastosVivos: new Set(vivos.map((g) => g.id)),
      adelantosAnulados: new Set(anulados.map((a) => a.codigoOperacion ?? "")),
    };

    const filas: FilaCruda[] = [];
    for (const a of adelantos) {
      const dado = a.direccion === "DADO";
      filas.push({
        id: a.id, fuente: "adelanto", grupo: dado ? "adelantos" : "ingresos", tipo: dado ? "Adelanto" : "Adelanto recibido",
        fecha: a.fechaAdelanto, clase: "fecha", persona: a.beneficiario?.nombre ?? "",
        detalle: textoDe(a.codigoOperacion, a.notas), monto: toNumOrZero(a.montoAdelantado), moneda: a.moneda,
      });
    }
    for (const v of ventas) {
      filas.push({
        id: v.id, fuente: "venta", grupo: "ingresos", tipo: "Venta", fecha: v.createdAt, clase: "instante", persona: "",
        detalle: textoDe("Mostrador", v.payment, v.comprobanteNumero), monto: toNumOrZero(v.total), moneda: "PEN",
      });
    }
    for (const p of pedidos) {
      const fila = filaDePedido({ ...p, total: toNumOrZero(p.total) });
      if (fila) filas.push(fila);
    }
    for (const m of caja) {
      const fila = filaDeCaja({ ...m, amount: toNumOrZero(m.amount) }, contextoCaja);
      if (fila) filas.push(fila);
    }
    for (const g of gastos) {
      const fila = filaDeGasto({
        id: g.id, amount: toNumOrZero(g.amount), date: g.date, paidAt: g.paidAt, gtfNumber: g.gtfNumber, persona: g.supplierName ?? "",
        detalle: textoDe(decodeExpenseDescription(g.description ?? "").description || g.category, g.paymentMethod),
        descontado: descontado.get(g.id) ?? 0,
      });
      if (fila) filas.push(fila);
    }
    for (const c of cuotasFiado) {
      if (!c.pagadoEn) continue;
      filas.push(filaDeCobroDeFiado({
        id: c.id, monto: toNumOrZero(c.monto), pagadoEn: c.pagadoEn, cliente: c.fiado.customer?.name ?? "", notas: c.notas,
      }));
    }
    for (const l of liquidaciones) {
      const fila = filaDeLiquidacion({
        id: l.id, codigo: l.codigo, fecha: l.fecha, pagoDireccion: l.pagoDireccion,
        pagoMonto: l.pagoMonto == null ? null : toNumOrZero(l.pagoMonto), persona: l.personaNombre,
      });
      if (fila) filas.push(fila);
    }
    for (const p of pagosProveedor) {
      filas.push(filaDePagoAProveedor({
        id: p.id, amount: toNumOrZero(p.amount), date: p.date, proveedor: p.payable.supplierName,
        detalle: p.payable.description, method: p.method, reference: p.reference,
      }));
    }
    for (const t of tesoreria) {
      const entra = t.tipo === "INGRESO";
      filas.push({
        id: t.id, fuente: "tesoreria", grupo: entra ? "ingresos" : "gastos", tipo: entra ? "Entró a una cuenta" : "Salió de una cuenta",
        fecha: t.createdAt, clase: "instante", persona: "", detalle: textoDe(t.descripcion, t.cuenta?.nombre),
        monto: toNumOrZero(t.monto), moneda: t.cuenta?.moneda ?? "PEN",
      });
    }
    for (const g of gastosMaquina) {
      filas.push({
        id: g.id, fuente: "maquina", grupo: "gastos", tipo: "Gasto de máquina", fecha: g.date, clase: "fecha",
        persona: g.asset?.name ?? "", detalle: textoDe(g.category, g.notes), monto: toNumOrZero(g.amount), moneda: "PEN",
      });
    }
    for (const i of ingresosMaquina) {
      const cantidad = i.quantity == null ? "" : `${toNumOrZero(i.quantity)} ${i.unit}`;
      filas.push({
        id: i.id, fuente: "maquina", grupo: "ingresos", tipo: "Alquiler de máquina", fecha: i.paidAt ?? i.date, clase: "fecha",
        persona: i.client ?? "", detalle: textoDe(i.asset?.name, cantidad, i.notes), monto: toNumOrZero(i.amount), moneda: "PEN",
      });
    }
    for (const p of alquileres) {
      const pagamos = p.alquiler.nuestroPapel === "inquilino";
      filas.push({
        id: p.id, fuente: "alquiler", grupo: pagamos ? "gastos" : "ingresos", tipo: pagamos ? "Alquiler pagado" : "Alquiler cobrado",
        fecha: p.pagadoEl, clase: "fecha", persona: (pagamos ? p.alquiler.duenoTexto : p.alquiler.inquilinoTexto) ?? "",
        detalle: textoDe(p.alquiler.nombre, p.periodo, p.medio, p.numeroOperacion), monto: toNumOrZero(p.monto), moneda: p.alquiler.moneda,
      });
    }

    return armarCuentas(rango, {
      filas,
      ventasDelPeriodo: {
        monto: toNumOrZero(sumaVentas._sum.total) + toNumOrZero(sumaPedidos._sum.total),
        n: sumaVentas._count._all + sumaPedidos._count._all,
      },
      abiertos: abiertos.map((a) => ({
        beneficiarioId: a.beneficiarioId, persona: a.beneficiario?.nombre ?? "", saldo: toNumOrZero(a.saldoPendiente), moneda: a.moneda,
      })),
    });
  },
};
