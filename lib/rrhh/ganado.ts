/**
 * ganado.ts — lo ganado de referencia, función pura on-read (ADR-414 §5).
 *
 * Servidor (`GanadoDB.periodo`) y pantalla (vista previa) llaman `calcularGanado`
 * con los MISMOS argumentos — la lección de ADR-412, donde la vista previa
 * llamaba la misma función sin `unit` y calculaba 424 veces de más.
 *
 * **`calcularGanado` no resta adelantos** — dice cuánto se ganó y nada más. La
 * resta vive aparte, en `calcularQuedaPorPagar` (ADR-417), porque los dos
 * números ya salían en la misma fila y el usuario los restaba de cabeza.
 * Cuatro decisiones que esa resta tiene tomadas, y por qué:
 *
 * 1. **Es referencia, no un pago.** Sigue sin haber ningún pago de sueldo
 *    anotado: «queda por pagar» es la cuenta pendiente, no un recibo. Mismo
 *    tono que el resto del módulo (`COPY_REFERENCIA`).
 * 2. **El saldo de adelantos es a HOY, no del período.** Lo ganado se mide
 *    entre `desde` y `hasta`; el saldo abierto de Adelantos es el de hoy, venga
 *    de cuando venga. Son dos ventanas de tiempo distintas, y la pantalla lo
 *    dice en una línea: sin ese aviso la resta miente (`verificacion-de-verdad`
 *    §2, un derivado nunca se presenta como el dato).
 * 3. **Si el adelanto es mayor que lo ganado, no hay pago negativo.** Queda
 *    deuda: `aPagar = 0` y `deuda` = lo de planilla que sigue abierto. Un «S/ -120.00» en una
 *    columna de pagos se lee como que hay que cobrarle, y no es eso.
 * 5. **Lo ya descontado por planilla para el período también se resta.** Al
 *    descontar, el adelanto deja de estar abierto: restando sólo lo abierto,
 *    la fila SUBÍA de 700 a 1000 y se pagaba el sueldo entero. Qué descuento
 *    es de qué período: `lib/rrhh/descuentos-planilla.ts`.
 * 6. **Lo ya pagado el sábado también se resta** (revisión 24-10). Desde que
 *    existe el pago de la semana (`lib/rrhh/pago-semana.ts`), una semana pagada
 *    seguía diciendo «Queda por pagar S/ 370» con los 370 ya en la mano. Resta
 *    lo ENTREGADO (lo pagado menos lo descontado para esa semana: los descuentos
 *    ya están en el punto 5) de las semanas que caen enteras en el período.
 * 7. **Sólo se restan los adelantos POR PLANILLA** (revisión 24-10, Brandon
 *    eligió «cuenta corriente aparte»). El pago del sábado descuenta sólo los
 *    de planilla; la cuenta corriente (y las entregas pactadas) se cobran por
 *    su lado. Restarla acá dejaba a Rosa en «0 por pagar» (debía S/ 573 de
 *    cuenta corriente) mientras el pago le entregaba S/ 120. La resta es UNA
 *    función, `restaDelSueldo`, que llaman esta columna y el pago
 *    (`calcularPagoSemana`): no pueden diferir. Lo de cuenta corriente sale al
 *    lado (`cuentaCorriente`), nunca restado.
 * 4. **Sin cuenta de Adelantos vinculada no se resta: da `null`.** No se asume
 *    cero — de esa persona no sabemos si debe algo, y un cero inventado se
 *    lee como «no debe nada». La celda queda «—» y la fila explica por qué.
 *
 * **Copy obligatorio junto a todo monto** (lo pone la pantalla, no este
 * módulo): «Referencia: no es planilla electrónica ni boleta. No calcula CTS,
 * gratificaciones, EsSalud, ONP/AFP ni horas extra.»
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { diasDelMes, etiquetaCorta, mesDe, rangoDeDias, sumarDias } from "./fechas";
import type { DiaGanado, EstadoAsistencia, FechaKey, GanadoPersona, Modalidad, SaldoDelSueldo, TramoGanado } from "./tipos";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Entradas ─────────────────────────────────────────────────────────────────

export interface ColaboradorParaGanado {
  id: string;
  fechaIngreso: FechaKey | null;
  fechaCese: FechaKey | null;
}

export interface TarifaParaGanado {
  modalidad: Modalidad;
  monto: number;
  horasJornada: number;
  vigenteDesde: FechaKey;
}

export interface MarcaParaGanado {
  fecha: FechaKey;
  estado: EstadoAsistencia;
  horas: number | null;
}

export interface CalcularGanadoInput {
  colaborador: ColaboradorParaGanado;
  tarifas: readonly TarifaParaGanado[];
  marcas: readonly MarcaParaGanado[];
  desde: FechaKey;
  hasta: FechaKey;
  hoy: FechaKey;
}

// ── Tarifa vigente y factor ──────────────────────────────────────────────────

/** La versión viva con mayor `vigenteDesde ≤ fecha`. `null` si ninguna rige todavía. */
export function tarifaVigente(tarifas: readonly TarifaParaGanado[], fecha: FechaKey): TarifaParaGanado | null {
  let vigente: TarifaParaGanado | null = null;
  for (const t of [...tarifas].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))) {
    if (t.vigenteDesde <= fecha) vigente = t;
  }
  return vigente;
}

/**
 * Cuánto de un día cuenta, según el estado y si la modalidad es por JORNAL
 * (`HORA`/`DIA`, se paga lo trabajado) o por SUELDO (`SEMANA`/`MES`/`SIN_PAGO`,
 * se paga el período salvo que falte o pida permiso). `estado: null` = sin
 * marcar ese día.
 */
export function factorDe(estado: EstadoAsistencia | null, modalidad: Modalidad): number {
  const esJornal = modalidad === "HORA" || modalidad === "DIA";
  switch (estado) {
    case "PRESENTE":
    case "TARDANZA":
      return 1;
    case "MEDIO_DIA":
      return 0.5;
    case "FALTA":
    case "PERMISO":
      return 0;
    case "DESCANSO":
    case "VACACIONES":
      return esJornal ? 0 : 1;
    case null:
    case undefined:
      return esJornal ? 0 : 1;
    default:
      return 0;
  }
}

// ── Calcular lo ganado de una persona ────────────────────────────────────────

const menor = (a: FechaKey, b: FechaKey | null): FechaKey => (b != null && b < a ? b : a);
const mayor = (a: FechaKey, b: FechaKey | null): FechaKey => (b != null && b > a ? b : a);

interface Acumulador {
  tarifa: TarifaParaGanado;
  mes: string;
  dias: FechaKey[];
  factor: number;
  horas: number;
  horasEstimadas: boolean;
}

/**
 * Lo ganado de UNA persona entre `desde` y `hasta` (ambos incluidos, truncado
 * por su ingreso, su cese y `hoy`).
 *
 * Los días se agrupan en TRAMOS por (misma tarifa vigente, mismo mes) y el
 * importe se redondea UNA sola vez por tramo — nunca día por día, porque
 * `31 × (1500/31)` redondeado 31 veces da `1500.09`, no `1500.00` (ADR-414 §5).
 */
export function calcularGanado(input: CalcularGanadoInput): GanadoPersona {
  const { colaborador, tarifas, marcas, desde, hasta, hoy } = input;

  const conteo: Record<EstadoAsistencia, number> = {
    PRESENTE: 0,
    TARDANZA: 0,
    MEDIO_DIA: 0,
    FALTA: 0,
    PERMISO: 0,
    DESCANSO: 0,
    VACACIONES: 0,
  };
  const sinMarcar: FechaKey[] = [];
  const sinTarifa: FechaKey[] = [];
  const fueraDePeriodo: FechaKey[] = [];
  const avisos: string[] = [];

  const porFecha = new Map<FechaKey, MarcaParaGanado>();
  for (const m of marcas) porFecha.set(m.fecha, m);

  // Un casillero por día del rango pedido, para la hoja semanal (ADR-416). Los
  // que no entran (antes del ingreso, después del cese o de hoy, sin tarifa)
  // quedan en null: no valen S/ 0, no se pagan.
  const dias: DiaGanado[] = rangoDeDias(desde, hasta).map((fecha) => ({
    fecha,
    estado: porFecha.get(fecha)?.estado ?? null,
    factor: null,
    importe: null,
  }));
  const diaPorFecha = new Map(dias.map((d) => [d.fecha, d]));

  // El período real: no antes de que ingresó, no después de que cesó, nunca
  // después de hoy (una marca futura no puede existir, pero el rango pedido sí
  // puede llegar hasta mañana).
  const periodoDesde = mayor(desde, colaborador.fechaIngreso);
  const periodoHasta = menor(menor(hasta, colaborador.fechaCese), hoy);

  // Marcas que existen pero cayeron fuera del período vigente — p. ej. porque
  // el cese se cargó DESPUÉS de que ya hubiera marcas esos días (ADR-414 §5,
  // §Casos límite «Cesado con asistencias posteriores»). Se guardan, no suman.
  for (const m of marcas) {
    if (m.fecha < desde || m.fecha > hasta) continue; // fuera del rango pedido, ni se mira
    if (m.fecha < periodoDesde || m.fecha > periodoHasta) fueraDePeriodo.push(m.fecha);
  }
  if (fueraDePeriodo.length > 0) {
    fueraDePeriodo.sort();
    const n = fueraDePeriodo.length;
    avisos.push(
      `Tiene ${n} marca${n === 1 ? "" : "s"} fuera de su período (antes de ingresar o después de retirarse) desde el ${fueraDePeriodo[0]}: se guardan, pero no suman.`,
    );
  }

  const tramos = new Map<string, Acumulador>();
  let usoHorasEstimadas = false;

  if (periodoDesde <= periodoHasta) {
    for (let fecha = periodoDesde; fecha <= periodoHasta; fecha = sumarDias(fecha, 1)) {
      const marca = porFecha.get(fecha) ?? null;
      if (marca) conteo[marca.estado]++;

      const tarifa = tarifaVigente(tarifas, fecha);
      if (!tarifa) {
        sinTarifa.push(fecha);
        continue;
      }

      const factor = factorDe(marca?.estado ?? null, tarifa.modalidad);
      const esJornal = tarifa.modalidad === "HORA" || tarifa.modalidad === "DIA";
      if (!marca && esJornal) sinMarcar.push(fecha);

      let horasDelDia = marca?.horas ?? 0;
      let estimada = false;
      if (tarifa.modalidad === "HORA" && marca?.horas == null && factor > 0) {
        horasDelDia = tarifa.horasJornada * factor;
        estimada = true;
        usoHorasEstimadas = true;
      }

      const dia = diaPorFecha.get(fecha);
      if (dia) {
        dia.factor = factor;
        dia.importe = r2(valorBruto(tarifa, factor, horasDelDia, mesDe(fecha)));
      }

      const clave = `${tarifa.vigenteDesde}|${mesDe(fecha)}`;
      const acc = tramos.get(clave) ?? {
        tarifa,
        mes: mesDe(fecha),
        dias: [],
        factor: 0,
        horas: 0,
        horasEstimadas: false,
      };
      acc.dias.push(fecha);
      acc.factor = r2(acc.factor + factor);
      acc.horas = r2(acc.horas + horasDelDia);
      if (estimada) acc.horasEstimadas = true;
      tramos.set(clave, acc);
    }
  }

  if (usoHorasEstimadas) {
    avisos.push("Hay días sin entrada/salida cargada: las horas de esos días son un estimado (jornada completa).");
  }
  if (sinTarifa.length > 0) {
    avisos.push(`${sinTarifa.length} día${sinTarifa.length === 1 ? "" : "s"} sin tarifa vigente: no se sumaron.`);
  }

  const listaTramos: TramoGanado[] = [...tramos.values()]
    .sort((a, b) => a.dias[0]!.localeCompare(b.dias[0]!))
    .map((acc) => ({
      desde: acc.dias[0]!,
      hasta: acc.dias[acc.dias.length - 1]!,
      modalidad: acc.tarifa.modalidad,
      monto: acc.tarifa.monto,
      horasJornada: acc.tarifa.horasJornada,
      dias: acc.dias.length,
      factor: acc.factor,
      horas: acc.horas,
      horasEstimadas: acc.horasEstimadas,
      importe: valorDelTramo(acc),
    }));

  const total = r2(listaTramos.reduce((a, t) => a + t.importe, 0));
  // La tarifa que rige el último día que cuenta: la «referencia» de la hoja semanal.
  const tarifaDeReferencia = tarifaVigente(tarifas, periodoDesde <= periodoHasta ? periodoHasta : hasta);

  return {
    colaboradorId: colaborador.id,
    total,
    tramos: listaTramos,
    conteo,
    sinMarcar,
    sinTarifa,
    fueraDePeriodo,
    avisos,
    dias,
    referencia: tarifaDeReferencia ? { modalidad: tarifaDeReferencia.modalidad, monto: tarifaDeReferencia.monto } : null,
  };
}

/** Lo ganado SIN redondear: el tramo lo redondea una sola vez; el día, sólo para mostrarlo. */
function valorBruto(tarifa: TarifaParaGanado, factor: number, horas: number, mes: string): number {
  switch (tarifa.modalidad) {
    case "DIA":
      return tarifa.monto * factor;
    case "HORA":
      return tarifa.monto * horas;
    case "SEMANA":
      return (tarifa.monto / 7) * factor;
    case "MES":
      return (tarifa.monto / diasDelMes(mes)) * factor;
    default:
      return 0;
  }
}

/** El importe de un tramo, redondeado UNA sola vez (ADR-414 §5). */
function valorDelTramo(acc: Acumulador): number {
  return r2(valorBruto(acc.tarifa, acc.factor, acc.horas, acc.mes));
}

// ── Cómo sale ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFactor(n: number): string {
  return n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** «22 días × S/ 60.00 = S/ 1,320.00» — una línea por tramo, para el desplegable «Cómo sale». */
export function explicarGanado(g: GanadoPersona): string[] {
  return g.tramos.map((t) => {
    if (t.modalidad === "SIN_PAGO") {
      return `Sin pago del ${etiquetaCorta(t.desde)} al ${etiquetaCorta(t.hasta)} (${t.dias} día${t.dias === 1 ? "" : "s"}).`;
    }
    if (t.modalidad === "DIA") {
      // `t.dias` son los días de CALENDARIO del tramo (con o sin marca); lo que
      // se multiplica es `t.factor`, los días que suman. Con `t.dias` la línea
      // decía «14 días × S/ 45.00 = S/ 270.00» — una cuenta que no da.
      return `${fmtFactor(t.factor)} día${t.factor === 1 ? "" : "s"} × S/ ${fmt(t.monto)} = S/ ${fmt(t.importe)}`;
    }
    if (t.modalidad === "HORA") {
      const estimado = t.horasEstimadas ? " (algunas horas estimadas)" : "";
      return `${fmtFactor(t.horas)} horas × S/ ${fmt(t.monto)}${estimado} = S/ ${fmt(t.importe)}`;
    }
    if (t.modalidad === "SEMANA") {
      return `Sueldo semanal S/ ${fmt(t.monto)} ÷ 7 × ${fmtFactor(t.factor)} = S/ ${fmt(t.importe)}`;
    }
    const dm = diasDelMes(t.desde);
    return `Sueldo mensual S/ ${fmt(t.monto)} ÷ ${dm} × ${fmtFactor(t.factor)} = S/ ${fmt(t.importe)}`;
  });
}

// ── Queda por pagar (ADR-417) ────────────────────────────────────────────────

/**
 * La resta del sueldo, la MISMA para «Queda por pagar» y para el pago del
 * sábado (decisión 7): de lo ganado se saca lo ya descontado y lo ya pagado, y
 * de lo que queda, los adelantos POR PLANILLA hasta donde alcance.
 */
export interface EntradaRestaDelSueldo {
  /** Lo ganado (o el monto del pago, si se escribe a mano). */
  ganado: number;
  /** Lo ya descontado por planilla para ese período. */
  descontado: number;
  /** Lo ya entregado en mano por el pago del sábado. */
  pagado: number;
  /** Saldo abierto de los adelantos POR PLANILLA: lo único que sale del sueldo. */
  planilla: number;
}

export interface RestaDelSueldo {
  /** `ganado − descontado − pagado`, nunca negativo: de dónde se descuenta. */
  disponible: number;
  /** Lo que se descuenta de planilla: lo menor entre lo disponible y lo abierto. */
  aDescontar: number;
  /** Lo que se le entrega. Nunca negativo. */
  aPagar: number;
  /** Lo de planilla que sigue abierto después de descontar. */
  sigueDebiendo: number;
  /** `ganado − descontado − pagado − planilla` con signo. */
  neto: number;
}

export function restaDelSueldo(e: EntradaRestaDelSueldo): RestaDelSueldo {
  const planilla = r2(Math.max(0, e.planilla));
  const disponible = r2(Math.max(0, e.ganado - e.descontado - e.pagado));
  const aDescontar = r2(Math.min(disponible, planilla));
  return {
    disponible,
    aDescontar,
    aPagar: r2(disponible - aDescontar),
    sigueDebiendo: r2(planilla - aDescontar),
    neto: r2(e.ganado - e.descontado - e.pagado - planilla),
  };
}

/**
 * Cuánto se puede descontar todavía por planilla de lo ganado en el período
 * («Descontar» de Lo ganado): lo ganado menos lo ya descontado y lo ya PAGADO.
 * Sin restar lo pagado, un adelanto dado después de pagar la semana se
 * descontaba de una semana ya entregada y se perdía (reviewer 24-10).
 */
export function margenParaDescontar(p: { total: number; pagado?: number | null; adelantos?: { descontadoPen?: number } | null }): number {
  return restaDelSueldo({ ganado: p.total, descontado: p.adelantos?.descontadoPen ?? 0, pagado: p.pagado ?? 0, planilla: 0 }).disponible;
}

/**
 * Reparte lo abierto de cada persona entre lo que sale del sueldo (planilla) y
 * lo que no (cuenta corriente y entregas pactadas). Sólo ABIERTO y DADO llegan
 * acá (`AdelantosDB.saldosAbiertosPorModalidad`); los montos, sólo en soles.
 * Lo usan Lo ganado y la ficha: el mismo corte en las dos.
 */
export function saldosDelSueldo(
  grupos: readonly { beneficiarioId: string; modalidad: string; moneda: string | null; saldoPendiente: number; cantidad: number }[],
): Map<string, SaldoDelSueldo> {
  const porPersona = new Map<string, SaldoDelSueldo>();
  for (const g of grupos) {
    const acc = porPersona.get(g.beneficiarioId) ?? { ...SALDO_DEL_SUELDO_VACIO };
    acc.abiertos += g.cantidad;
    if ((g.moneda || "PEN") === "PEN") {
      acc.abiertosPen = r2(acc.abiertosPen + g.saldoPendiente);
      if (g.modalidad === MODALIDAD_DEL_SUELDO) {
        acc.planillaPen = r2(acc.planillaPen + g.saldoPendiente);
        acc.planillaAbiertos += g.cantidad;
      } else {
        acc.cuentaCorrientePen = r2(acc.cuentaCorrientePen + g.saldoPendiente);
      }
    }
    porPersona.set(g.beneficiarioId, acc);
  }
  return porPersona;
}

/** La única modalidad que se descuenta del sueldo (la misma que filtra `proponerDescuentos`). */
export const MODALIDAD_DEL_SUELDO = "DESCUENTO_PLANILLA";

export const SALDO_DEL_SUELDO_VACIO: Readonly<SaldoDelSueldo> = {
  abiertosPen: 0,
  abiertos: 0,
  planillaPen: 0,
  planillaAbiertos: 0,
  cuentaCorrientePen: 0,
};

/** Lo mínimo que hace falta de una persona para la resta: lo ganado y su saldo de Adelantos. */
export interface PersonaParaNeto {
  /** Lo ganado del período (`GanadoPersona.total`). */
  total: number;
  /**
   * Saldo de Adelantos de la persona; `null` = sin cuenta vinculada (`beneficiarioId == null`).
   * `planillaPen`: lo abierto POR PLANILLA (lo único que se resta, decisión 7).
   * `cuentaCorrientePen`: lo abierto que no sale del sueldo; se muestra aparte.
   * `descontadoPen`: lo ya descontado por planilla PARA ESTE PERÍODO (decisión 5).
   */
  adelantos: { planillaPen: number; cuentaCorrientePen?: number; descontadoPen?: number } | null;
  /**
   * Lo ya entregado en mano por el pago del sábado de las semanas que caen
   * enteras en el período (decisión 6). Sin el dato (el PDF del pago, que es
   * el recibo de lo que se paga) no se resta.
   */
  pagado?: number;
}

export interface QuedaPorPagar {
  /** Lo ganado del período, tal cual salió de `calcularGanado`. */
  ganado: number;
  /** Saldo de adelantos POR PLANILLA abiertos en soles, al día de HOY — no del período. */
  adelantos: number;
  /** Lo ya descontado por planilla para este período (ya no está en `adelantos`). */
  descontado: number;
  /** Lo ya entregado por el pago del sábado (decisión 6). */
  pagado: number;
  /** `ganado − descontado − pagado − adelantos` con signo. Negativo = el adelanto fue mayor que lo ganado. */
  neto: number;
  /** Lo que queda por pagarle. Nunca negativo: si el adelanto fue mayor, es 0. */
  aPagar: number;
  /** Lo de planilla que seguiría debiendo después de descontarle lo ganado. Nunca negativo. */
  deuda: number;
  /** Lo que debe en cuenta corriente: APARTE, no se resta de lo ganado (decisión 7). */
  cuentaCorriente: number;
}

/**
 * Lo que queda por pagarle a UNA persona: lo ganado del período menos lo ya
 * descontado por planilla, lo ya pagado y sus adelantos POR PLANILLA abiertos
 * (`restaDelSueldo`, la misma del pago del sábado). `null` si no tiene cuenta
 * de Adelantos vinculada — ver decisiones 1-7 en la cabecera de este archivo.
 */
export function calcularQuedaPorPagar(persona: PersonaParaNeto): QuedaPorPagar | null {
  if (!persona.adelantos) return null;
  const ganado = r2(persona.total);
  const adelantos = r2(persona.adelantos.planillaPen);
  const descontado = r2(persona.adelantos.descontadoPen ?? 0);
  const pagado = r2(persona.pagado ?? 0);
  const resta = restaDelSueldo({ ganado, descontado, pagado, planilla: adelantos });
  return {
    ganado,
    adelantos,
    descontado,
    pagado,
    neto: resta.neto,
    aPagar: resta.aPagar,
    deuda: resta.sigueDebiendo,
    cuentaCorriente: r2(Math.max(0, persona.adelantos.cuentaCorrientePen ?? 0)),
  };
}

export interface TotalQuedaPorPagar {
  /** Σ de lo que queda por pagar, sólo de las personas con cuenta vinculada. */
  aPagar: number;
  /** Σ de lo que seguiría debiéndose después de descontar lo ganado. */
  deuda: number;
  /** Cuántas personas entran en el total. */
  personas: number;
  /** Cuántas quedaron fuera por no tener cuenta de Adelantos vinculada. */
  sinCuenta: number;
  /** De las que entran, cuántas siguen debiendo (`deuda > 0`). */
  conDeuda: number;
  /** Σ de lo que deben en cuenta corriente: APARTE, no está en `aPagar` ni en `deuda`. */
  cuentaCorriente: number;
}

/**
 * El total de la columna. Suma `aPagar` y `deuda` POR SEPARADO: sumar los netos
 * con signo dejaría que lo ganado de una persona tape la deuda de otra, y el
 * total diría que hay menos por pagar del que realmente hay que sacar de la
 * caja. `sinCuenta` sale afuera para que la pantalla pueda decir cuántas
 * personas NO entran — si no, el total no cierra contra el total de lo ganado
 * y parece un error de cuentas.
 */
export function totalQuedaPorPagar(personas: readonly PersonaParaNeto[]): TotalQuedaPorPagar {
  const total: TotalQuedaPorPagar = { aPagar: 0, deuda: 0, personas: 0, sinCuenta: 0, conDeuda: 0, cuentaCorriente: 0 };
  for (const p of personas) {
    const q = calcularQuedaPorPagar(p);
    if (!q) {
      total.sinCuenta++;
      continue;
    }
    total.personas++;
    total.aPagar = r2(total.aPagar + q.aPagar);
    total.deuda = r2(total.deuda + q.deuda);
    total.cuentaCorriente = r2(total.cuentaCorriente + q.cuentaCorriente);
    if (q.deuda > 0) total.conDeuda++;
  }
  return total;
}

/** Una línea para el desplegable «Cómo sale»: la resta escrita, con su fecha de corte. */
export function explicarQuedaPorPagar(q: QuedaPorPagar): string {
  const yaDescontado = q.descontado > 0 ? ` − S/ ${fmt(q.descontado)} ya descontado por planilla` : "";
  const yaPagado = q.pagado > 0 ? ` − S/ ${fmt(q.pagado)} ya pagado el sábado` : "";
  const resta = `S/ ${fmt(q.ganado)} ganado${yaDescontado}${yaPagado} − S/ ${fmt(q.adelantos)} de adelantos por planilla`;
  const aparte = q.cuentaCorriente > 0
    ? ` Aparte debe S/ ${fmt(q.cuentaCorriente)} de cuenta corriente: eso no se descuenta del sueldo.`
    : "";
  return q.deuda > 0
    ? `${resta}: el adelanto es mayor que lo ganado en este período, sigue debiendo S/ ${fmt(q.deuda)}.${aparte}`
    : `${resta} = S/ ${fmt(q.aPagar)} por pagar.${aparte}`;
}
