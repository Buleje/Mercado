/**
 * lib/caja/parte-del-dia.ts
 *
 * El «parte del día» de una caja: de dónde vino y a dónde fue el efectivo
 * (por origen), el esperado contra lo contado y la conciliación contra las
 * VENTAS del sistema en el mismo tramo (apertura → cierre o ahora).
 *
 * Las cuentas viven acá y corren en el servidor (`GET /api/cash-registers/
 * [id]/parte`): la pantalla sólo muestra. El esperado es el mismo de siempre
 * (`saldoEsperadoDeCaja`): sólo efectivo; Yape/tarjeta van en `otrosMedios`.
 *
 * Conciliar = cruzar cada venta del tramo con los movimientos `venta` de la
 * caja por `saleId`. Una venta sin movimiento es plata que el sistema vendió
 * y el cajón no registró (se vendió con la caja cerrada, o falló el anotado).
 */

import { desglosarPago, efectivoDe } from "./desglosar-pago";
import { medioDeMovimiento, saldoEsperadoDeCaja } from "./saldo-esperado";
import { ETIQUETA_ORIGEN, ORDEN_ORIGEN, origenDeMovimiento, type OrigenClave } from "./origen-movimiento";

export interface MovimientoParaParte {
  type: string;
  amount: number;
  method?: string | null;
  description?: string | null;
  saleId?: string | null;
  liquidacionCodigo?: string | null;
}

export interface CajaParaParte {
  id: string;
  status: string;
  openedAt: string;
  closedAt?: string | null;
  openingAmount: number;
  closingAmount?: number | null;
  expectedAmount?: number | null;
  /** «Cierre automático (turno zombie…)» = el cron cerró con un conteo inventado: no hay contado. */
  notes?: string | null;
  movements: ReadonlyArray<MovimientoParaParte>;
}

export interface VentaParaParte {
  id: string;
  total: number;
  payment: string;
  paymentDetails: string | null;
  createdAt: string;
}

export interface LineaDeOrigen {
  clave: OrigenClave;
  etiqueta: string;
  n: number;
  /** Efectivo que entró al cajón por este origen. */
  entraEfectivo: number;
  /** Efectivo que salió del cajón por este origen. */
  saleEfectivo: number;
  /** Lo que pasó por Yape, tarjeta, transferencia… (no toca el cajón). */
  otrosMedios: number;
}

export interface VentaSinCaja {
  id: string;
  total: number;
  efectivo: number;
  medio: string;
  createdAt: string;
}

export interface ConciliacionConVentas {
  ventasSistema: { n: number; total: number; efectivo: number };
  ventasEnCaja: { n: number; total: number; efectivo: number };
  sinCaja: { n: number; total: number; efectivo: number; muestra: VentaSinCaja[] };
  /** Efectivo vendido según el sistema − efectivo anotado en la caja. */
  diferenciaEfectivo: number;
  cuadra: boolean;
  /** La consulta de ventas llegó al tope: las cifras son un piso. */
  truncado: boolean;
}

export interface ParteDelDia {
  cajaId: string;
  estado: string;
  abiertaEn: string;
  cerradaEn: string | null;
  apertura: number;
  ventasEfectivo: number;
  ingresos: number;
  egresos: number;
  esperado: number;
  contado: number | null;
  diferencia: number | null;
  porOrigen: LineaDeOrigen[];
  conciliacion: ConciliacionConVentas;
}

const r2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const MUESTRA_SIN_CAJA = 20;

export function armarParteDelDia(
  caja: CajaParaParte,
  ventas: ReadonlyArray<VentaParaParte>,
  opciones: { truncado?: boolean; tolerancia?: number } = {},
): ParteDelDia {
  const tolerancia = opciones.tolerancia ?? 0.5;
  const saldo = saldoEsperadoDeCaja(caja.openingAmount, caja.movements);
  const cerrada = caja.status === "cerrada";
  const esperado = r2(cerrada && caja.expectedAmount != null ? caja.expectedAmount : saldo.esperado);
  const cierreAutomatico = /^Cierre autom[aá]tico/i.test(caja.notes ?? "");
  const contado = cerrada && !cierreAutomatico && caja.closingAmount != null ? r2(caja.closingAmount) : null;

  return {
    cajaId: caja.id,
    estado: caja.status,
    abiertaEn: caja.openedAt,
    cerradaEn: caja.closedAt ?? null,
    apertura: r2(saldo.apertura),
    ventasEfectivo: r2(saldo.ventasEfectivo),
    ingresos: r2(saldo.ingresos),
    egresos: r2(saldo.egresos),
    esperado,
    contado,
    diferencia: contado == null ? null : r2(contado - esperado),
    porOrigen: lineasPorOrigen(caja),
    conciliacion: conciliar(caja.movements, ventas, tolerancia, opciones.truncado ?? false),
  };
}

function lineasPorOrigen(caja: CajaParaParte): LineaDeOrigen[] {
  const mapa = new Map<OrigenClave, LineaDeOrigen>();
  const linea = (clave: OrigenClave) => {
    let l = mapa.get(clave);
    if (!l) {
      l = { clave, etiqueta: ETIQUETA_ORIGEN[clave], n: 0, entraEfectivo: 0, saleEfectivo: 0, otrosMedios: 0 };
      mapa.set(clave, l);
    }
    return l;
  };
  // Registros viejos sin movimiento de apertura: el fondo igual entra al cajón.
  if (!caja.movements.some((m) => m.type === "apertura")) {
    const l = linea("apertura");
    l.n += 1;
    l.entraEfectivo += caja.openingAmount;
  }
  for (const m of caja.movements) {
    if (m.type === "cierre" || m.type === "arqueo") continue;
    const { clave } = origenDeMovimiento(m);
    const l = linea(clave);
    l.n += 1;
    const monto = Number(m.amount) || 0;
    if (m.type === "apertura") {
      // El fondo de apertura vale lo que dice la caja (es lo que usa el esperado).
      l.entraEfectivo += caja.openingAmount;
      continue;
    }
    if (medioDeMovimiento(m.method) !== "efectivo") {
      l.otrosMedios += m.type === "egreso" ? -monto : monto;
    } else if (m.type === "egreso") {
      l.saleEfectivo += monto;
    } else {
      l.entraEfectivo += monto;
    }
  }
  return ORDEN_ORIGEN.flatMap((clave) => {
    const l = mapa.get(clave);
    return l ? [{ ...l, entraEfectivo: r2(l.entraEfectivo), saleEfectivo: r2(l.saleEfectivo), otrosMedios: r2(l.otrosMedios) }] : [];
  });
}

function conciliar(
  movimientos: ReadonlyArray<MovimientoParaParte>,
  ventas: ReadonlyArray<VentaParaParte>,
  tolerancia: number,
  truncado: boolean,
): ConciliacionConVentas {
  const ventasCaja = movimientos.filter((m) => m.type === "venta");
  const idsEnCaja = new Set(ventasCaja.map((m) => m.saleId).filter((id): id is string => !!id));
  const enCaja = {
    n: idsEnCaja.size + ventasCaja.filter((m) => !m.saleId).length,
    total: r2(ventasCaja.reduce((s, m) => s + (Number(m.amount) || 0), 0)),
    efectivo: r2(
      ventasCaja.filter((m) => medioDeMovimiento(m.method) === "efectivo").reduce((s, m) => s + (Number(m.amount) || 0), 0),
    ),
  };

  let total = 0;
  let efectivo = 0;
  const sinCaja: VentaSinCaja[] = [];
  let sinCajaTotal = 0;
  let sinCajaEfectivo = 0;
  for (const v of ventas) {
    const ef = efectivoDe(desglosarPago(v.payment, v.paymentDetails, v.total));
    total += v.total;
    efectivo += ef;
    if (!idsEnCaja.has(v.id)) {
      sinCajaTotal += v.total;
      sinCajaEfectivo += ef;
      sinCaja.push({ id: v.id, total: r2(v.total), efectivo: r2(ef), medio: medioDeMovimiento(v.payment), createdAt: v.createdAt });
    }
  }
  const diferenciaEfectivo = r2(efectivo - enCaja.efectivo);
  return {
    ventasSistema: { n: ventas.length, total: r2(total), efectivo: r2(efectivo) },
    ventasEnCaja: enCaja,
    sinCaja: { n: sinCaja.length, total: r2(sinCajaTotal), efectivo: r2(sinCajaEfectivo), muestra: sinCaja.slice(0, MUESTRA_SIN_CAJA) },
    diferenciaEfectivo,
    cuadra: sinCaja.length === 0 && Math.abs(diferenciaEfectivo) <= tolerancia,
    truncado,
  };
}
