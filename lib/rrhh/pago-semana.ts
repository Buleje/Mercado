/**
 * El pago del sábado: lo ganado de la semana menos los adelantos que se le
 * dieron al trabajador (Brandon 24-10: «a veces piden plata y todo eso se le
 * descuenta el sábado cuando se va a pagar»).
 *
 * DECISIONES (cada una cerró un camino a pagar mal):
 *
 * 1. **La semana es lunes a domingo y se calcula con `hoy = domingo`.** Pagando
 *    el sábado, `calcularGanado` cortaba en el sábado y un sueldo SEMANAL daba
 *    6/7. El domingo sin marca de un semanal es su descanso pagado; el de un
 *    jornal (DIA/HORA) sin marca no cuenta — igual que cualquier otro día.
 *
 * 2. **Sin tarifa no se inventa un sueldo.** `referencia` nula (o «sin pago») =
 *    «falta definir su pago»: el dueño escribe el monto, y sólo en ese caso el
 *    servidor acepta un monto escrito. Con tarifa, el monto es el calculado.
 *    Quien cobra por MES no entra en el sábado: su pago es el del mes.
 *
 * 3. **Se descuentan los adelantos de planilla ABIERTOS, hasta lo ganado.**
 *    El más viejo primero; lo que no alcanza queda abierto para la semana que
 *    viene. Nunca más que su saldo (ver `proponerDescuentos`), nunca en otra
 *    moneda (no se restan dólares de un sueldo en soles).
 *
 * 4. **Lo ya descontado para ESTA semana resta también** (el descuento de
 *    planilla hecho a mano desde Adelantos o Lo ganado): sin eso, pagar después
 *    de descontar a mano le daba el sueldo entero — misma regla que
 *    `calcularQuedaPorPagar` (lib/rrhh/ganado.ts, decisión 5).
 *
 * 5. **Las otras deudas (cuenta corriente) se muestran, no se descuentan.**
 *    Un préstamo de cuenta corriente no se acordó contra el sueldo.
 *
 * PURO: sin Prisma, React ni fetch. El servidor lo llama bajo los locks y la
 * pantalla sólo muestra lo que el servidor devolvió.
 */

import { proponerDescuentos, type AdelantoDePlanilla } from "@/lib/adelantos/planilla-lote";
import { semanaDe, sumarDias } from "./fechas";
import type { FechaKey, Modalidad } from "./tipos";

/** El tipo de aviso del sábado en la campana (sólo la gestión lo ve). */
export const TIPO_AVISO_PAGO_SABADO = "RRHH_PAGO_SABADO";

/** Marca del pago en Mi Plata: el comprobante del gasto. Una por persona y semana. */
export function marcaDelPago(desde: FechaKey, colaboradorId: string): string {
  return `RRHH-${desde}-${colaboradorId}`;
}

/**
 * Cómo se busca la marca en la base: sin mayúsculas y sin exigir el tipo
 * «recibo» (defensa en profundidad: si el papel del gasto se reescribió, la
 * semana igual se ve pagada y no se paga dos veces).
 */
export function filtroDeMarcas(marcas: string[]): { in: string[]; mode: "insensitive" } {
  return { in: marcas, mode: "insensitive" };
}

/** La llave de una marca para cruzar lo leído con lo buscado (sin mayúsculas). */
export function llaveDeMarca(documentNumber: string | null | undefined): string {
  return (documentNumber ?? "").toLowerCase();
}

/**
 * ¿Es el gasto de un pago de la semana? Su comprobante es la marca
 * (`marcaDelPago`). Sin mayúsculas: el papel de Mi Plata pasaba el número a
 * MAYÚSCULAS al editar otro campo y la marca dejaba de reconocerse.
 */
export function esGastoDePagoRrhh(documentNumber: string | null | undefined): boolean {
  return /^RRHH-\d{4}-\d{2}-\d{2}-./i.test(documentNumber ?? "");
}

/**
 * Lo único que Mi Plata puede cambiar del gasto de un pago de la semana: la
 * descripción, la nota y la foto. Todo lo demás (monto, categoría, fecha,
 * medio, comprobante, RUC, IGV) o descuadra el pago o reescribe la marca: el
 * papel la pasa a MAYÚSCULAS o la borra, la semana se ve sin pagar y se podía
 * pagar otra vez (segundo gasto y segundo retiro de la caja).
 */
export const CAMPOS_EDITABLES_DEL_PAGO_RRHH: readonly string[] = ["description", "notes", "attachmentUrl"];

/** Los campos del cambio que el gasto de un pago de la semana no acepta (los que vienen con valor). */
export function camposBloqueadosDelPagoRrhh(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).filter(
    (k) => patch[k] !== undefined && !CAMPOS_EDITABLES_DEL_PAGO_RRHH.includes(k),
  );
}

/**
 * Por qué no se corrige desde Mi Plata: el gasto lleva lo ganado, la caja el
 * neto y los adelantos ya se cerraron con ese descuento. Cambiar el monto
 * descuadra los tres; cambiar el comprobante borra la marca y la semana se
 * vería sin pagar (se podría pagar dos veces).
 */
export const MENSAJE_GASTO_DE_PAGO_RRHH =
  "Es el pago de la semana de RRHH: corrígelo con «Deshacer» en RRHH › Asistencia › Ver el pago y vuelve a pagar.";

/** Prefijo de la clave de cada descuento del pago: deshacer lo encuentra sin columna nueva. */
/** El comienzo de la clave de todo descuento hecho por un pago de la semana. */
export const PREFIJO_CLAVE_PAGO_RRHH = "rrhh-pago:";

export function prefijoDescuentosDelPago(gastoId: string): string {
  return `${PREFIJO_CLAVE_PAGO_RRHH}${gastoId}:`;
}

export type TipoDePago = "tarifa" | "mensual" | "falta_definir";

export interface AdelantoParaPago extends AdelantoDePlanilla {
  /** ISO: cuándo se dio. El más viejo se descuenta primero. */
  fechaAdelanto: string;
}

export interface LineaDelPago {
  adelantoId: string;
  codigo: string | null;
  fecha: string;
  saldo: number;
  descuento: number;
  /** `true` = con este descuento el adelanto queda cerrado. */
  liquida: boolean;
}

export interface EntradaPago {
  /** La tarifa del último día que cuenta; `null` = no tiene. */
  referencia: { modalidad: Modalidad; monto: number } | null;
  /** Lo ganado de la semana según `calcularGanado` (con `hoy = domingo`). */
  ganado: number;
  /** Sólo se usa si `tipoDePago` da `falta_definir`. */
  montoManual?: number | null;
  /** Descuentos de planilla que ya llevan el período de esta semana. */
  descontadoPrevio: number;
  /** Sus adelantos (cualquiera): se filtran acá los que se descuentan. */
  adelantos: readonly AdelantoParaPago[];
}

export interface CalculoPago {
  tipo: TipoDePago;
  /** Lo que se le paga antes de descontar: lo ganado, o el monto escrito. `null` = falta escribirlo. */
  base: number | null;
  descontadoPrevio: number;
  lineas: LineaDelPago[];
  aDescontar: number;
  /** Lo que se le entrega en la mano. Nunca negativo. */
  neto: number;
  /** Saldo de planilla que queda abierto después de este pago. */
  sigueDebiendo: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function tipoDePago(referencia: EntradaPago["referencia"]): TipoDePago {
  if (!referencia || referencia.modalidad === "SIN_PAGO") return "falta_definir";
  if (referencia.modalidad === "MES") return "mensual";
  return "tarifa";
}

/** Los adelantos que se descuentan del sueldo, del más viejo al más nuevo. */
export function adelantosDescontables(adelantos: readonly AdelantoParaPago[]): AdelantoParaPago[] {
  const elegibles = new Set(proponerDescuentos(adelantos).map((l) => l.adelantoId));
  return adelantos
    .filter((a) => elegibles.has(a.id) && (a.moneda ?? "PEN") === "PEN")
    .sort((a, b) => a.fechaAdelanto.localeCompare(b.fechaAdelanto) || a.id.localeCompare(b.id));
}

export function calcularPagoSemana(e: EntradaPago): CalculoPago {
  const tipo = tipoDePago(e.referencia);
  const manual = e.montoManual != null && e.montoManual > 0 ? r2(e.montoManual) : null;
  const base = tipo === "tarifa" ? r2(e.ganado) : tipo === "falta_definir" ? manual : null;
  const descontadoPrevio = r2(Math.max(0, e.descontadoPrevio));
  const descontables = adelantosDescontables(e.adelantos);
  const saldoTotal = r2(descontables.reduce((a, x) => a + x.saldoPendiente, 0));

  const lineas: LineaDelPago[] = [];
  let restante = base == null ? 0 : r2(Math.max(0, base - descontadoPrevio));
  for (const a of descontables) {
    if (restante <= 0) break;
    const descuento = r2(Math.min(restante, a.saldoPendiente));
    if (descuento <= 0) continue;
    restante = r2(restante - descuento);
    lineas.push({
      adelantoId: a.id,
      codigo: a.codigoOperacion ?? null,
      fecha: a.fechaAdelanto,
      saldo: r2(a.saldoPendiente),
      descuento,
      liquida: descuento >= r2(a.saldoPendiente),
    });
  }
  const aDescontar = r2(lineas.reduce((a, l) => a + l.descuento, 0));
  const neto = base == null ? 0 : r2(Math.max(0, base - descontadoPrevio - aDescontar));
  return { tipo, base, descontadoPrevio, lineas, aDescontar, neto, sigueDebiendo: r2(saldoTotal - aDescontar) };
}

/** Lo mínimo de una fila para sumar los totales de la semana. */
export interface FilaParaTotales {
  calculo: CalculoPago;
  pagado: { neto: number; descontado: number } | null;
}

export interface TotalesSemana {
  /** Personas por pagar con un monto ya definido. */
  porPagar: number;
  netoPorPagar: number;
  adelantosPorDescontar: number;
  /** Personas a las que les falta definir el pago y tienen algo pendiente. */
  faltaDefinir: number;
  pagados: number;
  netoPagado: number;
  descontadoEnPagos: number;
}

/** Los totales los suma el servidor: la pantalla y el aviso del sábado leen éstos. */
export function totalesDeLaSemana(filas: readonly FilaParaTotales[]): TotalesSemana {
  const t: TotalesSemana = {
    porPagar: 0,
    netoPorPagar: 0,
    adelantosPorDescontar: 0,
    faltaDefinir: 0,
    pagados: 0,
    netoPagado: 0,
    descontadoEnPagos: 0,
  };
  for (const f of filas) {
    if (f.pagado) {
      t.pagados++;
      t.netoPagado = r2(t.netoPagado + f.pagado.neto);
      t.descontadoEnPagos = r2(t.descontadoEnPagos + f.pagado.descontado);
      continue;
    }
    const c = f.calculo;
    if (c.tipo === "mensual") continue;
    if (c.base == null) {
      if (c.tipo === "falta_definir") t.faltaDefinir++;
      continue;
    }
    if (c.base <= 0) continue;
    t.porPagar++;
    t.netoPorPagar = r2(t.netoPorPagar + c.neto);
    t.adelantosPorDescontar = r2(t.adelantosPorDescontar + c.aDescontar);
  }
  return t;
}

const soles = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** El texto del aviso del sábado. `null` = no hay a quién pagar. */
export function textoDelAvisoDelSabado(t: TotalesSemana): { title: string; body: string } | null {
  if (t.porPagar === 0 && t.faltaDefinir === 0) return null;
  // Sólo personas sin tarifa: «0 trabajadores · S/ 0,00» no dice nada (main, 24-10).
  if (t.porPagar === 0) {
    return {
      title: `Hoy se paga: a ${t.faltaDefinir} les falta definir el pago`,
      body: "Escribe cuánto se le paga a cada uno o ponle tarifa en su ficha.",
    };
  }
  const quienes = `${t.porPagar} ${t.porPagar === 1 ? "trabajador" : "trabajadores"}`;
  const falta = t.faltaDefinir > 0 ? ` · a ${t.faltaDefinir} les falta definir el pago` : "";
  return {
    title: `Hoy se paga: ${quienes} · ${soles(t.netoPorPagar)} neto`,
    body: `${soles(t.adelantosPorDescontar)} en adelantos a descontar${falta}.`,
  };
}

/** Lo que queda escrito en el gasto de Mi Plata: la resta entera, para poder explicarla después. */
export function notaDelPago(nombre: string, periodo: string, c: CalculoPago): string {
  const partes = [`Pago de ${nombre} · semana ${periodo}`, `${c.tipo === "tarifa" ? "ganado" : "monto acordado"} ${soles(c.base ?? 0)}`];
  if (c.descontadoPrevio > 0) partes.push(`ya descontado ${soles(c.descontadoPrevio)}`);
  if (c.aDescontar > 0) {
    const codigos = c.lineas.map((l) => l.codigo).filter(Boolean).join(", ");
    partes.push(`adelantos descontados ${soles(c.aDescontar)}${codigos ? ` (${codigos})` : ""}`);
  }
  partes.push(`neto entregado ${soles(c.neto)}`);
  return partes.join(" · ");
}

// ── Contrato de la pantalla (lo escribe el servidor, la pantalla sólo lo lee) ──

/** Un adelanto de planilla de la persona, como lo ve la tira de la semana. */
export interface AdelantoDeLaSemanaDTO {
  id: string;
  codigo: string | null;
  /** ISO. */
  fecha: string;
  monto: number;
  saldo: number;
  status: string;
  notas: string | null;
}

/** Lo que quedó anotado al pagar (la marca en Mi Plata). */
export interface PagoHechoDTO {
  gastoId: string;
  /** Lo que se le pagó antes de descontar (el costo del sueldo en Mi Plata). */
  base: number;
  /** Σ descuentos de adelantos hechos por ESTE pago. */
  descontado: number;
  /** Lo que se le entregó en la mano. */
  neto: number;
  metodo: string | null;
  /** ISO. */
  fecha: string;
  por: string | null;
  /** `true` = el neto salió de la caja (hay retiro anotado). */
  salioDeCaja: boolean;
  /**
   * Lo ganado de AHORA menos lo que se pagó (`base`), sólo con tarifa: el pago
   * congela lo ganado al momento de pagar. Ej.: pagó el sábado 9:00 y después
   * marcó el sábado (+S/ 50), o un semanal pagado el miércoles. `null` = cuadra
   * (o no se paga por tarifa). Positivo = se le debe; negativo = se le pagó de más.
   */
  diferencia: number | null;
}

/** Tope de semanas que se miran en un período (un año): acota la lista de marcas. */
const TOPE_SEMANAS = 53;

/**
 * Los lunes de las semanas que caen ENTERAS en `[desde, hasta]`: mismo criterio
 * que un descuento de planilla con período (`descuentoEsDelPeriodo`), así lo
 * pagado y lo descontado de una semana entran (o no) juntos en «Lo ganado».
 */
export function semanasEnterasDelPeriodo(desde: FechaKey, hasta: FechaKey): FechaKey[] {
  let lunes = semanaDe(desde).desde;
  if (lunes < desde) lunes = sumarDias(lunes, 7);
  const out: FechaKey[] = [];
  while (sumarDias(lunes, 6) <= hasta && out.length < TOPE_SEMANAS) {
    out.push(lunes);
    lunes = sumarDias(lunes, 7);
  }
  return out;
}

/**
 * Lo que se le entregó en la mano con el pago de una semana: lo pagado (el
 * monto del gasto, `base`) menos lo descontado por planilla para ESA semana
 * (lo previo y lo del pago). Es lo que resta «Queda por pagar» (decisión 6 de
 * `lib/rrhh/ganado.ts`); los descuentos ya los resta por su lado.
 */
export function entregadoDelPago(base: number, descontadoDeLaSemana: number): number {
  return Math.max(0, r2(base - descontadoDeLaSemana));
}

/** La diferencia entre lo ganado ahora y lo pagado; `null` si cuadra al céntimo o no hay tarifa. */
export function diferenciaDelPago(tipo: TipoDePago, ganadoAhora: number, pagado: number): number | null {
  if (tipo !== "tarifa") return null;
  const d = r2(ganadoAhora - pagado);
  return Math.abs(d) < 0.01 ? null : d;
}

export interface FilaPagoSemanaDTO {
  colaboradorId: string;
  nombre: string;
  puesto: string | null;
  estado: string;
  beneficiarioId: string | null;
  tipo: TipoDePago;
  referencia: { modalidad: Modalidad; monto: number } | null;
  /** Lo ganado de la semana (lunes a domingo, `hoy = domingo`). */
  ganado: number;
  /** Días de jornal sin marcar: lo ganado puede estar corto. */
  sinMarcar: number;
  avisos: string[];
  /** Los de planilla abiertos (lo que el pago descuenta) — también sirve a la vista previa. */
  abiertos: AdelantoParaPago[];
  descontadoPrevio: number;
  /** Sin pagar: la cuenta del servidor (con `montoManual` nulo si falta definir). */
  calculo: CalculoPago;
  /** Adelantos de planilla DADOS en esta semana (cualquier estado menos anulado). */
  adelantosDeLaSemana: AdelantoDeLaSemanaDTO[];
  /** Saldo abierto en soles que NO es de planilla (cuenta corriente): se muestra, no se descuenta. */
  otrasDeudas: number;
  pagado: PagoHechoDTO | null;
  /**
   * El gasto (ya borrado a mano en Mi Plata) de un pago de esta semana cuyos
   * descuentos siguen vivos. Mientras no se deshaga, no se puede pagar de nuevo.
   */
  pagoSinGasto: string | null;
}

export interface PagoSemanaDTO {
  desde: FechaKey;
  hasta: FechaKey;
  hoy: FechaKey;
  /** «del dd/mm al dd/mm/aaaa». */
  periodo: string;
  /** `true` = hoy es sábado en Lima (día de pago). */
  esDiaDePago: boolean;
  filas: FilaPagoSemanaDTO[];
  totales: TotalesSemana;
}
