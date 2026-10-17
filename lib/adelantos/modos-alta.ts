/**
 * Los cuatro modos del alta «Nuevo adelanto» (ADR-448).
 *
 * Brandon (28-09): «quiero agregar campos de si se dio la plata o se recibió
 * como amortización o adelanto por el servicio que vamos a dar». El alta sólo
 * sabía DAR. Ahora la primera pregunta es quién pone la plata, y de eso cuelga
 * todo: hacia dónde va la caja, qué cifra de la persona se mueve, qué se
 * pregunta después y qué dice el botón.
 *
 * | modo     | crea               | caja   | mueve             |
 * |----------|--------------------|--------|-------------------|
 * | dar      | adelanto DADO      | egreso | «te debe» sube    |
 * | abono    | nada: una entrega  | ingreso| «te debe» baja    |
 * | servicio | RECIBIDO SERVICIO  | ingreso| «le debes» sube   |
 * | prestamo | RECIBIDO PRESTAMO  | ingreso| «le debes» sube   |
 *
 * PURO: sin React, sin fetch, sin Prisma. La pantalla y sus tests lo usan igual.
 */

import type { AdelantoModalidad } from "@/lib/db/adelantos.db";
import type { MetodoPago } from "@/lib/adelantos/movimiento-caja";
import { imputarFifo, type IntencionLiquidacion } from "@/lib/cuentas/liquidacion";
import {
  cajaAlCrear,
  cajaAlDevolver,
  direccionDe,
  quienDebe,
  type AdelantoConceptoRecibido,
  type AdelantoDireccion,
} from "./direccion";

export type ModoAlta = "dar" | "abono" | "servicio" | "prestamo";
export const MODOS_ALTA: readonly ModoAlta[] = ["dar", "abono", "servicio", "prestamo"] as const;

export interface OpcionModalidad {
  id: AdelantoModalidad;
  label: string;
  pista: string;
}

export interface DefModo {
  id: ModoAlta;
  titulo: string;
  pista: string;
  caja: "egreso" | "ingreso";
  /** `null` = no crea un adelanto: el abono cae sobre uno que ya existe. */
  direccion: AdelantoDireccion | null;
  concepto: AdelantoConceptoRecibido | null;
  tituloPersona: string;
  tituloMonto: string;
  preguntaCaja: string;
  tituloDevolucion: string;
  boton: string;
  modalidades: readonly OpcionModalidad[];
  /** Qué cifra de la persona mueve y hacia dónde. */
  cifra: "te-debe" | "le-debes";
  signo: 1 | -1;
}

const PLAN: OpcionModalidad = { id: "ENTREGAS_PACTADAS", label: "Con un plan de entregas", pista: "Cuotas con fecha y monto" };

export const MODO: Record<ModoAlta, DefModo> = {
  dar: {
    id: "dar",
    titulo: "Doy plata",
    pista: "Le adelantas a alguien",
    caja: cajaAlCrear("DADO"),
    direccion: "DADO",
    concepto: null,
    tituloPersona: "¿A quién se la das?",
    tituloMonto: "¿Cuánto le das?",
    preguntaCaja: "¿De dónde sale la plata?",
    tituloDevolucion: "¿Cómo te lo devuelve?",
    boton: "Registrar adelanto",
    modalidades: [
      { id: "CUENTA_CORRIENTE", label: "Cuenta corriente", pista: "Con lo que vaya entregando" },
      { id: "ENTREGAS_PACTADAS", label: "Entregas pactadas", pista: "Plan fijo de entregas con fecha" },
      { id: "DESCUENTO_PLANILLA", label: "Descuento por planilla", pista: "Adelanto de sueldo: sale del pago" },
    ],
    cifra: "te-debe",
    signo: 1,
  },
  abono: {
    id: "abono",
    titulo: "Me pagan lo que me deben",
    pista: "Abono a un adelanto abierto",
    caja: cajaAlDevolver("DADO"),
    direccion: null,
    concepto: null,
    tituloPersona: "¿Quién te paga?",
    tituloMonto: "¿Cuánto te paga?",
    preguntaCaja: "¿A dónde entra la plata?",
    tituloDevolucion: "¿A qué adelanto va?",
    boton: "Registrar abono",
    modalidades: [],
    cifra: "te-debe",
    signo: -1,
  },
  servicio: {
    id: "servicio",
    titulo: "Me adelantan por un servicio",
    pista: "Te pagan antes el trabajo que harás",
    caja: cajaAlCrear("RECIBIDO"),
    direccion: "RECIBIDO",
    concepto: "SERVICIO",
    tituloPersona: "¿Quién te adelanta?",
    tituloMonto: "¿Cuánto te adelanta?",
    preguntaCaja: "¿A dónde entra la plata?",
    tituloDevolucion: "¿Cómo se lo devuelves?",
    boton: "Registrar lo recibido",
    modalidades: [{ id: "CUENTA_CORRIENTE", label: "Con el servicio que vayas dando", pista: "Cada trabajo descuenta" }, PLAN],
    cifra: "le-debes",
    signo: 1,
  },
  prestamo: {
    id: "prestamo",
    titulo: "Me prestan plata",
    pista: "Tú la devuelves después",
    caja: cajaAlCrear("RECIBIDO"),
    direccion: "RECIBIDO",
    concepto: "PRESTAMO",
    tituloPersona: "¿Quién te presta?",
    tituloMonto: "¿Cuánto te presta?",
    preguntaCaja: "¿A dónde entra la plata?",
    tituloDevolucion: "¿Cómo se lo devuelves?",
    boton: "Registrar lo recibido",
    modalidades: [{ id: "CUENTA_CORRIENTE", label: "Con plata o madera", pista: "Cuando puedas, sin fechas fijas" }, PLAN],
    cifra: "le-debes",
    signo: 1,
  },
};

export const esModoRecibido = (m: ModoAlta): boolean => MODO[m].direccion === "RECIBIDO";

/** La dirección y el concepto de un adelanto que puede venir de antes (sin esos campos = DADO). */
export function leerDireccion(a: object): { direccion: AdelantoDireccion; concepto: AdelantoConceptoRecibido | null } {
  const v = a as { direccion?: unknown; conceptoRecibido?: unknown };
  const direccion = direccionDe(v.direccion);
  const concepto = direccion === "RECIBIDO" && (v.conceptoRecibido === "SERVICIO" || v.conceptoRecibido === "PRESTAMO") ? v.conceptoRecibido : null;
  return { direccion, concepto };
}

/** El modo con el que se habría cargado un adelanto que ya existe. */
export function modoDeAdelanto(a: object): Exclude<ModoAlta, "abono"> {
  const { direccion, concepto } = leerDireccion(a);
  if (direccion === "DADO") return "dar";
  return concepto === "PRESTAMO" ? "prestamo" : "servicio";
}

/** Los adelantos del mismo modo: «repetir el último» no mezcla lo dado con lo recibido. */
export function adelantosDelModo<T extends object>(adelantos: readonly T[], modo: ModoAlta): T[] {
  if (modo === "abono") return [];
  return adelantos.filter((a) => modoDeAdelanto(a) === modo);
}

/** La modalidad pedida si el modo la admite; si no, la primera que admite. */
export function modalidadValida(modo: ModoAlta, modalidad: AdelantoModalidad): AdelantoModalidad {
  const ops = MODO[modo].modalidades;
  return ops.some((o) => o.id === modalidad) ? modalidad : (ops[0]?.id ?? "CUENTA_CORRIENTE");
}

/**
 * La caja por defecto según la fecha: un adelanto cargado otro día no salió del
 * cajón de hoy. En Blas, ADL-0001 (28-08) y ADL-0002 (27-09) movieron la caja
 * del día en que se cargaron porque el default era siempre «efectivo».
 */
export const metodoCajaPorDefecto = (fecha: string, hoy: string): "efectivo" | "" => (fecha === hoy ? "efectivo" : "");

type PorMoneda = Record<string, number>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

function sumar(...mapas: (PorMoneda | undefined)[]): PorMoneda {
  const out: PorMoneda = {};
  for (const m of mapas) for (const [k, v] of Object.entries(m ?? {})) out[k] = r2((out[k] ?? 0) + (Number(v) || 0));
  return out;
}

export interface CuentaDePersona {
  teDebe: PorMoneda;
  leDebes: PorMoneda;
}

/**
 * Las dos cifras de la persona. El servidor manda `teDebe`/`leDebes` (ADR-448
 * §2.6); si todavía no, se arman con lo de antes: lo DADO abierto te lo debe,
 * lo DADO excedido se lo debes — que es exactamente lo que significaba hasta hoy.
 */
export function cuentaDePersona(p: {
  saldoPendiente: PorMoneda;
  saldoAFavor: PorMoneda;
  teDebe?: PorMoneda;
  leDebes?: PorMoneda;
  recibidoPendiente?: PorMoneda;
  recibidoExcedido?: PorMoneda;
}): CuentaDePersona {
  return {
    teDebe: p.teDebe ? sumar(p.teDebe) : sumar(p.saldoPendiente, p.recibidoExcedido),
    leDebes: p.leDebes ? sumar(p.leDebes) : sumar(p.saldoAFavor, p.recibidoPendiente),
  };
}

export const hayDeuda = (m: PorMoneda): boolean => Object.values(m).some((v) => v > EPS);

export interface Proyeccion {
  cifra: "te-debe" | "le-debes";
  antes: number;
  despues: number;
  /** El abono pasa lo que debía: lo que sobra queda a favor suyo («le debes»). */
  cruza: boolean;
  /** Cuánto del abono sobra y pasa a «le debes» (0 si no sobra). */
  excedente: number;
}

/**
 * Cómo queda la cifra que mueve el modo, en la moneda del alta.
 *
 * `topeAbono`: lo que debe el adelanto ELEGIDO. Un abono de 150 a uno que debe
 * 100 no baja «te debe» en 150: baja 100 y los otros 50 quedan a favor suyo
 * (ese adelanto pasa a excedido). Sin el tope el panel decía «300 → 150» y
 * nadie avisaba del −50 (revisión 28-09).
 */
export function proyeccionCuenta(
  modo: ModoAlta,
  cuenta: CuentaDePersona,
  monto: number,
  moneda: string,
  topeAbono?: number | null,
): Proyeccion {
  const def = MODO[modo];
  const base = def.cifra === "te-debe" ? cuenta.teDebe : cuenta.leDebes;
  const antes = r2(base[moneda] ?? 0);
  const m = Math.max(0, monto || 0);
  if (def.signo === 1) return { cifra: def.cifra, antes, despues: r2(antes + m), cruza: false, excedente: 0 };
  const aplicado = topeAbono != null ? Math.min(m, Math.max(0, topeAbono)) : m;
  const despues = r2(antes - aplicado);
  const excedente = r2(m - aplicado + Math.max(0, -despues));
  return { cifra: def.cifra, antes, despues: Math.max(0, despues), cruza: excedente > EPS, excedente: excedente > EPS ? excedente : 0 };
}

export interface LineaCaja {
  tipo: "egreso" | "ingreso" | "nada";
  monto: number;
  metodo: string | null;
}

/**
 * Qué le pasa a la caja al guardar. El tipo sale del método, no del monto: con
 * el monto todavía vacío y «Efectivo» elegido, decir «no mueve la caja» mentía.
 */
export function lineaCaja(modo: ModoAlta, metodoCaja: string, monto: number): LineaCaja {
  const m = r2(Math.max(0, monto || 0));
  if (!metodoCaja) return { tipo: "nada", monto: m, metodo: null };
  return { tipo: MODO[modo].caja, monto: m, metodo: metodoCaja };
}

// ── Abono: a qué adelanto va ─────────────────────────────────────────────────

type AdelantoLeido = {
  id: string;
  beneficiarioId: string;
  codigoOperacion?: string | null;
  fechaAdelanto: string;
  saldoPendiente: number;
  moneda?: string | null;
  modalidad: string;
  status: string;
  entregasPactadas?: readonly {
    id: string;
    numero?: number;
    valorEsperado?: number;
    fechaEsperada?: string | null;
    cumplidaEn?: string | null;
  }[];
};

/** Una cuota del plan que todavía no se cumplió: el abono la puede marcar. */
export interface CuotaPendiente {
  id: string;
  numero: number;
  valor: number;
  fecha: string | null;
}

export interface Abonable {
  id: string;
  codigo: string | null;
  fecha: string;
  saldo: number;
  moneda: string;
  /** Tiene cuotas pactadas: una entrega suelta no marca la cuota. */
  conCuotas: boolean;
  /** Las cuotas sin cumplir, por número: «Elegir uno» marca la que se elija. */
  cuotas: CuotaPendiente[];
}

export interface FueraDelAbono {
  id: string;
  codigo: string | null;
  monto: number;
  moneda: string;
  motivo: string;
}

/**
 * Qué adelantos de la persona puede pagar un abono. `adentro` entra al reparto
 * «la más vieja primero» (soles, sin cuotas: la misma regla que Liquidar,
 * `clasificarAdelantos`); `elegibles` son todos los que te deben, para elegir
 * uno a mano; `fuera` se muestra con su motivo — esconderlo haría creer que la
 * cuenta quedó en cero cuando no.
 */
export function abonablesDe(adelantos: readonly AdelantoLeido[], beneficiarioId: string) {
  const elegibles: Abonable[] = [];
  const fuera: FueraDelAbono[] = [];
  const suyos = adelantos
    .filter((a) => a.beneficiarioId === beneficiarioId)
    .sort((a, b) => (a.fechaAdelanto < b.fechaAdelanto ? -1 : a.fechaAdelanto > b.fechaAdelanto ? 1 : a.id < b.id ? -1 : 1));
  for (const a of suyos) {
    const q = quienDebe({ ...leerDireccion(a), status: a.status, saldoPendiente: a.saldoPendiente });
    const moneda = a.moneda || "PEN";
    const base = { id: a.id, codigo: a.codigoOperacion ?? null, monto: r2(Math.abs(a.saldoPendiente)), moneda };
    if (q === "le-debes") {
      fuera.push({
        ...base,
        motivo: leerDireccion(a).direccion === "RECIBIDO" ? "Es plata que te dieron: esa la devuelves tú." : "Te entregó de más: está a favor suyo.",
      });
      continue;
    }
    if (q !== "te-debe" || a.status !== "ABIERTO") continue;
    const cuotas = (a.entregasPactadas ?? [])
      .filter((c) => !c.cumplidaEn)
      .map((c, i) => ({ id: c.id, numero: c.numero ?? i + 1, valor: r2(Number(c.valorEsperado) || 0), fecha: c.fechaEsperada ?? null }))
      .sort((x, y) => x.numero - y.numero);
    elegibles.push({
      id: a.id,
      codigo: base.codigo,
      fecha: a.fechaAdelanto,
      saldo: base.monto,
      moneda,
      conCuotas: a.modalidad === "ENTREGAS_PACTADAS" || (a.entregasPactadas?.length ?? 0) > 0,
      cuotas,
    });
  }
  const adentro = elegibles.filter((a) => a.moneda === "PEN" && !a.conCuotas);
  for (const a of elegibles) {
    if (a.moneda !== "PEN") fuera.push({ id: a.id, codigo: a.codigo, monto: a.saldo, moneda: a.moneda, motivo: `Es en ${a.moneda}: el reparto va en soles. Elígelo aparte.` });
    else if (a.conCuotas) fuera.push({ id: a.id, codigo: a.codigo, monto: a.saldo, moneda: a.moneda, motivo: "Tiene cuotas pactadas: elígelo aparte para marcar su cuota." });
  }
  return { elegibles, adentro, fuera };
}

export interface ParteDelAbono {
  adelantoId: string;
  codigo: string | null;
  monto: number;
}

/** «La más vieja primero»: sin darle a ninguno más que su saldo (`imputarFifo` de Liquidar). */
export function repartoDelAbono(adentro: readonly Abonable[], monto: number): ParteDelAbono[] {
  return imputarFifo(adentro, monto).map((x) => ({ adelantoId: x.partida.id, codigo: x.partida.codigo, monto: x.monto }));
}

// ── Lo que viaja al servidor ─────────────────────────────────────────────────

/**
 * Una fecha suelta («2026-08-03») se parsea como medianoche UTC: en Lima es el
 * día ANTERIOR a las 19:00. Al mediodía local el día es el correcto.
 */
export const aIsoLocal = (dia: string): string => new Date(`${dia}T12:00:00`).toISOString();

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "en efectivo",
  yape: "por Yape",
  plin: "por Plin",
  tarjeta: "con tarjeta",
  transferencia: "por transferencia",
};

export interface BorradorAlta {
  modo: ModoAlta;
  beneficiarioId: string;
  modalidad: AdelantoModalidad;
  monto: number;
  moneda: string;
  fecha: string;
  hoy: string;
  vencimiento: string;
  notas: string;
  reciboManual: string;
  metodoCaja: string;
  comprobante: string | null;
  forzarLimite: boolean;
  plan: { descripcionEsperada: string; valorEsperado: number; fechaEsperada?: string }[];
  piesTablares: string;
  piesTablaresTipo: "COMPRADO" | "VENDIDO" | "";
  contratoId: string | null;
}

/** El cuerpo de `POST /api/adelantos` para dar, un adelanto por servicio o un préstamo. */
export function cuerpoAdelanto(b: BorradorAlta): Record<string, unknown> {
  const def = MODO[b.modo];
  const modalidad = modalidadValida(b.modo, b.modalidad);
  const pt = Number(b.piesTablares) || 0;
  /* En un servicio, los pt son el trabajo que se va a dar; en lo dado, una
     referencia comprado/vendido — sin el tipo no dicen de qué lado están. En
     un préstamo no van: los cargados en «Doy plata» viajaban escondidos al
     cambiar de modo (revisión 28-09). */
  const tipoPt = b.modo === "servicio" ? "SERVICIO" : b.modo === "dar" ? b.piesTablaresTipo : "";
  return {
    beneficiarioId: b.beneficiarioId,
    modalidad,
    montoAdelantado: r2(b.monto),
    moneda: b.moneda,
    ...(def.direccion === "RECIBIDO" ? { direccion: "RECIBIDO", conceptoRecibido: def.concepto } : {}),
    /* Si es hoy va sin fecha: el servidor estampa la hora exacta. */
    fechaAdelanto: b.fecha && b.fecha !== b.hoy ? aIsoLocal(b.fecha) : undefined,
    fechaVencimiento: b.vencimiento ? aIsoLocal(b.vencimiento) : null,
    notas: b.notas.trim() || undefined,
    reciboManual: b.reciboManual.trim() || undefined,
    metodoCaja: b.metodoCaja || undefined,
    comprobanteUrl: b.comprobante || undefined,
    forzarLimite: b.modo === "dar" && b.forzarLimite ? true : undefined,
    entregasPactadas: modalidad === "ENTREGAS_PACTADAS" && b.plan.length ? b.plan : undefined,
    piesTablares: pt > 0 && tipoPt ? pt : undefined,
    piesTablaresTipo: pt > 0 && tipoPt ? tipoPt : undefined,
    contratoId: b.contratoId,
  };
}

type BorradorAbono = Pick<BorradorAlta, "monto" | "metodoCaja" | "fecha" | "hoy" | "notas" | "reciboManual" | "comprobante"> & {
  /** La cuota del plan que este abono cumple (se marca en la misma operación). */
  pactadaId?: string | null;
};

const notasDelAbono = (b: BorradorAbono) =>
  [b.reciboManual.trim() ? `Recibo ${b.reciboManual.trim()}` : "", b.notas.trim()].filter(Boolean).join(" · ") || undefined;

/** El cuerpo de `POST /api/adelantos/[id]/entregas` cuando el abono va a UN adelanto. */
export function cuerpoAbonoEntrega(b: BorradorAbono): Record<string, unknown> {
  return {
    tipo: "LIBRE",
    valorManual: r2(b.monto),
    descripcion: `Abono${b.metodoCaja ? ` ${ETIQUETA_METODO[b.metodoCaja] ?? b.metodoCaja}` : ""}`,
    metodoCaja: b.metodoCaja || null,
    fecha: b.fecha && b.fecha !== b.hoy ? aIsoLocal(b.fecha) : undefined,
    notas: notasDelAbono(b),
    comprobanteUrl: b.comprobante || undefined,
    ...(b.pactadaId ? { pactadaId: b.pactadaId } : {}),
  };
}

/**
 * La intención de Liquidar (ADR-413) cuando el abono se reparte entre varios:
 * un solo acto con código LIQ, atómico, con el reparto dicho adelanto por
 * adelanto — así no cae en la cuenta forestal aunque la persona esté vinculada.
 */
export function intencionAbonoRepartido(b: BorradorAbono, reparto: readonly ParteDelAbono[]): IntencionLiquidacion {
  return {
    fecha: b.fecha || b.hoy,
    compensar: 0,
    pago: { direccion: "recibido", monto: r2(b.monto), metodo: (b.metodoCaja || "efectivo") as MetodoPago, moverCaja: !!b.metodoCaja },
    imputacion: { pago: reparto.map((r) => ({ partida: `adelanto:${r.adelantoId}`, monto: r.monto })) },
    notas: notasDelAbono(b),
  };
}
