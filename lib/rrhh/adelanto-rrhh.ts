/**
 * adelanto-rrhh.ts — lo puro de «Dar adelanto» desde la asistencia (Brandon 25-10:
 * «poner adelantos ahí mismo a esa persona para descontar la semana que culmine
 * esos adelantos, con los detalles y todos los campos bien hechos»).
 *
 * Tres piezas, las mismas en el servidor y en la ventana:
 *
 * 1. **El sábado del descuento** (`descuentoDelAdelanto`): el pago del sábado
 *    descuenta TODOS los adelantos de planilla abiertos, sin mirar su fecha.
 *    Así que el que se da hoy (o se anota con fecha pasada) cae en el primer
 *    sábado desde HOY — no desde el día del adelanto: un adelanto del jueves
 *    pasado anotado hoy no «venció» el sábado que ya pasó. Si la semana de ese
 *    sábado ya se le pagó, cae en el siguiente. Quien cobra por mes no se paga
 *    el sábado: su descuento es a fin de mes. Esta fecha va a `fechaVencimiento`
 *    del adelanto (la leen Cobranza, «hoy toca» y el aviso de los lunes).
 * 2. **La nota** (`notaDelAdelantoRrhh`): motivo, detalle y cómo se le dio van
 *    en una línea legible de `notas` (sin columna nueva).
 * 3. **La vista previa** (`vistaPreviaDelPago`): la misma `calcularPagoSemana`
 *    del servidor con el adelanto nuevo sumado a sus abiertos. Es vista previa:
 *    la cuenta que vale la hace el servidor al pagar.
 */

import { sumarDias, dateDeFechaKey, diasDelMes, etiquetaCorta } from "./fechas";
import { calcularPagoSemana, type AdelantoParaPago, type CalculoPago, type FilaPagoSemanaDTO, type TipoDePago } from "./pago-semana";
import type { FechaKey } from "./tipos";

export const MOTIVOS_ADELANTO = [
  { id: "pasaje", rotulo: "Pasaje" },
  { id: "salud", rotulo: "Salud" },
  { id: "comida", rotulo: "Comida" },
  { id: "familia", rotulo: "Familia" },
  { id: "otro", rotulo: "Otro" },
] as const;
export type MotivoAdelanto = (typeof MOTIVOS_ADELANTO)[number]["id"];
export const IDS_MOTIVO = MOTIVOS_ADELANTO.map((m) => m.id) as [MotivoAdelanto, ...MotivoAdelanto[]];

export const METODOS_ADELANTO = [
  { id: "efectivo", rotulo: "Efectivo", enLaNota: "en efectivo" },
  { id: "yape", rotulo: "Yape", enLaNota: "por Yape" },
  { id: "plin", rotulo: "Plin", enLaNota: "por Plin" },
  { id: "transferencia", rotulo: "Transferencia", enLaNota: "por transferencia" },
] as const;
export type MetodoAdelanto = (typeof METODOS_ADELANTO)[number]["id"];
export const IDS_METODO = METODOS_ADELANTO.map((m) => m.id) as [MetodoAdelanto, ...MetodoAdelanto[]];

/** Lo que se escribe en `notas` cuando no hay nada más. */
export const NOTA_BASE_ADELANTO_RRHH = "Adelanto de sueldo (RRHH)";

// ── El sábado del descuento ──────────────────────────────────────────────────

/** El primer sábado desde `dia` (el mismo `dia` si ya es sábado). */
export function primerSabadoDesde(dia: FechaKey): FechaKey {
  const dow = dateDeFechaKey(dia).getUTCDay(); // 0 = domingo … 6 = sábado
  return sumarDias(dia, (6 - dow + 7) % 7);
}

/** El último día del mes de `dia`. */
export function finDeMes(dia: FechaKey): FechaKey {
  return `${dia.slice(0, 7)}-${String(diasDelMes(dia)).padStart(2, "0")}`;
}

export interface DescuentoDelAdelanto {
  /** El día en que se le descuenta (va a `fechaVencimiento`). */
  fecha: FechaKey;
  tipo: TipoDePago;
  /** `true` = la semana del primer sábado ya se le pagó: cae en el siguiente. */
  semanaPagada: boolean;
}

export function descuentoDelAdelanto(e: { hoy: FechaKey; tipo: TipoDePago; semanaPagada: boolean }): DescuentoDelAdelanto {
  if (e.tipo === "mensual") return { fecha: finDeMes(e.hoy), tipo: e.tipo, semanaPagada: false };
  const sabado = primerSabadoDesde(e.hoy);
  return { fecha: e.semanaPagada ? sumarDias(sabado, 7) : sabado, tipo: e.tipo, semanaPagada: e.semanaPagada };
}

/** «Se descuenta el sábado 31/10» — la frase de la ventana, del aviso y de la lista de Mi Plata. */
export function textoDelDescuento(d: Pick<DescuentoDelAdelanto, "fecha" | "tipo">): string {
  if (d.tipo === "mensual") return `Cobra por mes: se descuenta en su pago del mes (${etiquetaCorta(d.fecha)})`;
  return `Se descuenta el sábado ${etiquetaCorta(d.fecha)}`;
}

// ── La nota ─────────────────────────────────────────────────────────────────

export interface PartesDeLaNota {
  motivo?: MotivoAdelanto | null;
  detalle?: string | null;
  metodo?: MetodoAdelanto | null;
  /** El texto libre de antes (la ficha del colaborador lo sigue mandando). */
  nota?: string | null;
}

/**
 * «Adelanto de sueldo (RRHH) · Pasaje: a Pucallpa · por Yape». «Otro» sin
 * detalle no se escribe (la ruta lo rechaza antes); el detalle de «Otro» va solo.
 */
export function notaDelAdelantoRrhh(p: PartesDeLaNota): string {
  const partes: string[] = [NOTA_BASE_ADELANTO_RRHH];
  const detalle = p.detalle?.trim() ?? "";
  const rotulo = MOTIVOS_ADELANTO.find((m) => m.id === p.motivo)?.rotulo;
  if (p.motivo === "otro") {
    if (detalle) partes.push(detalle);
  } else if (rotulo) {
    partes.push(detalle ? `${rotulo}: ${detalle}` : rotulo);
  } else if (detalle) {
    partes.push(detalle);
  }
  const metodo = METODOS_ADELANTO.find((m) => m.id === p.metodo);
  if (metodo) partes.push(metodo.enLaNota);
  const libre = p.nota?.trim();
  if (libre) partes.push(libre);
  return partes.join(" · ");
}

// ── La vista previa del sábado ───────────────────────────────────────────────

export interface VistaPreviaDelPago {
  /** Lo ganado de la semana; `null` = falta definir cuánto se le paga. */
  ganado: number | null;
  /** Lo que el sábado le descontaría con el adelanto nuevo incluido. */
  aDescontar: number;
  /** Lo que se le entregaría. */
  neto: number;
  /** Lo que sigue debiendo si lo ganado no alcanza. */
  sigueDebiendo: number;
  tipo: TipoDePago;
}

/**
 * La misma cuenta del pago del sábado con el adelanto nuevo sumado a sus
 * abiertos. `null` si la fila ya se pagó o si cobra por mes (el sábado no le toca).
 */
export function vistaPreviaDelPago(fila: FilaPagoSemanaDTO, monto: number, fechaIso: string): VistaPreviaDelPago | null {
  if (fila.pagado || fila.tipo === "mensual") return null;
  const nuevo: AdelantoParaPago = {
    id: "nuevo",
    codigoOperacion: null,
    modalidad: "DESCUENTO_PLANILLA",
    status: "ABIERTO",
    saldoPendiente: Math.round(Math.max(0, monto) * 100) / 100,
    moneda: "PEN",
    direccion: "DADO",
    fechaAdelanto: fechaIso,
  };
  const calculo: CalculoPago = calcularPagoSemana({
    referencia: fila.referencia,
    ganado: fila.ganado,
    montoManual: null,
    descontadoPrevio: fila.descontadoPrevio,
    adelantos: monto > 0 ? [...fila.abiertos, nuevo] : fila.abiertos,
  });
  return { ganado: calculo.base, aDescontar: calculo.aDescontar, neto: calculo.neto, sigueDebiendo: calculo.sigueDebiendo, tipo: calculo.tipo };
}
