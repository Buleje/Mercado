/**
 * Liquidar la cuenta de una persona (ADR-413): cruzar lo que se deben entre
 * las dos libretas y pagar lo que quede, en un solo acto con código.
 *
 * ## Dos pasos, en este orden
 *
 * 1. **Cruzar** (compensación): lo que te debe en Adelantos contra lo que le
 *    debes en la cuenta forestal. Nunca toca la caja.
 * 2. **Pagar** lo que quede: `recibido` (te paga) o `hecho` (le pagas).
 *
 * «Dejar en cero» es cruzar lo máximo y pagar el neto.
 *
 * ## Siempre `≤`
 *
 * Ninguna partida recibe más que su saldo: nunca nace un adelanto EXCEDIDO ni
 * se le da vuelta el signo a la cuenta forestal. Un sobrepago se RECHAZA con la
 * cifra (decisión por defecto de Brandon, ADR-413 «Dudas»): el vuelto se da en
 * el acto.
 *
 * ## Guías (ADR-437 §6)
 *
 * Dentro de la cuenta forestal, un pago o un cruce se puede imputar a guías de
 * compra con nombre (`imputacion.guias`). Cada guía recibe `≤` lo que tiene
 * pendiente —calculado dentro del lock, y en la huella— y el movimiento se
 * parte en uno por guía (con `gtfNumber`) más el resto sin guía. Relaja ADR-413
 * §3 («no se elige cargo») sólo para guías.
 *
 * ## Céntimos en cada paso
 *
 * `0.1 + 0.2` da `0.30000000000000004`; cada suma se redondea apenas se hace.
 *
 * PURO: sin React, sin fetch, sin Prisma. La vista previa de la pantalla y el
 * servidor dentro de la transacción corren ESTA función: lo que se confirma es
 * lo que se escribe.
 */

import { z } from "zod";
import type { MetodoPago } from "@/lib/adelantos/movimiento-caja";
import { direccionDe } from "@/lib/adelantos/direccion";
import { leerNeto } from "@/lib/adelantos/cuenta-unificada";
import { formatCurrency } from "@/lib/currency";
import { limaDateKey } from "@/lib/utils";
import { calcularSaldo, type Concepto, type MovimientoCuenta, type TipoMov } from "@/lib/forestal/cuenta-corriente";
import { normalizarFoto, type FotoCarga } from "@/lib/forestal/fotos-carga";
import { esDiaDelCalendario, estadoDePagoDeGuias, type GuiaParaPago } from "@/lib/forestal/plata-de-guia";

export type { MetodoPago };
export type DireccionPago = "recibido" | "hecho";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Un céntimo: la plata se cuenta en céntimos, no en epsilon de float. */
const EPS = 0.005;
const soles = (n: number) => formatCurrency(n);

// ── Formas ───────────────────────────────────────────────────────────────────

export interface PartidaAdelanto {
  adelantoId: string;
  codigo: string | null;
  /** fechaAdelanto ISO. */
  fecha: string;
  /** saldoPendiente > 0, en soles. */
  saldo: number;
  modalidad: "CUENTA_CORRIENTE" | "DESCUENTO_PLANILLA";
}

export interface PartidaFuera {
  etiqueta: string;
  monto: number;
  moneda: string;
  motivo: string;
  /**
   * (ADR-448) Sólo en lo que el negocio RECIBIÓ. Entra en la huella: un
   * recibido abierto de S/ 100 y un dado excedido de S/ 100 caen los dos en
   * `fuera` con la misma etiqueta y el mismo monto, y corregir la dirección
   * entre la vista previa y el confirmar tiene que dar 409.
   */
  direccion?: "RECIBIDO";
  /**
   * (ADR-448) Sólo en lo RECIBIDO: de qué lado queda la deuda. `le-debes` =
   * abierto (el negocio todavía no le devolvió); `te-debe` = excedido (le diste
   * de más). Entra en la huella y en `saldosDe`.
   */
  quien?: "le-debes" | "te-debe";
}

export interface PartidasDePersona {
  persona: { beneficiarioId: string | null; parteId: string | null; nombre: string; documento: string | null };
  /** Hay beneficiario Y parte unidos por `forestPartyId` — la única unión que deja cruzar. */
  cruzable: boolean;
  /** Ya en orden FIFO. */
  adelantos: PartidaAdelanto[];
  forestal: {
    saldo: number;
    desde: string | null;
    movimientos: MovimientoCuenta[];
    /**
     * Guías de compra de la persona con algo pendiente (ADR-437 §7), derivadas
     * de `movimientos` con `guiasPendientesDe`. Opcional: sin guías, ausente.
     */
    guias?: GuiaPendiente[];
  } | null;
  fuera: PartidaFuera[];
}

/** Una guía de compra con lo que falta pagarle. Derivado, nunca guardado (ADR-437 §7). */
export interface GuiaPendiente {
  gtfNumber: string;
  /** Fecha del abono `madera` de la guía (ISO): el orden «por antigüedad». */
  fecha: string;
  /** Lo que vale la madera de la guía. */
  monto: number;
  pagado: number;
  /** > 0: sólo se listan las que tienen algo pendiente. */
  pendiente: number;
}

/** Cuánto de un paso va a una guía con nombre. */
export interface ImputacionGuia {
  gtfNumber: string;
  monto: number;
  paso: "cruce" | "pago";
}

export interface SaldosPersona {
  /** Lo que te debe en Adelantos DADOS que entran al FIFO. */
  adelantosTeDebe: number;
  maderaSaldo: number;
  /**
   * (ADR-448) Lo RECIBIDO en soles que queda en `fuera`: lo que le debes
   * (abiertos) y lo que te debe porque le diste de más (excedidos). No se salda
   * acá, pero ES parte de la cuenta: sin esto el «Antes» y el recibo decían «queda
   * en cero» con plata que el negocio todavía le debe. Opcionales: el acta de una
   * liquidación anterior no los trae.
   */
  recibidoLeDebes?: number;
  recibidoTeDebe?: number;
  /** adelantosTeDebe + maderaSaldo − recibidoLeDebes + recibidoTeDebe. Positivo = te debe. */
  neto: number;
}

export interface IntencionLiquidacion {
  /** YYYY-MM-DD (Lima). */
  fecha: string;
  /** 0 = no cruzar. */
  compensar: number;
  pago: { direccion: DireccionPago; monto: number; metodo: MetodoPago; moverCaja: boolean } | null;
  /** Ausente = FIFO. */
  imputacion?: {
    compensacion?: { adelantoId: string; monto: number }[];
    pago?: { partida: "forestal" | `adelanto:${string}` | string; monto: number }[];
    /** ADR-437 §6: parte del cruce o del pago hecho que va a guías con nombre. Lo demás, sin guía. */
    guias?: ImputacionGuia[];
  };
  notas?: string;
}

export interface EntregaPlaneada {
  adelantoId: string;
  codigo: string | null;
  valor: number;
  paso: "cruce" | "pago";
  descripcion: string;
}

export interface MovimientoPlaneado {
  tipo: TipoMov;
  concepto: "compensacion" | "pago" | "pago_hecho";
  monto: number;
  paso: "cruce" | "pago";
  notas: string;
  /** La guía a la que se imputa (ADR-437 §6). Ausente/`null` = sin guía. */
  gtfNumber?: string | null;
}

export interface CargoCubierto {
  movimientoId: string;
  fecha: string;
  concepto: Concepto;
  referencia: string | null;
  cubierto: number;
  total: number;
  /** La guía del movimiento cubierto, si la tiene (ADR-437). */
  gtfNumber?: string | null;
  /** Cubierto por nombrar su guía, no por antigüedad (ADR-437 §7). */
  porGuia?: boolean;
}

export interface PlanLiquidacion {
  entregas: EntregaPlaneada[];
  movimientos: MovimientoPlaneado[];
  caja: { tipo: "ingreso" | "egreso"; monto: number; metodo: MetodoPago } | null;
  compensado: number;
  pago: IntencionLiquidacion["pago"];
  antes: SaldosPersona;
  despues: SaldosPersona;
  /** Derivado, rotulado «por antigüedad»: la cuenta forestal no imputa por documento. */
  cubiertos: CargoCubierto[];
  fuera: PartidaFuera[];
}

export type ResultadoPlan = { ok: true; plan: PlanLiquidacion } | { ok: false; errores: string[] };

export interface DetalleLiquidacion extends Omit<PlanLiquidacion, "entregas" | "movimientos"> {
  v: 1;
  entregas: (EntregaPlaneada & { entregaId: string })[];
  movimientos: (MovimientoPlaneado & { movimientoId: string })[];
}

export interface LiquidacionDTO {
  id: string;
  codigo: string;
  fecha: string;
  persona: { beneficiarioId: string | null; parteId: string | null; nombre: string; documento: string | null };
  compensado: number;
  pago: { direccion: DireccionPago; monto: number; metodo: MetodoPago; moverCaja: boolean } | null;
  caja: { resultado: "movida" | "sin_caja" | "no_mover" | "fallo" | null; movimientoId: string | null };
  detalle: DetalleLiquidacion;
  notas: string | null;
  creadaPor: string;
  creadaEn: string;
  anulada: { en: string; por: string; motivo: string; reversionCajaId: string | null } | null;
  /** Fotos del comprobante del pago (ADR-437 §6). Privadas: se ven con `srcDeFoto`. */
  comprobantes?: FotoCarga[];
}

// ── Partidas ─────────────────────────────────────────────────────────────────

/** Un adelanto como sale de la base, antes de decidir si se puede saldar. */
export interface AdelantoParaLiquidar {
  id: string;
  codigo: string | null;
  fecha: string;
  saldo: number;
  moneda: string | null;
  modalidad: string;
  status: string;
  /** Cuántas cuotas pactadas tiene. */
  cuotasPactadas: number;
  /** (ADR-448) Sin dirección = DADO. */
  direccion?: string | null;
}

/**
 * Qué adelantos entran a la liquidación y cuáles quedan fuera, con el motivo
 * dicho. Lo que queda fuera se muestra: esconderlo haría creer que la cuenta
 * quedó en cero cuando no.
 */
export function clasificarAdelantos(rows: readonly AdelantoParaLiquidar[]): {
  adelantos: PartidaAdelanto[];
  fuera: PartidaFuera[];
} {
  const adelantos: PartidaAdelanto[] = [];
  const fuera: PartidaFuera[] = [];
  const orden = [...rows].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id < b.id ? -1 : 1));
  for (const a of orden) {
    const etiqueta = `Adelanto ${a.codigo ?? "sin código"}`;
    const moneda = a.moneda || "PEN";
    /* ADR-448: lo RECIBIDO es la deuda al revés — el negocio le debe a la
       persona. Nunca entra al FIFO de «te debe»: «Dejar en cero» le cobraría lo
       que el negocio le tiene que devolver. Se muestra con su motivo. */
    if (direccionDe(a.direccion) === "RECIBIDO") {
      if ((a.status === "ABIERTO" || a.status === "EXCEDIDO") && Math.abs(a.saldo) > EPS) {
        fuera.push({
          etiqueta,
          monto: r2(Math.abs(a.saldo)),
          moneda,
          motivo:
            a.saldo > 0
              ? "Es plata que te dieron: se la devuelves con el servicio, madera o plata, no se cobra acá."
              : "Es plata que te dieron y ya le diste de más: acá no hay cómo saldarlo.",
          direccion: "RECIBIDO",
          quien: a.saldo > 0 ? "le-debes" : "te-debe",
        });
      }
      continue;
    }
    if (a.status === "EXCEDIDO") {
      fuera.push({ etiqueta, monto: r2(Math.abs(a.saldo)), moneda, motivo: "Está a favor suyo (entregó de más): acá no hay cómo saldarlo." });
      continue;
    }
    if (a.status !== "ABIERTO" || !(a.saldo > EPS)) continue;
    if (moneda !== "PEN") {
      fuera.push({ etiqueta, monto: r2(a.saldo), moneda, motivo: `Es en ${moneda}: la cuenta se liquida en soles.` });
      continue;
    }
    if (a.modalidad === "ENTREGAS_PACTADAS" || a.cuotasPactadas > 0) {
      fuera.push({ etiqueta, monto: r2(a.saldo), moneda, motivo: "Tiene cuotas pactadas: una entrega suelta no marca la cuota." });
      continue;
    }
    adelantos.push({
      adelantoId: a.id,
      codigo: a.codigo,
      fecha: a.fecha,
      saldo: r2(a.saldo),
      modalidad: a.modalidad === "DESCUENTO_PLANILLA" ? "DESCUENTO_PLANILLA" : "CUENTA_CORRIENTE",
    });
  }
  return { adelantos, fuera };
}

export function saldosDe(p: PartidasDePersona): SaldosPersona {
  const adelantosTeDebe = p.adelantos.reduce((a, x) => r2(a + x.saldo), 0);
  const maderaSaldo = r2(p.forestal?.saldo ?? 0);
  const { recibidoLeDebes, recibidoTeDebe } = recibidosDe(p);
  return {
    adelantosTeDebe,
    maderaSaldo,
    recibidoLeDebes,
    recibidoTeDebe,
    neto: r2(adelantosTeDebe + maderaSaldo - recibidoLeDebes + recibidoTeDebe),
  };
}

/** Lo RECIBIDO en soles de `fuera` (ADR-448): no lo toca ninguna liquidación, pero pesa en la cuenta. */
function recibidosDe(p: PartidasDePersona): { recibidoLeDebes: number; recibidoTeDebe: number } {
  let recibidoLeDebes = 0;
  let recibidoTeDebe = 0;
  for (const f of p.fuera) {
    if (f.direccion !== "RECIBIDO" || (f.moneda || "PEN") !== "PEN") continue;
    if (f.quien === "te-debe") recibidoTeDebe = r2(recibidoTeDebe + f.monto);
    else recibidoLeDebes = r2(recibidoLeDebes + f.monto);
  }
  return { recibidoLeDebes, recibidoTeDebe };
}

/** Lo máximo que se puede cruzar: lo que te debe en adelantos contra lo que le debes en la cuenta. */
export function maximoCompensable(p: PartidasDePersona): number {
  if (!p.cruzable || !p.forestal) return 0;
  return r2(Math.min(saldosDe(p).adelantosTeDebe, Math.max(0, -p.forestal.saldo)));
}

/** Reparte un monto del más viejo al más nuevo, sin darle a nadie más que su saldo. */
export function imputarFifo<T extends { saldo: number }>(partidas: readonly T[], monto: number): { partida: T; monto: number }[] {
  let queda = r2(monto);
  const out: { partida: T; monto: number }[] = [];
  for (const partida of partidas) {
    if (queda <= EPS) break;
    const toma = r2(Math.min(Math.max(0, partida.saldo), queda));
    if (toma > EPS) {
      out.push({ partida, monto: toma });
      queda = r2(queda - toma);
    }
  }
  return out;
}

const cronologico = (movs: readonly MovimientoCuenta[]) =>
  [...movs].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id < b.id ? -1 : 1));

/** Desde cuándo el saldo de la cuenta está vivo sin volver a cero. `null` = está en cero. */
export function fechaDeudaViva(movs: readonly MovimientoCuenta[]): string | null {
  let saldo = 0;
  let desde: string | null = null;
  for (const m of cronologico(movs)) {
    const antes = saldo;
    saldo = r2(saldo + (m.tipo === "cargo" ? m.monto : -m.monto));
    if (Math.abs(saldo) <= EPS) desde = null;
    else if (Math.abs(antes) <= EPS || Math.sign(antes) !== Math.sign(saldo)) desde = m.fecha;
  }
  return Math.abs(saldo) <= EPS ? null : desde;
}

const gtfDe = (m: { gtfNumber?: string | null }): string | null => m.gtfNumber?.trim() || null;

/**
 * Qué movimientos de la deuda cubre un monto, por antigüedad.
 *
 * Es un DERIVADO: la cuenta no imputa por documento (ADR-322 §1). Primero lo
 * que ya se pagó en contra cubre a los más viejos, y lo que se liquida ahora
 * cubre lo que queda. La pantalla y el papel lo rotulan «por antigüedad».
 *
 * Excepción de ADR-437 §7: lo que NOMBRA una guía (`gtfNumber`) cubre primero
 * el movimiento de esa guía —lo ya pagado y, con `guias`, lo que se imputa
 * ahora—; sólo lo que sobra sigue por antigüedad. Sin guías en juego el
 * resultado es exactamente el de antes.
 */
export function cargosCubiertosPorAntiguedad(
  movs: readonly MovimientoCuenta[],
  monto: number,
  guias: readonly { gtfNumber: string; monto: number }[] = [],
): CargoCubierto[] {
  const saldo = calcularSaldo([...movs]).saldo;
  if (Math.abs(saldo) <= EPS || !(monto > EPS)) return [];
  const deLaDeuda: TipoMov = saldo > 0 ? "cargo" : "abono";
  const orden = cronologico(movs);
  const abiertos: { m: MovimientoCuenta; abierto: number }[] = orden
    .filter((m) => m.tipo === deLaDeuda)
    .map((m) => ({ m, abierto: r2(m.monto) }));
  /* Cubre `q` en los abiertos de la guía `g`; devuelve lo que no entró. */
  const aSuGuia = (g: string, q: number, anotar?: (a: { m: MovimientoCuenta }, t: number) => void): number => {
    for (const a of abiertos) {
      if (q <= EPS) break;
      if (gtfDe(a.m) !== g || a.abierto <= EPS) continue;
      const t = r2(Math.min(a.abierto, q));
      a.abierto = r2(a.abierto - t);
      q = r2(q - t);
      anotar?.(a, t);
    }
    return q;
  };

  /* 1. Lo ya pagado que nombra una guía, a su guía; lo que sobra queda para el paso 2. */
  const sobra = new Map<string, number>();
  for (const m of orden) {
    if (m.tipo === deLaDeuda) continue;
    const g = gtfDe(m);
    sobra.set(m.id, g ? aSuGuia(g, r2(m.monto)) : r2(m.monto));
  }
  /* 2. El resto de lo ya pagado, por antigüedad: sólo alcanza a lo anterior a él. */
  const vistos: { m: MovimientoCuenta; abierto: number }[] = [];
  for (const m of orden) {
    if (m.tipo === deLaDeuda) {
      const a = abiertos.find((x) => x.m === m);
      if (a) vistos.push(a);
      continue;
    }
    let q = sobra.get(m.id) ?? 0;
    for (const a of vistos) {
      if (q <= EPS) break;
      const t = Math.min(a.abierto, q);
      a.abierto = r2(a.abierto - t);
      q = r2(q - t);
    }
  }

  /* 3. Lo de ahora: primero las guías con nombre, después por antigüedad. */
  const cubierto = new Map<string, { t: number; porGuia: boolean }>();
  const anotar = (porGuia: boolean) => (a: { m: MovimientoCuenta }, t: number) => {
    const c = cubierto.get(a.m.id) ?? { t: 0, porGuia: false };
    cubierto.set(a.m.id, { t: r2(c.t + t), porGuia: c.porGuia || porGuia });
  };
  let queda = r2(monto);
  for (const g of guias) {
    const pedido = r2(Math.min(Math.max(0, g.monto), queda));
    if (pedido <= EPS) continue;
    const noEntro = aSuGuia(g.gtfNumber.trim(), pedido, anotar(true));
    queda = r2(queda - pedido + noEntro);
  }
  for (const a of abiertos) {
    if (queda <= EPS) break;
    if (a.abierto <= EPS) continue;
    const t = r2(Math.min(a.abierto, queda));
    a.abierto = r2(a.abierto - t);
    queda = r2(queda - t);
    anotar(false)(a, t);
  }

  const out: CargoCubierto[] = [];
  for (const a of abiertos) {
    const c = cubierto.get(a.m.id);
    if (!c || c.t <= EPS) continue;
    const g = gtfDe(a.m);
    out.push({
      movimientoId: a.m.id,
      fecha: a.m.fecha,
      concepto: a.m.concepto,
      referencia: a.m.referencia,
      cubierto: c.t,
      total: a.m.monto,
      ...(g ? { gtfNumber: g } : {}),
      ...(c.porGuia ? { porGuia: true } : {}),
    });
  }
  return out;
}

/**
 * Las guías de compra de una parte con algo pendiente, desde sus movimientos
 * (ADR-437 §7): cada abono `madera` con `gtfNumber` es una guía; los cargos que
 * la nombran la cubren y los demás cubren por antigüedad (`estadoDePagoDeGuias`,
 * la MISMA regla que el modal de la guía). Lo pagado de más no se lista.
 */
export function guiasPendientesDe(movimientos: readonly MovimientoCuenta[]): GuiaPendiente[] {
  const porGuia = new Map<string, GuiaParaPago>();
  for (const m of movimientos) {
    const g = gtfDe(m);
    if (!g || m.tipo !== "abono" || m.concepto !== "madera") continue;
    const ya = porGuia.get(g);
    porGuia.set(
      g,
      ya
        ? { ...ya, monto: r2(ya.monto + m.monto), fecha: m.fecha < ya.fecha ? m.fecha : ya.fecha }
        : { gtfNumber: g, parteId: m.parteId, fecha: m.fecha, monto: r2(m.monto) },
    );
  }
  if (porGuia.size === 0) return [];
  /* Una sola parte por lista: la de las guías (la cuenta que se liquida es una). */
  const parteId = [...porGuia.values()][0].parteId;
  const guias = [...porGuia.values()].map((g) => ({ ...g, parteId }));
  const movs = movimientos.map((m) => ({ parteId, tipo: m.tipo, concepto: m.concepto, monto: m.monto, gtfNumber: gtfDe(m) }));
  return estadoDePagoDeGuias(guias, movs)
    .filter((e) => e.pendiente > EPS)
    .map((e) => ({ gtfNumber: e.gtfNumber, fecha: e.fecha, monto: e.monto, pagado: e.pagado, pendiente: e.pendiente }));
}

// ── Plan ─────────────────────────────────────────────────────────────────────

type Reparto = { clave: string; monto: number }[];

/** Suma por clave un reparto a mano: dos filas del mismo adelanto son una. */
function agrupar(filas: readonly { clave: string; monto: number }[]): Reparto {
  const m = new Map<string, number>();
  for (const f of filas) {
    const v = r2(Math.max(0, Number(f.monto) || 0));
    if (v > EPS) m.set(f.clave, r2((m.get(f.clave) ?? 0) + v));
  }
  return [...m.entries()].map(([clave, monto]) => ({ clave, monto }));
}

/** Suma las imputaciones repetidas (misma guía y paso) y descarta las de menos de un céntimo. */
function agruparGuias(filas: readonly ImputacionGuia[]): ImputacionGuia[] {
  const m = new Map<string, ImputacionGuia>();
  for (const f of filas) {
    const gtfNumber = f.gtfNumber.trim();
    const v = r2(Math.max(0, Number(f.monto) || 0));
    if (!gtfNumber || v <= EPS) continue;
    const k = `${f.paso}|${gtfNumber}`;
    const ya = m.get(k);
    m.set(k, { gtfNumber, paso: f.paso, monto: r2((ya?.monto ?? 0) + v) });
  }
  return [...m.values()];
}

/** Lo que va a cada guía, sumando los dos pasos (para lo cubierto). */
function porGuiaSumado(guias: readonly ImputacionGuia[]): { gtfNumber: string; monto: number }[] {
  const m = new Map<string, number>();
  for (const g of guias) m.set(g.gtfNumber, r2((m.get(g.gtfNumber) ?? 0) + g.monto));
  return [...m.entries()].map(([gtfNumber, monto]) => ({ gtfNumber, monto }));
}

/**
 * `≤` en cada guía y en cada paso. Sólo bajan lo que le debes (el cruce y el
 * pago hecho): un pago recibido no paga una guía tuya. `null` = todo en regla.
 */
function validarGuias(
  p: PartidasDePersona,
  guias: readonly ImputacionGuia[],
  compensar: number,
  pago: IntencionLiquidacion["pago"],
): string | null {
  if (!p.forestal) return "Esta persona no tiene cuenta forestal: no hay guías que pagarle.";
  const pendiente = new Map((p.forestal.guias ?? []).map((g) => [g.gtfNumber.trim(), g.pendiente]));
  const total = porGuiaSumado(guias);
  for (const g of total) {
    const debe = pendiente.get(g.gtfNumber);
    if (debe == null) return `La guía ${g.gtfNumber} no tiene nada pendiente con ${p.persona.nombre}.`;
    if (g.monto > debe + EPS) return `A la guía ${g.gtfNumber} le falta ${soles(debe)}: no se le pueden imputar ${soles(g.monto)}.`;
  }
  const suma = (paso: "cruce" | "pago") => guias.filter((g) => g.paso === paso).reduce((a, g) => r2(a + g.monto), 0);
  const cruce = suma("cruce");
  if (cruce > EPS && cruce > compensar + EPS) {
    return `A las guías van ${soles(cruce)} del cruce, y el cruce es ${soles(compensar)}.`;
  }
  const pagoGuias = suma("pago");
  if (pagoGuias > EPS) {
    if (!pago || pago.direccion !== "hecho") return "Una guía se paga con un pago que le haces, no con uno que recibes.";
    if (pagoGuias > pago.monto + EPS) return `A las guías van ${soles(pagoGuias)} del pago, y el pago es ${soles(pago.monto)}.`;
  }
  return null;
}

/**
 * Un movimiento forestal partido: uno por guía (con `gtfNumber`) y el resto sin
 * guía. La suma de las partes es el movimiento entero, al céntimo.
 */
function partirPorGuia(base: MovimientoPlaneado, guias: readonly ImputacionGuia[]): MovimientoPlaneado[] {
  if (guias.length === 0) return [base];
  const partes: MovimientoPlaneado[] = guias.map((g) => ({
    ...base,
    monto: g.monto,
    gtfNumber: g.gtfNumber,
    notas: `${base.notas} · guía ${g.gtfNumber}`,
  }));
  const resto = r2(base.monto - guias.reduce((a, g) => r2(a + g.monto), 0));
  if (resto > EPS) partes.push({ ...base, monto: resto });
  return partes;
}

/**
 * Arma lo que se escribe en cada libreta. Cruza primero, paga sobre lo que
 * quedó, y valida `≤` en cada partida. Con errores no devuelve plan: la
 * pantalla deshabilita «Confirmar» y el servidor responde 422.
 */
export function planLiquidacion(p: PartidasDePersona, intencion: IntencionLiquidacion): ResultadoPlan {
  const antes = saldosDe(p);
  const compensar = r2(Math.max(0, Number(intencion.compensar) || 0));
  const pago = intencion.pago && intencion.pago.monto > EPS ? { ...intencion.pago, monto: r2(intencion.pago.monto) } : null;
  if (compensar <= EPS && !pago) return { ok: false, errores: ["No hay nada que liquidar."] };

  const porId = new Map(p.adelantos.map((a) => [a.adelantoId, a]));
  const resto = new Map(p.adelantos.map((a) => [a.adelantoId, a.saldo]));
  let forestal: number | null = p.forestal ? r2(p.forestal.saldo) : null;
  const entregas: EntregaPlaneada[] = [];
  const movimientos: MovimientoPlaneado[] = [];
  const errores: string[] = [];
  const codigoDe = (id: string) => porId.get(id)?.codigo ?? "sin código";

  /* Valida un reparto contra lo que cada partida debe. */
  const validarAdelantos = (reparto: Reparto, total: number, que: "cruce" | "pago"): boolean => {
    for (const r of reparto) {
      if (!porId.has(r.clave)) {
        errores.push("Ese adelanto no es de esta persona.");
        return false;
      }
      const debe = resto.get(r.clave) ?? 0;
      if (r.monto > debe + EPS) {
        errores.push(`El adelanto ${codigoDe(r.clave)} debe ${soles(debe)}: no se le pueden imputar ${soles(r.monto)}.`);
        return false;
      }
    }
    const suma = reparto.reduce((a, r) => r2(a + r.monto), 0);
    if (Math.abs(suma - total) > EPS) {
      errores.push(`El reparto suma ${soles(suma)} y el ${que} es ${soles(total)}.`);
      return false;
    }
    return true;
  };

  /* Guías con nombre (ADR-437 §6): se validan contra lo pendiente de cada una
     y contra el paso al que pertenecen, y parten su movimiento. */
  const pedidasGuias = agruparGuias(intencion.imputacion?.guias ?? []);
  const guiasDe = (paso: "cruce" | "pago") => pedidasGuias.filter((g) => g.paso === paso);
  if (pedidasGuias.length > 0) {
    const errGuias = validarGuias(p, pedidasGuias, compensar, pago);
    if (errGuias) return { ok: false, errores: [errGuias] };
  }

  // 1. Cruzar
  if (compensar > EPS) {
    if (!p.cruzable || forestal == null) {
      return { ok: false, errores: ["Para cruzar las dos libretas, primero confirma que es la misma persona."] };
    }
    const max = maximoCompensable(p);
    if (compensar > max + EPS) return { ok: false, errores: [`Lo máximo que cruza es ${soles(max)}.`] };
    const manual = intencion.imputacion?.compensacion;
    const reparto: Reparto = manual?.length
      ? agrupar(manual.map((x) => ({ clave: x.adelantoId, monto: x.monto })))
      : imputarFifo(p.adelantos, compensar).map((x) => ({ clave: x.partida.adelantoId, monto: x.monto }));
    if (!validarAdelantos(reparto, compensar, "cruce")) return { ok: false, errores };
    for (const r of reparto) {
      resto.set(r.clave, r2((resto.get(r.clave) ?? 0) - r.monto));
      entregas.push({ adelantoId: r.clave, codigo: porId.get(r.clave)?.codigo ?? null, valor: r.monto, paso: "cruce", descripcion: "Cruce con la cuenta forestal" });
    }
    forestal = r2(forestal + compensar);
    movimientos.push(
      ...partirPorGuia(
        { tipo: "cargo", concepto: "compensacion", monto: compensar, paso: "cruce", notas: `Cruce con ${reparto.map((r) => codigoDe(r.clave)).join(", ")}` },
        guiasDe("cruce"),
      ),
    );
  }

  // 2. Pagar
  if (pago) {
    if (pago.direccion === "recibido") {
      const deudaAdelantos = [...resto.values()].reduce((a, v) => r2(a + Math.max(0, v)), 0);
      const deudaForestal = forestal != null ? Math.max(0, forestal) : 0;
      const teDebe = r2(deudaAdelantos + deudaForestal);
      if (pago.monto > teDebe + EPS) return { ok: false, errores: [`Te debe ${soles(teDebe)}: el pago no puede pasar de eso.`] };

      const manual = intencion.imputacion?.pago;
      let reparto: Reparto;
      if (manual?.length) {
        reparto = agrupar(manual.map((x) => ({ clave: x.partida, monto: x.monto })));
      } else {
        /* FIFO entre las partidas de las dos libretas: la cuenta forestal es
           UNA partida con la fecha desde la que su deuda está viva. */
        const partidas = [
          ...p.adelantos
            .filter((a) => (resto.get(a.adelantoId) ?? 0) > EPS)
            .map((a) => ({ clave: `adelanto:${a.adelantoId}`, fecha: a.fecha, saldo: resto.get(a.adelantoId) ?? 0 })),
          ...(forestal != null && forestal > EPS ? [{ clave: "forestal", fecha: p.forestal?.desde ?? "9999", saldo: forestal }] : []),
        ].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.clave < b.clave ? -1 : 1));
        reparto = imputarFifo(partidas, pago.monto).map((x) => ({ clave: x.partida.clave, monto: x.monto }));
      }

      const aAdelantos = reparto.filter((r) => r.clave.startsWith("adelanto:")).map((r) => ({ clave: r.clave.slice("adelanto:".length), monto: r.monto }));
      const aForestal = reparto.filter((r) => r.clave === "forestal").reduce((a, r) => r2(a + r.monto), 0);
      if (reparto.some((r) => r.clave !== "forestal" && !r.clave.startsWith("adelanto:"))) {
        return { ok: false, errores: ["Ese adelanto no es de esta persona."] };
      }
      if (aForestal > EPS && aForestal > deudaForestal + EPS) {
        return { ok: false, errores: [`La cuenta forestal debe ${soles(deudaForestal)}: no se le pueden imputar ${soles(aForestal)}.`] };
      }
      const sumaAdelantos = aAdelantos.reduce((a, r) => r2(a + r.monto), 0);
      if (!validarAdelantos(aAdelantos, r2(pago.monto - aForestal), "pago")) {
        /* El mensaje de suma tiene que hablar del pago entero, no de su parte en adelantos. */
        const i = errores.findIndex((e) => e.startsWith("El reparto suma"));
        if (i >= 0) errores[i] = `El reparto suma ${soles(r2(sumaAdelantos + aForestal))} y el pago es ${soles(pago.monto)}.`;
        return { ok: false, errores };
      }
      for (const r of aAdelantos) {
        resto.set(r.clave, r2((resto.get(r.clave) ?? 0) - r.monto));
        entregas.push({ adelantoId: r.clave, codigo: porId.get(r.clave)?.codigo ?? null, valor: r.monto, paso: "pago", descripcion: `Pago (${pago.metodo})` });
      }
      if (aForestal > EPS && forestal != null) {
        forestal = r2(forestal - aForestal);
        movimientos.push({ tipo: "abono", concepto: "pago", monto: aForestal, paso: "pago", notas: `Pago recibido (${pago.metodo})` });
      }
    } else {
      if (intencion.imputacion?.pago?.some((x) => x.partida !== "forestal")) {
        return { ok: false, errores: ["A un adelanto no se le paga: lo que le debes está en la cuenta forestal."] };
      }
      const leDebes = forestal != null ? r2(Math.max(0, -forestal)) : 0;
      if (pago.monto > leDebes + EPS) return { ok: false, errores: [`Le debes ${soles(leDebes)}: el pago no puede pasar de eso.`] };
      forestal = r2((forestal ?? 0) + pago.monto);
      movimientos.push(
        ...partirPorGuia(
          { tipo: "cargo", concepto: "pago_hecho", monto: pago.monto, paso: "pago", notas: `Pago entregado (${pago.metodo})` },
          guiasDe("pago"),
        ),
      );
    }
  }

  const adelantosTeDebe = [...resto.values()].reduce((a, v) => r2(a + v), 0);
  const maderaSaldo = r2(forestal ?? 0);
  const reduccionForestal = movimientos.reduce((a, m) => r2(a + m.monto), 0);
  return {
    ok: true,
    plan: {
      entregas,
      movimientos,
      caja: pago && pago.moverCaja ? { tipo: pago.direccion === "recibido" ? "ingreso" : "egreso", monto: pago.monto, metodo: pago.metodo } : null,
      compensado: compensar,
      pago,
      antes,
      /* Lo recibido no lo mueve la liquidación: queda igual que antes y sigue en el neto. */
      despues: {
        adelantosTeDebe,
        maderaSaldo,
        recibidoLeDebes: antes.recibidoLeDebes,
        recibidoTeDebe: antes.recibidoTeDebe,
        neto: r2(adelantosTeDebe + maderaSaldo - (antes.recibidoLeDebes ?? 0) + (antes.recibidoTeDebe ?? 0)),
      },
      cubiertos: p.forestal
        ? cargosCubiertosPorAntiguedad(p.forestal.movimientos, reduccionForestal, porGuiaSumado(pedidasGuias))
        : [],
      fuera: p.fuera,
    },
  };
}

/**
 * La intención de «dejar en cero»: cruzar lo máximo y pagar el neto. `null` si
 * no hay nada que saldar, o si sin cruzar quedan deudas en las DOS direcciones
 * (un solo pago no las salda: primero hay que confirmar que es la misma persona).
 *
 * ADR-448: también `null` si hay plata RECIBIDA en soles en `fuera`. Esa deuda no
 * la salda ninguna liquidación (se devuelve con el servicio, madera o plata), así
 * que «dejar en cero» no puede dejar nada en cero: con WASACO vinculado cobraba
 * 15 540,02 en vez de 12 509,02, y sin cuenta forestal cobraba el DADO y el
 * recibo decía «queda en cero» con 1 731 que el negocio todavía le debía.
 */
export function intencionDejarEnCero(
  p: PartidasDePersona,
  fecha: string,
  metodo: MetodoPago,
  moverCaja: boolean,
): IntencionLiquidacion | null {
  if (p.fuera.some((f) => f.direccion === "RECIBIDO" && (f.moneda || "PEN") === "PEN")) return null;
  const s = saldosDe(p);
  const compensar = maximoCompensable(p);
  const adelantos = r2(s.adelantosTeDebe - compensar);
  const forestal = p.forestal ? r2(p.forestal.saldo + compensar) : 0;
  if (adelantos > EPS && forestal < -EPS) return null;
  const recibir = r2(adelantos + Math.max(0, forestal));
  const pagar = r2(Math.max(0, -forestal));
  const pago =
    recibir > EPS
      ? { direccion: "recibido" as const, monto: recibir, metodo, moverCaja }
      : pagar > EPS
        ? { direccion: "hecho" as const, monto: pagar, metodo, moverCaja }
        : null;
  if (compensar <= EPS && !pago) return null;
  return { fecha, compensar, pago };
}

/**
 * La huella de las partidas: si cambió entre la vista previa y el confirmar,
 * lo que se confirmó ya no es lo que se escribiría (409 `plan_cambio`).
 *
 * FNV-1a de ids y saldos en orden canónico. Se ordena con el `sort()` por
 * defecto (código de unidad) y no con `localeCompare`: el ICU del navegador y
 * el del servidor pueden ordenar distinto, y la huella daría otra.
 */
export function huellaDe(p: PartidasDePersona): string {
  const partes = [
    `b=${p.persona.beneficiarioId ?? ""}`,
    `p=${p.persona.parteId ?? ""}`,
    `c=${p.cruzable ? 1 : 0}`,
    /* Las fechas entran: el reparto FIFO sale de ellas, y cambiar la fecha de un
       movimiento o de un adelanto cambia a quién se imputa sin mover un saldo. */
    ...p.adelantos.map((a) => `a:${a.adelantoId}:${a.saldo.toFixed(2)}:${a.fecha}`).sort(),
    /* La guía de cada movimiento entra sólo si la tiene: lo anterior a ADR-437
       da la misma huella que antes. */
    p.forestal
      ? `f:${p.forestal.saldo.toFixed(2)}:${p.forestal.movimientos
          .map((m) => `${m.id}:${m.tipo}:${m.monto.toFixed(2)}:${m.fecha}${gtfDe(m) ? `:${gtfDe(m)}` : ""}`)
          .sort()
          .join(",")}`
      : "f:-",
    /* Lo pendiente de cada guía (ADR-437 §6): imputar a una guía que cambió
       entre la vista previa y el confirmar es imputar a otra cosa. */
    ...(p.forestal?.guias ?? []).map((g) => `g:${g.gtfNumber}:${g.pendiente.toFixed(2)}`).sort(),
    /* La dirección entra sólo si es RECIBIDO: lo anterior a ADR-448 da la misma huella. */
    ...p.fuera
      .map((f) => `x:${f.etiqueta}:${f.moneda}:${f.monto.toFixed(2)}${f.direccion ? `:${f.direccion}:${f.quien ?? ""}` : ""}`)
      .sort(),
  ].join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < partes.length; i++) {
    h ^= partes.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ── Cómo se lee ──────────────────────────────────────────────────────────────

/** La descripción de la entrega que se escribe, con el código del acto. */
export function descripcionEntrega(e: Pick<EntregaPlaneada, "paso">, codigo: string, metodo: MetodoPago | null): string {
  return e.paso === "cruce" ? `Cruce ${codigo} con la cuenta forestal` : `Pago ${codigo}${metodo ? ` (${metodo})` : ""}`;
}

/** Las notas del movimiento forestal que se escribe, con el código del acto. */
export function notasMovimiento(m: Pick<MovimientoPlaneado, "notas">, codigo: string): string {
  return `${codigo} · ${m.notas}`.slice(0, 500);
}

/** La vista previa en frases: qué se escribe en cada libreta y qué pasa con la caja. */
export function leerPlan(plan: PlanLiquidacion, nombre: string): string[] {
  const lineas: string[] = [];
  for (const e of plan.entregas) {
    lineas.push(
      e.paso === "cruce"
        ? `Se descuentan ${soles(e.valor)} del adelanto ${e.codigo ?? "sin código"} por el cruce.`
        : `Se cobran ${soles(e.valor)} del adelanto ${e.codigo ?? "sin código"}.`,
    );
  }
  for (const m of plan.movimientos) {
    lineas.push(
      m.concepto === "compensacion"
        ? `En la cuenta forestal se anota el cruce por ${soles(m.monto)}${m.gtfNumber ? ` (guía ${m.gtfNumber})` : ""}.`
        : m.concepto === "pago"
          ? `En la cuenta forestal se abonan ${soles(m.monto)} de su pago.`
          : `Le pagas ${soles(m.monto)} a ${nombre}${m.gtfNumber ? ` por la guía ${m.gtfNumber}` : ""}.`,
    );
  }
  if (plan.caja) {
    lineas.push(
      plan.caja.tipo === "ingreso"
        ? `Entran ${soles(plan.caja.monto)} a la caja (${plan.caja.metodo}).`
        : `Salen ${soles(plan.caja.monto)} de la caja (${plan.caja.metodo}).`,
    );
  } else if (plan.pago) {
    lineas.push("No mueve la caja.");
  }
  return lineas;
}

/** El acta que se congela en la cabecera: cada pata con el id de lo que se escribió. */
export function detalleDeLiquidacion(
  plan: PlanLiquidacion,
  ids: { codigo: string; entregaIds: readonly string[]; movimientoIds: readonly string[] },
): DetalleLiquidacion {
  const { entregas, movimientos, ...resto } = plan;
  return {
    v: 1,
    ...resto,
    entregas: entregas.map((e, i) => ({
      ...e,
      descripcion: descripcionEntrega(e, ids.codigo, plan.pago?.metodo ?? null),
      entregaId: ids.entregaIds[i] ?? "",
    })),
    movimientos: movimientos.map((m, i) => ({ ...m, notas: notasMovimiento(m, ids.codigo), movimientoId: ids.movimientoIds[i] ?? "" })),
  };
}

/**
 * Sólo se anula la ÚLTIMA liquidación viva de la persona: el papel de la
 * siguiente imprimió un «saldo antes» que cuenta a ésta.
 */
export function motivoNoSePuedeAnular(
  liq: { id: string; anulada: boolean },
  ultimaViva: { id: string; codigo: string } | null,
): string | null {
  if (liq.anulada) return "Esta liquidación ya está anulada.";
  if (ultimaViva && ultimaViva.id !== liq.id) {
    return `Anula primero ${ultimaViva.codigo}: su papel cuenta a esta liquidación en el saldo de antes.`;
  }
  return null;
}

/** El texto para mandar por WhatsApp. Sale del acta, nunca de recalcular. */
export function textoLiquidacion(d: LiquidacionDTO): string {
  const det = d.detalle;
  const lineas = [
    `*Liquidación ${d.codigo}*${d.anulada ? " — ANULADA" : ""}`,
    `Fecha: ${d.fecha}`,
    `Persona: ${d.persona.nombre}${d.persona.documento ? ` (${d.persona.documento})` : ""}`,
  ];
  if (d.compensado > EPS) lineas.push(`Cruce entre adelantos y cuenta forestal: ${soles(d.compensado)}`);
  if (d.pago) {
    lineas.push(
      `${d.pago.direccion === "recibido" ? "Pago recibido" : "Pago entregado"}: ${soles(d.pago.monto)} (${d.pago.metodo})`,
    );
  }
  if (det?.antes && det?.despues) {
    lineas.push(`Antes: ${leerNeto(det.antes.neto, d.persona.nombre)}`);
    lineas.push(`Después: ${leerNeto(det.despues.neto, d.persona.nombre)}`);
  }
  if (d.anulada) lineas.push(`Motivo de la anulación: ${d.anulada.motivo}`);
  return lineas.join("\n");
}

// ── Entrada ──────────────────────────────────────────────────────────────────

const METODOS = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const;
const monto = z.number().min(0).max(9_999_999);
const comprobanteSchema = z
  .union([z.string().max(500), z.looseObject({ url: z.string().max(500) })])
  .transform((v, ctx): FotoCarga => {
    const f = normalizarFoto(v);
    if (!f) {
      ctx.addIssue({ code: "custom", message: "Esa foto del comprobante no es válida: súbela de nuevo." });
      return z.NEVER;
    }
    return f;
  });

export const liquidacionInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    persona: z
      .object({ beneficiarioId: z.string().min(1).max(40).optional(), parteId: z.string().min(1).max(40).optional() })
      .refine((p) => p.beneficiarioId || p.parteId, "Elige a la persona"),
    /* Una fecha futura no es un acto que pasó, y el año del código LIQ sale de
       ella: con 2099 nacía un LIQ-2099-0001. */
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      /* `2026-02-31` pasaba el regex y `new Date` lo volvía 3 de marzo en silencio. */
      .refine(esDiaDelCalendario, "Esa fecha no existe en el calendario.")
      .refine((f) => f <= limaDateKey(), "La fecha no puede ser futura: usa la de hoy o una pasada."),
    compensar: monto,
    pago: z
      .object({ direccion: z.enum(["recibido", "hecho"]), monto: monto.positive(), metodo: z.enum(METODOS), moverCaja: z.boolean() })
      .nullable(),
    imputacion: z
      .object({
        compensacion: z.array(z.object({ adelantoId: z.string().min(1).max(40), monto })).max(200).optional(),
        pago: z.array(z.object({ partida: z.string().regex(/^(forestal|adelanto:[\w-]{1,40})$/), monto })).max(200).optional(),
        /* ADR-437 §6: la parte del cruce o del pago hecho que va a guías con nombre. */
        guias: z
          /* 80 = el mismo largo que acepta la guía (`plata-de-guia.ts`): con 60, una
             guía de nombre largo se veía en el modal y no se podía pagar. */
          .array(z.object({ gtfNumber: z.string().trim().min(1).max(80), monto: monto.positive(), paso: z.enum(["cruce", "pago"]) }))
          .max(100)
          .optional(),
      })
      .optional(),
    huella: z.string().min(1).max(64),
    notas: z.string().trim().max(500).optional(),
    /* Fotos del comprobante (ADR-437 §6). Acá sólo la forma; la firma HMAC, que
       sean de este negocio y que no sean de otro pago los valida el servidor. */
    comprobantes: z.array(comprobanteSchema).max(10).optional(),
  })
  .refine((d) => d.compensar > 0 || d.pago != null, "No hay nada que liquidar");
export type LiquidacionInput = z.infer<typeof liquidacionInputSchema>;

export const anularLiquidacionSchema = z.object({
  action: z.literal("anular"),
  motivo: z.string().trim().min(3).max(300),
  devolucionCaja: z.enum(METODOS).nullable(),
});
