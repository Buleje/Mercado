/**
 * lib/finance/cuentas-del-periodo.ts — la regla de «Cuentas» (ADR-527): qué
 * movimiento de plata entra en la lista, de qué lado va y cuánto suma.
 *
 * PURO y client-safe: recibe las filas que trajo `lib/db/cuentas-movimientos.db.ts`
 * y decide el periodo, los totales, lo que se descarta por estar contado en otro
 * lado y lo que se le debe al negocio. El contrato vive en `cuentas-tipos.ts`.
 *
 * Cada peso una vez (medido en Blas el 01-11-2026, ver el ADR):
 *  - La venta del POS se cuenta por `Sale`; su movimiento «venta» de caja (con
 *    `saleId`) es la otra cara y no se suma (Blas: 6 ventas = 1.070, la caja
 *    anotó 5 = 1.020 porque una se vendió sin caja abierta).
 *  - El gasto pagado de la caja se cuenta por `Expense`; su retiro lleva el id
 *    `gasto-caja-<gasto>` y no se suma mientras el gasto exista. Si el gasto se
 *    borró, el retiro y su «Gasto borrado» quedan y se anulan entre sí.
 *  - El adelanto se cuenta por `Adelanto`; su «Adelanto …» y su «Anulación de
 *    adelanto …» de caja no se suman (la misma regla que la caja de ADR-451).
 *    La «Liquidación de adelanto …» es plata que VOLVIÓ: ingreso.
 *  - Apertura, arqueo y cierre de caja no son plata nueva.
 *  - El cobro de un fiado se cuenta por `FiadoCuota` (se guarda aunque no haya
 *    caja abierta); su «Cobro de fiado · …» de caja no se suma.
 *  - El pago de una cuenta por pagar se cuenta por `Payment` (efectivo o
 *    transferencia); su «Pago a proveedor · …» de caja no se suma.
 *  - El pago de la semana de RRHH guarda el gasto por el BRUTO y saca de caja el
 *    NETO: lo descontado de un adelanto ya salió al darlo, así que suma el neto.
 *  - La liquidación de una cuenta (ADR-413) se cuenta por su cabecera: el pago,
 *    una vez, haya pasado por la caja o no; su «Liquidación LIQ-…» de caja no
 *    se suma (main, sep: 2.986,40 + 500 pagados sin caja).
 *  - El pedido entra cuando es plata cobrada: entregado y no a cuenta, en el día
 *    de la entrega (`esPedidoCobrado`, la misma regla de la caja del mes).
 */

import type {
  CuentasDelPeriodo,
  DeudorCuenta,
  FuenteCuenta,
  GrupoCuenta,
  MovimientoCuenta,
  PeriodoCuentas,
} from "@/lib/finance/cuentas-tipos";
import { TOPE_MOVIMIENTOS } from "@/lib/finance/cuentas-tipos";
import {
  esDevolucionDeAdelantoAnulado, esPedidoCobrado, fechaDeCobroDelPedido, gastoYaSalio, netoDelGasto,
} from "@/lib/finance/resultado-del-negocio";
import { mesLima, rangoDelMesLima } from "@/lib/finance/ingresos-del-periodo";
import { limaDateKey, limaDayRange } from "@/lib/utils";

/**
 * Quién ve Cuentas: admin, dueño y encargado. NO el cajero, aunque
 * `/api/admin/finance-aggregates` lo deje pasar: Cuentas muestra cada adelanto
 * con nombre y lo que debe cada persona, y la matriz de adelantos
 * (`lib/adelantos/permisos.ts`) no le da `read` al cajero.
 */
export const ROLES_CUENTAS = ["admin", "owner", "manager"] as const;

const DIA_MS = 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
// Periodo
// ═══════════════════════════════════════════════════════════════════════════

export interface RangoCuentas {
  periodo: PeriodoCuentas;
  /** Primer día de Lima (YYYY-MM-DD); null en «todo». */
  desde: string | null;
  /** Hoy en Lima. */
  hasta: string;
  /** Primer instante (00:00 de Lima de `desde`); null en «todo». */
  inicio: Date | null;
  /** Fin exclusivo: 00:00 de Lima de mañana. */
  fin: Date;
}

/** El lunes de Lima de la semana de `hoy` (YYYY-MM-DD). */
function lunesDe(hoy: string): string {
  const ms = Date.parse(`${hoy}T12:00:00.000Z`);
  const dow = new Date(ms).getUTCDay(); // 0 = domingo
  const atras = dow === 0 ? 6 : dow - 1;
  return new Date(ms - atras * DIA_MS).toISOString().slice(0, 10);
}

/**
 * semana = desde el lunes de Lima · mes = desde el día 1 de Lima (el mismo corte
 * de las 05:00 UTC que `rangoDelMesLima`) · todo = sin límite. Termina hoy.
 */
export function rangoDelPeriodo(periodo: PeriodoCuentas, ahora: Date = new Date()): RangoCuentas {
  const hasta = limaDateKey(ahora);
  const fin = limaDayRange(hasta).end;
  if (periodo === "todo") return { periodo, desde: null, hasta, inicio: null, fin };
  if (periodo === "mes") {
    const mes = mesLima(ahora);
    return { periodo, desde: `${mes}-01`, hasta, inicio: rangoDelMesLima(mes).start, fin };
  }
  const desde = lunesDe(hasta);
  return { periodo, desde, hasta, inicio: limaDayRange(desde).start, fin };
}

/**
 * La ventana que pide la base para las fuentes guardadas como FECHA: un día de
 * más a cada lado. «2026-11-01» se guarda a las 00:00 UTC, que es ANTES del
 * 01-11 05:00 UTC; el corte fino lo hace `diaDe` acá.
 */
export function ventanaAncha(r: Pick<RangoCuentas, "inicio" | "fin">): { gte?: Date; lt: Date } {
  return r.inicio
    ? { gte: new Date(r.inicio.getTime() - DIA_MS), lt: new Date(r.fin.getTime() + DIA_MS) }
    : { lt: new Date(r.fin.getTime() + DIA_MS) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Fecha y hora de cada fila
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `instante` = createdAt de verdad (ventas, caja, tesorería): siempre a Lima.
 * `fecha` = lo que la persona escribió como día (gasto, adelanto, alquiler,
 * máquina): puede haberse guardado sin hora.
 */
export type ClaseFecha = "instante" | "fecha";

/**
 * Cómo se guarda un día sin hora: 00:00 UTC (formularios con `new Date("AAAA-MM-DD")`
 * y columnas `@db.Date`), 05:00 UTC (medianoche de Lima), 12:00 UTC (mediodía
 * UTC) o 17:00 UTC (mediodía de Lima: el alta de adelantos, `T12:00:00-05:00`).
 * Siempre con minutos, segundos y milisegundos en cero.
 */
const HORAS_SIN_HORA = new Set([0, 5, 12, 17]);

export function guardadoSinHora(d: Date): boolean {
  return (
    HORAS_SIN_HORA.has(d.getUTCHours()) &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

/**
 * El día de Lima y si tiene hora. Un día sin hora es su fecha UTC (a las 00:00
 * UTC pasarlo a Lima lo corría al día anterior; ver `diaDeFecha` de ADR-451) y
 * su `cuando` se fija al mediodía de Lima para que la pantalla, al pasarlo a
 * Lima, caiga en el mismo día.
 */
export function diaDe(v: Date | string, clase: ClaseFecha): { dia: string; cuando: string; conHora: boolean } | null {
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  if (clase === "fecha" && guardadoSinHora(d)) {
    const dia = d.toISOString().slice(0, 10);
    return { dia, cuando: `${dia}T17:00:00.000Z`, conHora: false };
  }
  return { dia: limaDateKey(d), cuando: d.toISOString(), conHora: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Filas crudas (lo que arma la DB class) y la caja
// ═══════════════════════════════════════════════════════════════════════════

export interface FilaCruda {
  /** Id original (sin prefijo de fuente). */
  id: string;
  fuente: FuenteCuenta;
  grupo: GrupoCuenta;
  tipo: string;
  fecha: Date | string;
  clase: ClaseFecha;
  persona: string;
  detalle: string;
  monto: number;
  moneda: string;
}

export interface MovCajaCrudo {
  id: string;
  type: string;
  amount: number;
  description: string;
  saleId: string | null;
  createdAt: Date | string;
}

/** Prefijo del id del retiro de caja de un gasto (`idRetiroDeGasto`, `lib/caja/egreso-de-caja.ts`). */
export const PREFIJO_RETIRO_DE_GASTO = "gasto-caja-";
const SUFIJO_DEVOLUCION_DE_GASTO = "-devuelto";

/** El gasto al que pertenece un retiro (o su devolución) de caja; null si no es de un gasto. */
export function gastoDelRetiro(idMovimiento: string): string | null {
  if (!idMovimiento.startsWith(PREFIJO_RETIRO_DE_GASTO)) return null;
  const resto = idMovimiento.slice(PREFIJO_RETIRO_DE_GASTO.length);
  return resto.endsWith(SUFIJO_DEVOLUCION_DE_GASTO) ? resto.slice(0, -SUFIJO_DEVOLUCION_DE_GASTO.length) : resto;
}

/** Etiquetas de `lib/adelantos/movimiento-caja.ts` que son la otra cara de una fila de `Adelanto`. */
const ES_CARA_DEL_ADELANTO = /^(adelanto|anulaci[oó]n de adelanto)\b/i;
const ES_DEVOLUCION_DE_ADELANTO = /^liquidaci[oó]n de adelanto\b/i;
const ES_DEVOLUCION_DE_RECIBIDO = /^devoluci[oó]n de adelanto recibido\b/i;
const ES_LIQUIDACION = /^(anulaci[oó]n de )?liquidaci[oó]n\b/i;
/** `etiquetaPagoAProveedor` (`lib/caja/egreso-de-caja.ts`): la otra cara de un `Payment`. */
export const ES_PAGO_A_PROVEEDOR = /^pago a proveedor\b/i;
/** `etiquetaCobroFiado` (`lib/fiados/cobro-metodo.ts`): la otra cara de una `FiadoCuota`. */
export const ES_COBRO_DE_FIADO = /^cobro de fiado\b/i;

/**
 * «Etiqueta · persona · …» → «persona». Las anotaciones a mano de la caja usan
 * «Motivo — detalle»: también corta ahí.
 */
const segundoTramo = (s: string) => s.split(/ · | — /)[1]?.trim() ?? "";

const TIPOS_DE_CAJA_QUE_NO_SON_PLATA = new Set(["apertura", "cierre", "arqueo"]);

/**
 * Un movimiento de caja → su fila, o `null` si no es plata nueva o ya está
 * contado en otra tabla.
 */
export interface ContextoCaja {
  /** Ids de los `Expense` reales (no plantilla) a los que apuntan los retiros de la caja. */
  gastosVivos: ReadonlySet<string>;
  /**
   * Códigos de los adelantos ANULADOS. Su devolución parcial en plata tampoco
   * se suma: el adelanto, su salida y su anulación ya quedaron fuera, y sumar
   * solo la devolución inventaba un ingreso (main, ADL-2026-0038: salieron 400,
   * volvieron 100 + 300 al anular → 0, no +100).
   */
  adelantosAnulados: ReadonlySet<string>;
}

/** «Liquidación de adelanto ADL-2026-0001 · …» → «ADL-2026-0001». */
const CODIGO_DE_DEVOLUCION = /^(?:liquidaci[oó]n de adelanto|devoluci[oó]n de adelanto recibido)\s+([^\s·]+)/i;
export const codigoDeDevolucion = (descripcion: string): string | null =>
  CODIGO_DE_DEVOLUCION.exec((descripcion ?? "").trim())?.[1] ?? null;

export function filaDeCaja(m: MovCajaCrudo, { gastosVivos, adelantosAnulados }: ContextoCaja): FilaCruda | null {
  const type = m.type.trim().toLowerCase();
  if (TIPOS_DE_CAJA_QUE_NO_SON_PLATA.has(type)) return null;
  if (type !== "venta" && type !== "ingreso" && type !== "egreso") return null;
  const texto = (m.description ?? "").trim();
  const base = { id: m.id, fuente: "caja" as const, fecha: m.createdAt, clase: "instante" as const, monto: m.amount, moneda: "PEN" };

  if (type === "venta") {
    if (m.saleId) return null; // la cuenta la fila de `Sale`
    return { ...base, grupo: "ingresos", tipo: "Venta en caja", persona: "", detalle: texto };
  }
  const gasto = gastoDelRetiro(m.id);
  if (gasto !== null && gastosVivos.has(gasto)) return null; // la cuenta la fila de `Expense`
  if (ES_CARA_DEL_ADELANTO.test(texto)) return null; // la cuenta `Adelanto` (también «Adelanto recibido …»)
  if (ES_COBRO_DE_FIADO.test(texto)) return null; // la cuenta `FiadoCuota`
  if (ES_PAGO_A_PROVEEDOR.test(texto)) return null; // la cuenta `Payment`
  // La cuenta la cabecera `LiquidacionCuenta` (su pago, una vez, pase o no por la caja);
  // la de una anulada no suma y su reversión de caja tampoco.
  if (ES_LIQUIDACION.test(texto) && !ES_DEVOLUCION_DE_ADELANTO.test(texto)) return null;

  if (esDevolucionDeAdelantoAnulado(codigoDeDevolucion(texto), adelantosAnulados)) return null;

  const entra = type === "ingreso";
  const grupo: GrupoCuenta = entra ? "ingresos" : "gastos";
  if (ES_DEVOLUCION_DE_ADELANTO.test(texto)) {
    return { ...base, grupo, tipo: "Te devolvieron un adelanto", persona: segundoTramo(texto), detalle: texto };
  }
  if (ES_DEVOLUCION_DE_RECIBIDO.test(texto)) {
    return { ...base, grupo, tipo: "Devolviste un adelanto", persona: segundoTramo(texto), detalle: texto };
  }
  if (gasto !== null) {
    return { ...base, grupo, tipo: entra ? "Gasto borrado (volvió a la caja)" : "Gasto de caja", persona: "", detalle: texto };
  }
  return { ...base, grupo, tipo: entra ? "Ingreso de caja" : "Salida de caja", persona: "", detalle: texto };
}

// ═══════════════════════════════════════════════════════════════════════════
// Fuentes con regla propia (la DB class arma con esto; los tests lo prueban)
// ═══════════════════════════════════════════════════════════════════════════

const unir = (...partes: Array<string | null | undefined>) =>
  partes.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");

export interface PedidoCrudo {
  id: string;
  total: number;
  status: string;
  deuda: boolean | null;
  deliveredAt: Date | string | null;
  createdAt: Date | string;
  customerName: string | null;
  paymentMethod: string | null;
}

/** El pedido como plata cobrada, o `null` si todavía no lo es (confirmado, en camino, a cuenta). */
export function filaDePedido(p: PedidoCrudo): FilaCruda | null {
  if (!esPedidoCobrado(p)) return null;
  return {
    id: p.id, fuente: "venta", grupo: "ingresos", tipo: "Pedido", fecha: fechaDeCobroDelPedido(p), clase: "instante",
    persona: p.customerName ?? "", detalle: unir("Pedido entregado", p.paymentMethod), monto: p.total, moneda: "PEN",
  };
}

/** Liquidación de una cuenta (ADR-413) viva: su pago, en el sentido en que fue. Sin pago (solo cruce) no es plata. */
export function filaDeLiquidacion(l: {
  id: string; codigo: string; fecha: Date | string; pagoDireccion: string | null; pagoMonto: number | null; persona: string;
}): FilaCruda | null {
  if (l.pagoMonto == null || !(l.pagoMonto > 0)) return null;
  if (l.pagoDireccion !== "recibido" && l.pagoDireccion !== "hecho") return null;
  const entra = l.pagoDireccion === "recibido";
  return {
    id: l.id, fuente: "adelanto", grupo: entra ? "ingresos" : "gastos", tipo: entra ? "Liquidación (entró)" : "Liquidación pagada",
    fecha: l.fecha, clase: "fecha", persona: l.persona, detalle: l.codigo, monto: l.pagoMonto, moneda: "PEN",
  };
}

export interface GastoCrudo {
  id: string;
  amount: number;
  date: Date | string;
  /** Cuándo se pagó; `null` = el día del gasto (o, si es de una guía, que todavía no se pagó). */
  paidAt: Date | string | null;
  gtfNumber: string | null;
  persona: string;
  detalle: string;
  /** Lo descontado de adelantos en este gasto (pago de la semana de RRHH); 0 si no tiene. */
  descontado: number;
}

/**
 * El gasto por lo que salió de verdad: el pago de la semana guarda el bruto,
 * pero lo descontado de un adelanto no sale ahora (salió al darlo y ya está en
 * «adelantos»). Adelanto 100 + sueldo 300 con 100 descontados = salió 300, no 400.
 */
export function filaDeGasto(g: GastoCrudo): FilaCruda | null {
  // Las dos reglas son las de la caja del mes (una sola fuente).
  if (!gastoYaSalio(g)) return null;
  const { neto, descontado } = netoDelGasto(g.amount, g.descontado);
  return {
    id: g.id, fuente: "gasto", grupo: "gastos", tipo: "Gasto", fecha: g.paidAt ?? g.date, clase: "fecha", persona: g.persona,
    detalle: descontado > 0 ? unir(g.detalle, `${descontado} descontado de adelantos`) : g.detalle,
    monto: neto, moneda: "PEN",
  };
}

/** Cobro de un fiado: entró una vez, haya o no caja abierta (sin caja no deja movimiento). */
export function filaDeCobroDeFiado(c: { id: string; monto: number; pagadoEn: Date | string; cliente: string; notas: string | null }): FilaCruda {
  return {
    id: `fiado-${c.id}`, fuente: "caja", grupo: "ingresos", tipo: "Cobro de fiado", fecha: c.pagadoEn, clase: "instante",
    persona: c.cliente, detalle: (c.notas ?? "").trim(), monto: c.monto, moneda: "PEN",
  };
}

/** Pago de una cuenta por pagar: salió una vez, en efectivo (con su retiro de caja) o por transferencia. */
export function filaDePagoAProveedor(p: {
  id: string; amount: number; date: Date | string; proveedor: string; detalle: string; method: string; reference: string | null;
}): FilaCruda {
  return {
    id: `pago-${p.id}`, fuente: "gasto", grupo: "gastos", tipo: "Pago a proveedor", fecha: p.date, clase: "fecha",
    persona: p.proveedor, detalle: unir(p.detalle, p.method, p.reference), monto: p.amount, moneda: "PEN",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Armar la respuesta
// ═══════════════════════════════════════════════════════════════════════════

export interface AdelantoAbierto {
  beneficiarioId: string;
  persona: string;
  saldo: number;
  moneda: string;
}

export interface EntradaCuentas {
  /**
   * Todas las filas del periodo de todas las fuentes, MENOS las ventas y
   * pedidos que no cupieron: de esos llegan solo los más nuevos (los que
   * pueden entrar en el tope) y su suma completa va en `ventasDelPeriodo`.
   */
  filas: FilaCruda[];
  /** Suma y cantidad de TODAS las ventas del POS + pedidos que entran como ingreso del periodo (soles). */
  ventasDelPeriodo: { monto: number; n: number };
  /** Adelantos DADOS en estado ABIERTO de hoy, con su saldo. */
  abiertos: AdelantoAbierto[];
}

/** Céntimos enteros: sumar Decimals como float deja cola (0,1 + 0,2). */
const cent = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) : 0);
const soles = (c: number) => c / 100;
const esPen = (moneda: string) => (moneda || "PEN").trim().toUpperCase() === "PEN";

export function armarCuentas(r: RangoCuentas, e: EntradaCuentas): CuentasDelPeriodo {
  const acum: Record<GrupoCuenta, { c: number; n: number }> = {
    adelantos: { c: 0, n: 0 },
    gastos: { c: 0, n: 0 },
    ingresos: { c: 0, n: 0 },
  };
  const lista: MovimientoCuenta[] = [];
  let otrasMonedas = 0;

  for (const f of e.filas) {
    const cuando = diaDe(f.fecha, f.clase);
    if (!cuando) continue;
    if (r.desde !== null && cuando.dia < r.desde) continue;
    if (cuando.dia > r.hasta) continue;
    const monto = Math.abs(f.monto);
    if (cent(monto) === 0) continue;
    const moneda = (f.moneda || "PEN").trim().toUpperCase();
    lista.push({
      id: `${f.fuente}:${f.id}`, fuente: f.fuente, grupo: f.grupo, tipo: f.tipo,
      cuando: cuando.cuando, conHora: cuando.conHora,
      persona: f.persona.trim(), detalle: f.detalle.trim(), monto: soles(cent(monto)), moneda,
    });
    if (!esPen(moneda)) {
      otrasMonedas += 1;
      continue;
    }
    // Las ventas suman por su agregado (vienen recortadas), no fila a fila.
    if (f.fuente === "venta") continue;
    acum[f.grupo].c += cent(monto);
    acum[f.grupo].n += 1;
  }
  acum.ingresos.c += cent(e.ventasDelPeriodo.monto);
  acum.ingresos.n += e.ventasDelPeriodo.n;

  lista.sort((a, b) => (a.cuando === b.cuando ? (a.id < b.id ? 1 : -1) : a.cuando < b.cuando ? 1 : -1));
  const truncado = lista.length > TOPE_MOVIMIENTOS;

  const entroC = acum.ingresos.c;
  const salioC = acum.adelantos.c + acum.gastos.c;

  return {
    periodo: r.periodo,
    desde: r.desde,
    hasta: r.hasta,
    totales: {
      adelantos: { monto: soles(acum.adelantos.c), n: acum.adelantos.n },
      gastos: { monto: soles(acum.gastos.c), n: acum.gastos.n },
      ingresos: { monto: soles(acum.ingresos.c), n: acum.ingresos.n },
    },
    entro: soles(entroC),
    salio: soles(salioC),
    queda: soles(entroC - salioC),
    porCobrar: porCobrarDe(e.abiertos),
    movimientos: truncado ? lista.slice(0, TOPE_MOVIMIENTOS) : lista,
    truncado,
    otrasMonedas,
  };
}

/** Lo que le deben al negocio HOY: saldo de los adelantos dados abiertos, por persona (solo soles). */
export function porCobrarDe(abiertos: readonly AdelantoAbierto[]): { total: number; deudores: DeudorCuenta[] } {
  const porPersona = new Map<string, { persona: string; c: number; adelantos: number }>();
  for (const a of abiertos) {
    if (!esPen(a.moneda)) continue;
    const c = cent(a.saldo);
    if (c <= 0) continue;
    const p = porPersona.get(a.beneficiarioId) ?? { persona: a.persona.trim(), c: 0, adelantos: 0 };
    p.c += c;
    p.adelantos += 1;
    porPersona.set(a.beneficiarioId, p);
  }
  const deudores = [...porPersona.values()]
    .sort((a, b) => b.c - a.c || a.persona.localeCompare(b.persona, "es"))
    .map((p) => ({ persona: p.persona, saldo: soles(p.c), adelantos: p.adelantos }));
  return { total: soles(deudores.reduce((s, d) => s + cent(d.saldo), 0)), deudores };
}
