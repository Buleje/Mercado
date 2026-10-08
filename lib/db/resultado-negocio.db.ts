import "server-only";

/**
 * lib/db/resultado-negocio.db.ts — la lectura de «Resultado y caja del
 * aserradero» (ADR-451). SÓLO LECTURA.
 *
 * Trae las filas del tenant con un margen de fechas (±1 día; la compra y la venta
 * de madera, además, con TODAS las filas de cada guía tocada: se agrupan por GTF)
 * y deja que la función pura (`lib/finance/resultado-del-negocio.ts`)
 * decida el mes de cada una: un cargo de aserrío del 01/10 a las 00:00 UTC es
 * del 1 de octubre, y un rango en instantes de Lima lo habría dejado en
 * setiembre.
 *
 * Reusa lo que ya decide cada módulo: `filasPnlDelPeriodo` (venta y costo de cada
 * despacho, la regla de ADR-141), `saldosPorParte` (la cuenta forestal),
 * `SOLO_DADOS` (ADR-448) y `FILTRO_REQUIERE_COSTO` (ADR-437: la madera de
 * servicio no se compró). `GanadoDB` para la planilla (≈).
 *
 * Caché de 60 s por tenant bajo `claveCacheResultado(tenantId)`; lo invalidan
 * los writes de la cuenta forestal (que cubren el cobro de aserrío y la
 * liquidación) y de gastos.
 *
 * Además, las lecturas de la proyección de 13 semanas (`cashflow-rolling.ts`),
 * que antes vivían como `prisma.*` sueltos en `lib/finance`.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey } from "@/lib/utils";
import { SOLO_DADOS } from "@/lib/adelantos/direccion";
import { FILTRO_REQUIERE_COSTO } from "@/lib/forestal/madera-de-servicio";
import { ESTADOS_PEDIDO_QUE_ENTRAN, mesLima, mesesHasta, rangoDelMesLima } from "@/lib/finance/ingresos-del-periodo";
import {
  armarCaja,
  armarResultado,
  armarSerie,
  claveCacheResultado,
  detalleDeCaja,
  detalleDeResultado,
  esFuenteDeCaja,
  loQueViene,
  type CorridaEntrada,
  type EntradaCaja,
  type EntradaResultado,
  type EntradaViene,
  type FuenteDetalle,
  type OtraMoneda,
  type PlanillaEntrada,
  type RespuestaCaja,
  type RespuestaDetalle,
  type RespuestaResultado,
} from "@/lib/finance/resultado-del-negocio";
import { ForestCtpDespachoDB } from "./forest-ctp-despacho.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { GanadoDB } from "./rrhh-ganado.db";
import { saldosPorParte } from "./por-cobrar.db";

const TTL_S = 60;

/**
 * Quién pide ve lo ganado de RRHH (`RRHH_COMPLETO`, ADR-414 §7) o no. Sin esto,
 * la planilla ni se calcula: el renglón va «—» y el pendiente, «sin permiso».
 * Por defecto NO (la lectura que se olvide de decirlo no filtra sueldos).
 */
export interface OpcionesLectura {
  verPlanilla: boolean;
}
const SIN_PLANILLA: OpcionesLectura = { verPlanilla: false };
const sufijo = (o: OpcionesLectura) => (o.verPlanilla ? "p1" : "p0");
const DIA_MS = 86_400_000;

const n = (v: Parameters<typeof toNumOrZero>[0]) => toNumOrZero(v);
const nOrNull = (v: Parameters<typeof toNumOrZero>[0] | null) => (v == null ? null : toNumOrZero(v));

const SELECT_MOV = {
  id: true, parteId: true, parteNombre: true, fecha: true, tipo: true, concepto: true, monto: true, moneda: true,
  referencia: true, ctpEntryId: true, liquidacionId: true, gtfNumber: true,
} as const;
const SELECT_GASTO = { id: true, date: true, paidAt: true, amount: true, category: true, description: true, supplierName: true, gtfNumber: true } as const;
const SELECT_COMPRA = { id: true, gtfNumber: true, entryDate: true, costoTotal: true, moneda: true, providerName: true, volumeM3: true } as const;

/** Compras de madera: vivas, sin rechazadas/anuladas y sin la madera de servicio (ADR-437). */
const whereCompra = (tenantId: string) =>
  ({ tenantId, deletedAt: null, status: { notIn: ["rechazado", "anulado"] }, ...FILTRO_REQUIERE_COSTO }) satisfies Prisma.WoodEntryWhereInput;

/** Las guías tal como vinieron y normalizadas (mayúsculas, un espacio): el `in` es exacto. */
function variantesGtf(valores: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of valores) {
    const t = v?.trim();
    if (!t) continue;
    out.add(t);
    out.add(t.replace(/\s+/g, " ").toUpperCase());
  }
  return [...out];
}

/** Sin repetir por id (la ventana y la guía entera se pisan). */
function porId<T extends { id: string }>(filas: readonly T[]): T[] {
  return [...new Map(filas.map((f) => [f.id, f])).values()];
}

const esPen = (m: string | null | undefined) => (m?.trim() || "PEN").toUpperCase() === "PEN";

/** Saldo neto por moneda (cargos − abonos) de lo que no está en soles. */
function otrasMonedasDeCuenta(
  movs: readonly { tipo: string; monto: Parameters<typeof toNumOrZero>[0]; moneda: string | null; parteId: string }[],
): OtraMoneda[] {
  const acc = new Map<string, { partes: Set<string>; total: number }>();
  for (const m of movs) {
    if (esPen(m.moneda)) continue;
    const k = (m.moneda ?? "").trim().toUpperCase();
    const a = acc.get(k) ?? { partes: new Set<string>(), total: 0 };
    a.partes.add(m.parteId);
    a.total += (m.tipo === "cargo" ? 1 : -1) * toNumOrZero(m.monto);
    acc.set(k, a);
  }
  return [...acc.entries()].map(([moneda, a]) => ({ moneda, cuantos: a.partes.size, total: Math.round(a.total * 100) / 100 }));
}

/** `[gte, lt)` que cubre los meses de Lima `desde..hasta` con `margenDias` de más a cada lado. */
function ventana(desde: string, hasta: string, margenDias = 1): { gte: Date; lt: Date } {
  return {
    gte: new Date(rangoDelMesLima(desde).start.getTime() - margenDias * DIA_MS),
    lt: new Date(rangoDelMesLima(hasta).end.getTime() + margenDias * DIA_MS),
  };
}

const ultimoDia = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** El PT de la cotización guardada en la corrida (`aserrioDetalle.pt`). */
function ptDeDetalle(detalle: unknown): number | null {
  if (!detalle || typeof detalle !== "object") return null;
  const pt = (detalle as { pt?: unknown }).pt;
  return typeof pt === "number" && Number.isFinite(pt) ? pt : null;
}

/** Lo ganado de referencia de cada mes. `null` = había personal y el cálculo falló. */
async function planillasDe(tenantId: string, meses: readonly string[], hoy: string): Promise<Record<string, PlanillaEntrada | null>> {
  const out: Record<string, PlanillaEntrada | null> = {};
  await Promise.all(
    meses.map(async (mes) => {
      if (`${mes}-01` > hoy) {
        out[mes] = { total: 0, personas: [] };
        return;
      }
      try {
        const g = await GanadoDB.periodo(tenantId, { desde: `${mes}-01`, hasta: ultimoDia(mes), hoy });
        out[mes] = {
          total: g.total,
          personas: g.personas.map((p) => ({ id: p.colaboradorId, nombre: p.nombre, total: p.total, diasSinMarcar: p.sinMarcar.length })),
        };
      } catch (err) {
        logger.error("[resultado-negocio] no se pudo calcular la planilla", { error: String(err), tenantId, mes });
        out[mes] = null;
      }
    }),
  );
  return out;
}

export const ResultadoNegocioDB = {
  /**
   * Todo lo que el resultado necesita para los meses `desde..hasta` (Lima). La
   * función pura corta cada mes; acá sólo se trae con margen.
   */
  async entradaDelPeriodo(
    tenantId: string,
    desde: string,
    hasta: string,
    hoy: string,
    opciones: OpcionesLectura = SIN_PLANILLA,
  ): Promise<EntradaResultado> {
    if (!tenantId) throw new Error("tenantId is required");
    const v = ventana(desde, hasta);
    const hoyUtc = new Date(`${hoy}T00:00:00.000Z`);

    const [ventas, pedidos, cuenta, ventasCuentaVentana, filasPnlVentana, fletes, gastos, comprasVentana, cierres, planillas] = await Promise.all([
      prisma.sale.findMany({
        where: { tenantId, createdAt: { gte: v.gte, lt: v.lt } },
        select: { id: true, createdAt: true, total: true, totalCogs: true, payment: true },
      }),
      prisma.order.findMany({
        where: { tenantId, deletedAt: null, status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] }, createdAt: { gte: v.gte, lt: v.lt } },
        select: { id: true, createdAt: true, deliveredAt: true, total: true, totalCogs: true, status: true, deuda: true, customerName: true },
      }),
      prisma.forestCuentaMov.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { concepto: { in: ["aserrio_prestado", "aserrio_recibido"] }, fecha: { gte: v.gte, lt: v.lt } },
            // Los fechados después de hoy, para el aviso del mes en curso.
            { concepto: "aserrio_prestado", fecha: { gte: hoyUtc } },
          ],
        },
        select: SELECT_MOV,
      }),
      prisma.forestCuentaMov.findMany({
        where: { tenantId, deletedAt: null, concepto: "venta", tipo: "cargo", fecha: { gte: v.gte, lt: v.lt } },
        select: SELECT_MOV,
      }),
      ForestCtpDespachoDB.filasPnlDelPeriodo(tenantId, { fromDate: v.gte, toDate: v.lt }),
      prisma.forestFlete.findMany({
        where: { tenantId, deletedAt: null, fecha: { gte: v.gte, lt: v.lt } },
        select: {
          id: true, fecha: true, tipoTransporte: true, pagaQuien: true, monto: true, moneda: true, estadoPago: true, fechaPago: true,
          gtfNumber: true, transportistaNombre: true, proveedorNombre: true, volumenM3: true, ptCobrado: true,
        },
      }),
      prisma.expense.findMany({
        where: { tenantId, recurring: false, date: { gte: v.gte, lt: v.lt } },
        select: SELECT_GASTO,
      }),
      prisma.woodEntry.findMany({
        where: { ...whereCompra(tenantId), entryDate: { gte: v.gte, lt: v.lt } },
        select: SELECT_COMPRA,
      }),
      ForestCtpCierreDB.list(tenantId),
      opciones.verPlanilla ? planillasDe(tenantId, mesesEntre(desde, hasta), hoy) : Promise.resolve({}),
    ]);

    /* La guía ENTERA (ADR-451, revisión): una compra o una venta se agrupa por
       GTF y el mes lo decide su primera fecha. Con sólo lo de la ventana, la
       misma guía con filas en dos meses armaba grupos distintos según la ventana:
       el renglón (6 meses) y el detalle (1 mes) no cerraban, y `actual` cambiaba
       con `meses`. Se traen TODAS las filas de cada guía tocada. */
    const gtfsVenta = variantesGtf([
      ...ventasCuentaVentana.flatMap((c) => [c.referencia, c.gtfNumber]),
      ...filasPnlVentana.map((f) => f.gtfSalida),
    ]);
    const gtfsCompra = variantesGtf(comprasVentana.map((c) => c.gtfNumber));
    const [ventasCuentaGuia, filasPnlGuia, comprasGuia] = await Promise.all([
      gtfsVenta.length
        ? prisma.forestCuentaMov.findMany({
            where: {
              tenantId, deletedAt: null, concepto: "venta", tipo: "cargo",
              OR: [{ referencia: { in: gtfsVenta } }, { gtfNumber: { in: gtfsVenta } }],
            },
            select: SELECT_MOV,
          })
        : Promise.resolve([]),
      gtfsVenta.length ? ForestCtpDespachoDB.filasPnlDelPeriodo(tenantId, { gtfs: gtfsVenta }) : Promise.resolve([]),
      gtfsCompra.length
        ? prisma.woodEntry.findMany({ where: { ...whereCompra(tenantId), gtfNumber: { in: gtfsCompra } }, select: SELECT_COMPRA })
        : Promise.resolve([]),
    ]);
    const filasPnl = porId([...filasPnlVentana, ...filasPnlGuia]);
    const compras = porId([...comprasVentana, ...comprasGuia]);

    const ids = [...new Set(cuenta.map((m) => m.ctpEntryId).filter((x): x is string => Boolean(x)))];
    const filasCorridas = ids.length
      ? await prisma.forestCtpEntry.findMany({
          where: { tenantId, id: { in: ids } },
          select: { id: true, lineNo: true, speciesCommon: true, quantity: true, unit: true, aserrioDetalle: true, status: true, deletedAt: true },
        })
      : [];
    const corridas: CorridaEntrada[] = filasCorridas.map((c) => ({
      id: c.id,
      lineNo: c.lineNo,
      especie: c.speciesCommon?.trim() || null,
      pt: ptDeDetalle(c.aserrioDetalle),
      m3: (c.unit ?? "m3") === "m3" ? nOrNull(c.quantity) : null,
      viva: c.deletedAt == null && c.status === "registrado",
    }));

    return {
      hoy,
      ventas: ventas.map((s) => ({ id: s.id, createdAt: s.createdAt, total: n(s.total), totalCogs: nOrNull(s.totalCogs), payment: s.payment })),
      pedidos: pedidos.map((o) => ({
        id: o.id, createdAt: o.createdAt, deliveredAt: o.deliveredAt, total: n(o.total), totalCogs: nOrNull(o.totalCogs),
        status: o.status, deuda: o.deuda, cliente: o.customerName,
      })),
      cuenta: porId([...cuenta, ...ventasCuentaVentana, ...ventasCuentaGuia]).map((m) => ({ ...m, monto: n(m.monto) })),
      corridas,
      despachos: filasPnl.map((f) => ({ ...f, fecha: f.fecha ?? "" })),
      fletes: fletes.map((f) => ({
        id: f.id, fecha: f.fecha, tipoTransporte: f.tipoTransporte, pagaQuien: f.pagaQuien, monto: nOrNull(f.monto), moneda: f.moneda,
        estadoPago: f.estadoPago, fechaPago: f.fechaPago, gtfNumber: f.gtfNumber,
        quien: f.transportistaNombre?.trim() || f.proveedorNombre?.trim() || null, m3: nOrNull(f.volumenM3), pt: nOrNull(f.ptCobrado),
      })),
      gastos: gastos.map((g) => ({ ...g, amount: n(g.amount) })),
      planillas,
      ...(opciones.verPlanilla ? {} : { planillaOculta: true }),
      compras: compras.map((c) => ({
        id: c.id, gtfNumber: c.gtfNumber, entryDate: c.entryDate, costoTotal: nOrNull(c.costoTotal), moneda: c.moneda,
        proveedor: c.providerName, m3: nOrNull(c.volumeM3),
      })),
      mesesCerrados: cierres.filter((c) => !c.reabierto).map((c) => c.periodKey),
    };
  },

  /** Lo que la caja necesita para el mes `mes` (Lima), con ±1 día de margen. */
  async entradaCaja(tenantId: string, mes: string): Promise<EntradaCaja> {
    if (!tenantId) throw new Error("tenantId is required");
    const v = ventana(mes, mes);
    const enRango = { gte: v.gte, lt: v.lt };

    const [ventas, cuotasFiado, pedidos, cuenta, adelantos, codigos, gastos, fletes, movimientosCaja, entregas] = await Promise.all([
      prisma.sale.findMany({
        where: { tenantId, createdAt: enRango },
        select: { id: true, createdAt: true, total: true, totalCogs: true, payment: true },
      }),
      prisma.fiadoCuota.findMany({
        where: { fiado: { tenantId }, pagadoEn: enRango },
        select: { id: true, pagadoEn: true, monto: true, fiado: { select: { customer: { select: { name: true } } } } },
      }),
      prisma.order.findMany({
        where: { tenantId, deletedAt: null, status: "entregado", OR: [{ deliveredAt: enRango }, { deliveredAt: null, createdAt: enRango }] },
        select: { id: true, createdAt: true, deliveredAt: true, total: true, totalCogs: true, status: true, deuda: true, customerName: true },
      }),
      prisma.forestCuentaMov.findMany({
        where: { tenantId, deletedAt: null, fecha: enRango, OR: [{ concepto: { in: ["pago", "pago_hecho", "compensacion"] } }, { liquidacionId: { not: null } }] },
        select: {
          id: true, parteId: true, parteNombre: true, fecha: true, tipo: true, concepto: true, monto: true, moneda: true,
          referencia: true, ctpEntryId: true, liquidacionId: true, gtfNumber: true, notas: true,
        },
      }),
      // Los dos sentidos a propósito (ADR-448): lo DADO sale, lo RECIBIDO entra.
      prisma.adelanto.findMany({
        where: { tenantId, direccion: { in: ["DADO", "RECIBIDO"] }, status: { not: "CANCELADO" }, fechaAdelanto: enRango },
        select: { id: true, codigoOperacion: true, fechaAdelanto: true, montoAdelantado: true, moneda: true, direccion: true, beneficiario: { select: { nombre: true } } },
      }),
      // Todos los códigos (también cancelados): un retiro de caja sigue siendo el pago de su adelanto.
      prisma.adelanto.findMany({
        where: { tenantId, direccion: { in: ["DADO", "RECIBIDO"] }, codigoOperacion: { not: null } },
        select: { codigoOperacion: true },
      }),
      prisma.expense.findMany({
        where: { tenantId, recurring: false, OR: [{ paidAt: enRango }, { paidAt: null, date: enRango }] },
        select: SELECT_GASTO,
      }),
      prisma.forestFlete.findMany({
        where: { tenantId, deletedAt: null, pagaQuien: "ctp", estadoPago: "pagado", OR: [{ fechaPago: enRango }, { fechaPago: null, fecha: enRango }] },
        select: {
          id: true, fecha: true, tipoTransporte: true, pagaQuien: true, monto: true, moneda: true, estadoPago: true, fechaPago: true,
          gtfNumber: true, transportistaNombre: true, proveedorNombre: true, volumenM3: true, ptCobrado: true,
        },
      }),
      // `CashMovement` no lleva tenantId: el aislamiento va por su caja.
      prisma.cashMovement.findMany({
        where: { cashRegister: { tenantId }, type: { in: ["ingreso", "egreso"] }, createdAt: enRango },
        select: { id: true, type: true, amount: true, description: true, createdAt: true },
      }),
      prisma.adelantoEntrega.findMany({
        where: { adelanto: { tenantId }, anuladaAt: null, fecha: enRango },
        select: {
          id: true, fecha: true, valor: true, liquidacionId: true,
          adelanto: { select: { codigoOperacion: true, direccion: true, beneficiario: { select: { nombre: true } } } },
        },
      }),
    ]);

    // Las vivas del mes suman su pago; TODAS (también anuladas) sirven para
    // reconocer su movimiento de caja y su reversión en «sin sumar».
    const [liquidaciones, cajaDeLiquidaciones] = await Promise.all([
      prisma.liquidacionCuenta.findMany({
        where: { tenantId, anuladaAt: null, fecha: enRango },
        select: { id: true, codigo: true, fecha: true, pagoDireccion: true, pagoMonto: true, montoCompensado: true, personaNombre: true, cajaMovimientoId: true },
      }),
      movimientosCaja.length
        ? prisma.liquidacionCuenta.findMany({
            where: { tenantId },
            select: { codigo: true, cajaMovimientoId: true, cajaReversionId: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      ventas: ventas.map((s) => ({ id: s.id, createdAt: s.createdAt, total: n(s.total), totalCogs: nOrNull(s.totalCogs), payment: s.payment })),
      cuotasFiado: cuotasFiado
        .filter((c): c is typeof c & { pagadoEn: Date } => c.pagadoEn != null)
        .map((c) => ({ id: c.id, pagadoEn: c.pagadoEn, monto: n(c.monto), cliente: c.fiado?.customer?.name ?? null })),
      pedidos: pedidos.map((o) => ({
        id: o.id, createdAt: o.createdAt, deliveredAt: o.deliveredAt, total: n(o.total), totalCogs: nOrNull(o.totalCogs),
        status: o.status, deuda: o.deuda, cliente: o.customerName,
      })),
      cuenta: cuenta.map((m) => ({ ...m, monto: n(m.monto) })),
      liquidaciones: liquidaciones.map((l) => ({ ...l, pagoMonto: nOrNull(l.pagoMonto), montoCompensado: n(l.montoCompensado) })),
      adelantos: adelantos.map((a) => ({
        id: a.id, codigo: a.codigoOperacion, fechaAdelanto: a.fechaAdelanto, montoAdelantado: n(a.montoAdelantado), moneda: a.moneda,
        direccion: a.direccion, beneficiario: a.beneficiario?.nombre ?? null,
      })),
      codigosAdelanto: codigos.map((c) => c.codigoOperacion).filter((c): c is string => Boolean(c)),
      cajaDeLiquidaciones,
      gastos: gastos.map((g) => ({ ...g, amount: n(g.amount) })),
      fletes: fletes.map((f) => ({
        id: f.id, fecha: f.fecha, tipoTransporte: f.tipoTransporte, pagaQuien: f.pagaQuien, monto: nOrNull(f.monto), moneda: f.moneda,
        estadoPago: f.estadoPago, fechaPago: f.fechaPago, gtfNumber: f.gtfNumber,
        quien: f.transportistaNombre?.trim() || f.proveedorNombre?.trim() || null, m3: nOrNull(f.volumenM3), pt: nOrNull(f.ptCobrado),
      })),
      movimientosCaja: movimientosCaja.map((m) => ({ ...m, amount: n(m.amount) })),
      entregas: entregas.map((e) => ({
        id: e.id, fecha: e.fecha, valor: n(e.valor), liquidacionId: e.liquidacionId,
        adelantoCodigo: e.adelanto.codigoOperacion, direccion: e.adelanto.direccion, beneficiario: e.adelanto.beneficiario?.nombre ?? null,
      })),
    };
  },

  /** Lo que está pendiente HOY: cuentas, adelantos abiertos, fiados, por pagar y la planilla (≈). */
  async pendientes(tenantId: string, hoy: string, opciones: OpcionesLectura = SIN_PLANILLA): Promise<EntradaViene> {
    if (!tenantId) throw new Error("tenantId is required");
    const mes = hoy.slice(0, 7);
    const v = ventana(mes, mes);

    const [movs, adelantos, fiados, payables, personalDelMes, ganado] = await Promise.all([
      prisma.forestCuentaMov.findMany({
        where: { tenantId, deletedAt: null },
        select: { parteId: true, parteNombre: true, tipo: true, monto: true, fecha: true, moneda: true },
      }),
      // Los dos sentidos (ADR-448): lo DADO es «te deben»; lo RECIBIDO se cruza al liquidar.
      prisma.adelanto.findMany({
        where: { tenantId, direccion: { in: ["DADO", "RECIBIDO"] }, status: "ABIERTO", saldoPendiente: { gt: 0 } },
        select: {
          id: true, codigoOperacion: true, direccion: true, saldoPendiente: true, moneda: true, fechaVencimiento: true,
          beneficiarioId: true, beneficiario: { select: { nombre: true } },
        },
      }),
      prisma.fiado.findMany({
        where: { tenantId, status: { in: ["ACTIVO", "VENCIDO"] }, saldo: { gt: 0 } },
        select: { id: true, saldo: true, fechaVence: true, customer: { select: { name: true } } },
      }),
      prisma.payable.findMany({
        where: { tenantId, status: { in: ["pendiente", "parcial"] } },
        select: { id: true, amount: true, paidAmount: true, dueDate: true, supplierName: true },
      }),
      // Sueldos: sólo para quien ve lo ganado de RRHH.
      opciones.verPlanilla
        ? prisma.expense.aggregate({
            where: { tenantId, recurring: false, category: "personal", date: { gte: v.gte, lt: v.lt } },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
      opciones.verPlanilla
        ? GanadoDB.periodo(tenantId, { desde: `${mes}-01`, hasta: hoy, hoy }).catch((err) => {
            logger.error("[resultado-negocio] no se pudo calcular la planilla por pagar", { error: String(err), tenantId });
            return null;
          })
        : Promise.resolve(null),
    ]);

    return {
      // Sólo soles: un saldo en dólares no se suma a lo que te deben en soles.
      saldosCuenta: saldosPorParte(movs.filter((m) => esPen(m.moneda))).map((s) => ({ parteId: s.parteId, nombre: s.nombre, saldo: s.saldo })),
      otrasMonedasCuenta: otrasMonedasDeCuenta(movs),
      adelantos: adelantos.map((a) => ({
        id: a.id, codigo: a.codigoOperacion, direccion: a.direccion, saldoPendiente: n(a.saldoPendiente), moneda: a.moneda,
        fechaVencimiento: a.fechaVencimiento, beneficiario: a.beneficiario?.nombre ?? null, beneficiarioId: a.beneficiarioId,
      })),
      fiados: fiados.map((f) => ({ id: f.id, saldo: n(f.saldo), fechaVence: f.fechaVence, cliente: f.customer?.name ?? null })),
      payables: payables.map((p) => ({ id: p.id, pendiente: Math.max(0, n(p.amount) - n(p.paidAmount)), dueDate: p.dueDate, proveedor: p.supplierName })),
      planillaPorPagar: !opciones.verPlanilla
        ? "sin_permiso"
        : ganado && ganado.personas.length > 0
          ? { monto: Math.round((ganado.total - n(personalDelMes?._sum.amount ?? 0)) * 100) / 100, personas: ganado.personas.length }
          : null,
    };
  },

  /** `GET /api/finanzas/resultado`: el mes pedido y la tira de `meses` que termina en él. */
  async resultado(tenantId: string, mes: string, meses: number, hoy: string, opciones: OpcionesLectura): Promise<RespuestaResultado> {
    if (!tenantId) throw new Error("tenantId is required");
    return getOrSet(`${claveCacheResultado(tenantId)}:resultado:${mes}:${meses}:${hoy}:${sufijo(opciones)}`, TTL_S, async () => {
      const serieMeses = mesesHasta(mes, meses);
      const e = await ResultadoNegocioDB.entradaDelPeriodo(tenantId, serieMeses[0], mes, hoy, opciones);
      return { actual: armarResultado(mes, e), serie: armarSerie(serieMeses, e), generadoEn: new Date().toISOString() };
    });
  },

  /** `GET /api/finanzas/resultado/detalle`: las filas de UNA fuente, las mismas que suman su renglón. */
  async detalle(tenantId: string, mes: string, fuente: FuenteDetalle, hoy: string, opciones: OpcionesLectura): Promise<RespuestaDetalle> {
    if (!tenantId) throw new Error("tenantId is required");
    return getOrSet(`${claveCacheResultado(tenantId)}:detalle:${mes}:${fuente}:${hoy}:${sufijo(opciones)}`, TTL_S, async () => {
      if (esFuenteDeCaja(fuente)) return detalleDeCaja(mes, fuente, await ResultadoNegocioDB.entradaCaja(tenantId, mes));
      return detalleDeResultado(mes, fuente, await ResultadoNegocioDB.entradaDelPeriodo(tenantId, mes, mes, hoy, opciones));
    });
  },

  /** `GET /api/finanzas/caja-del-negocio`: lo que entró y salió en el mes, y lo que viene. */
  async caja(tenantId: string, mes: string, hoy: string, opciones: OpcionesLectura): Promise<RespuestaCaja> {
    if (!tenantId) throw new Error("tenantId is required");
    return getOrSet(`${claveCacheResultado(tenantId)}:caja:${mes}:${hoy}:${sufijo(opciones)}`, TTL_S, async () => {
      const [entrada, pendientes] = await Promise.all([
        ResultadoNegocioDB.entradaCaja(tenantId, mes),
        ResultadoNegocioDB.pendientes(tenantId, hoy, opciones),
      ]);
      return { caja: armarCaja(mes, entrada), viene: loQueViene(pendientes), generadoEn: new Date().toISOString() };
    });
  },

  // ─── Proyección de 13 semanas (`lib/finance/cashflow-rolling.ts`) ──────────
  // Las mismas consultas que tenía la proyección, sin cambiar ni un `where`.

  proyeccion: {
    async saldosTesoreria(tenantId: string): Promise<{ saldo: Parameters<typeof toNumOrZero>[0] }[]> {
      if (!tenantId) throw new Error("tenantId is required");
      return prisma.treasuryCuenta.findMany({ where: { tenantId, activa: true }, select: { saldo: true } });
    },

    /** Fallback grueso del saldo inicial: ventas y gastos desde `desde`. */
    async netoDesde(tenantId: string, desde: Date): Promise<{ ventas: number; gastos: number }> {
      if (!tenantId) throw new Error("tenantId is required");
      const [salesAgg, expensesAgg] = await Promise.all([
        prisma.sale.aggregate({ where: { tenantId, createdAt: { gte: desde } }, _sum: { total: true } }),
        prisma.expense.aggregate({ where: { tenantId, date: { gte: desde } }, _sum: { amount: true } }),
      ]);
      return { ventas: toNumOrZero(salesAgg._sum.total), gastos: toNumOrZero(expensesAgg._sum.amount) };
    },

    async pedidosPendientes(tenantId: string, desde: Date, hasta: Date) {
      if (!tenantId) throw new Error("tenantId is required");
      return prisma.order.findMany({
        where: { tenantId, status: { in: ["pendiente", "confirmado"] }, createdAt: { gte: desde, lt: hasta } },
        select: { total: true, createdAt: true },
      });
    },

    async fiadosQueVencen(tenantId: string, desde: Date, hasta: Date) {
      if (!tenantId) throw new Error("tenantId is required");
      return prisma.fiado.findMany({
        where: { tenantId, status: "ACTIVO", fechaVence: { gte: desde, lt: hasta } },
        select: { saldo: true, fechaVence: true },
      });
    },

    async payablesQueVencen(tenantId: string, desde: Date, hasta: Date) {
      if (!tenantId) throw new Error("tenantId is required");
      return prisma.payable.findMany({
        where: { tenantId, status: { in: ["pendiente", "parcial"] }, dueDate: { gte: desde, lt: hasta } },
        select: { amount: true, paidAmount: true, dueDate: true },
      });
    },

    async cuotasQueVencen(tenantId: string, desde: Date, hasta: Date) {
      if (!tenantId) throw new Error("tenantId is required");
      return prisma.prestamoCuota.findMany({
        where: { pagadoEn: null, fechaVence: { gte: desde, lt: hasta }, prestamo: { tenantId, status: "ACTIVO" } },
        select: { monto: true, fechaVence: true },
      });
    },

    /** Σ gastos de `personal` desde `desde` (la nómina estimada). */
    async gastoPersonalDesde(tenantId: string, desde: Date): Promise<number> {
      if (!tenantId) throw new Error("tenantId is required");
      const agg = await prisma.expense.aggregate({ where: { tenantId, category: "personal", date: { gte: desde } }, _sum: { amount: true } });
      return toNumOrZero(agg._sum.amount);
    },

    /** Σ gastos fijos (`recurring`) que no son de personal, desde `desde`. */
    async gastoRecurrenteDesde(tenantId: string, desde: Date): Promise<number> {
      if (!tenantId) throw new Error("tenantId is required");
      const agg = await prisma.expense.aggregate({
        where: { tenantId, recurring: true, category: { notIn: ["personal"] }, date: { gte: desde } },
        _sum: { amount: true },
      });
      return toNumOrZero(agg._sum.amount);
    },

    /** ADR-451: adelantos DADOS abiertos, con y sin vencimiento (ADR-448: sólo lo DADO se cobra). */
    async adelantosAbiertos(tenantId: string) {
      if (!tenantId) throw new Error("tenantId is required");
      return prisma.adelanto.findMany({
        where: { tenantId, ...SOLO_DADOS, status: "ABIERTO", saldoPendiente: { gt: 0 }, moneda: "PEN" },
        select: { saldoPendiente: true, fechaVencimiento: true },
      });
    },

    /**
     * ADR-451: fiados vivos que ninguna semana muestra — sin fecha pactada, ya
     * vencidos antes de la ventana, o marcados VENCIDO (la proyección sólo lee ACTIVO).
     */
    async fiadosFueraDeLaVentana(tenantId: string, antes: Date): Promise<{ monto: number; cuantos: number }> {
      if (!tenantId) throw new Error("tenantId is required");
      const agg = await prisma.fiado.aggregate({
        where: {
          tenantId,
          status: { in: ["ACTIVO", "VENCIDO"] },
          saldo: { gt: 0 },
          OR: [{ fechaVence: null }, { fechaVence: { lt: antes } }, { status: "VENCIDO" }],
        },
        _sum: { saldo: true },
        _count: true,
      });
      return { monto: toNumOrZero(agg._sum.saldo), cuantos: agg._count };
    },

    /** ADR-451: por pagar que ya venció antes de la ventana (tampoco cae en ninguna semana). */
    async payablesVencidosAntes(tenantId: string, antes: Date): Promise<{ monto: number; cuantos: number }> {
      if (!tenantId) throw new Error("tenantId is required");
      const filas = await prisma.payable.findMany({
        where: { tenantId, status: { in: ["pendiente", "parcial"] }, dueDate: { lt: antes } },
        select: { amount: true, paidAmount: true },
      });
      const monto = filas.reduce((a, p) => a + Math.max(0, toNumOrZero(p.amount) - toNumOrZero(p.paidAmount)), 0);
      return { monto: Math.round(monto * 100) / 100, cuantos: filas.length };
    },

    /** ADR-451: ≈ lo ganado en RRHH entre `desde` y `hoy` (FechaKey). `null` = sin personal o falló. */
    async ganadoRrhh(tenantId: string, desde: string, hoy: string): Promise<number | null> {
      if (!tenantId) throw new Error("tenantId is required");
      try {
        const g = await GanadoDB.periodo(tenantId, { desde, hasta: hoy, hoy });
        return g.personas.length > 0 ? g.total : null;
      } catch (err) {
        logger.error("[resultado-negocio] ganado de RRHH para la proyección falló", { error: String(err), tenantId });
        return null;
      }
    },
  },
};

/** Los meses de `desde` a `hasta` (ambos incluidos, `YYYY-MM`). */
function mesesEntre(desde: string, hasta: string): string[] {
  const [y1, m1] = desde.split("-").map(Number);
  const [y2, m2] = hasta.split("-").map(Number);
  const cuantos = (y2 - y1) * 12 + (m2 - m1) + 1;
  return cuantos > 0 ? mesesHasta(hasta, cuantos) : [hasta];
}

/** El mes y el día de hoy en Lima (lo usan las rutas para no mirar el reloj dos veces). */
export function hoyDeLima(ahora: Date = new Date()): { hoy: string; mes: string } {
  return { hoy: limaDateKey(ahora), mes: mesLima(ahora) };
}
