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
 *    deuda: `aPagar = 0` y `deuda = adelantos − ganado`. Un «S/ -120.00» en una
 *    columna de pagos se lee como que hay que cobrarle, y no es eso.
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
import type { DiaGanado, EstadoAsistencia, FechaKey, GanadoPersona, Modalidad, TramoGanado } from "./tipos";

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
      `Tiene ${n} marca${n === 1 ? "" : "s"} fuera de su período (antes de ingresar o después de cesar) desde el ${fueraDePeriodo[0]}: se guardan, pero no suman.`,
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

/** Lo mínimo que hace falta de una persona para la resta: lo ganado y su saldo de Adelantos. */
export interface PersonaParaNeto {
  /** Lo ganado del período (`GanadoPersona.total`). */
  total: number;
  /** Saldo de Adelantos de la persona; `null` = sin cuenta vinculada (`beneficiarioId == null`). */
  adelantos: { abiertosPen: number } | null;
}

export interface QuedaPorPagar {
  /** Lo ganado del período, tal cual salió de `calcularGanado`. */
  ganado: number;
  /** Saldo de adelantos ABIERTOS en soles, al día de HOY — no del período. */
  adelantos: number;
  /** `ganado − adelantos` con signo. Negativo = el adelanto fue mayor que lo ganado. */
  neto: number;
  /** Lo que queda por pagarle. Nunca negativo: si el adelanto fue mayor, es 0. */
  aPagar: number;
  /** Lo que seguiría debiendo después de descontarle todo lo ganado. Nunca negativo. */
  deuda: number;
}

/**
 * Lo que queda por pagarle a UNA persona: lo ganado del período menos su saldo
 * de adelantos abiertos. `null` si no tiene cuenta de Adelantos vinculada —
 * ver decisiones 1-4 en la cabecera de este archivo.
 */
export function calcularQuedaPorPagar(persona: PersonaParaNeto): QuedaPorPagar | null {
  if (!persona.adelantos) return null;
  const ganado = r2(persona.total);
  const adelantos = r2(persona.adelantos.abiertosPen);
  const neto = r2(ganado - adelantos);
  return {
    ganado,
    adelantos,
    neto,
    aPagar: neto > 0 ? neto : 0,
    deuda: neto < 0 ? r2(-neto) : 0,
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
  const total: TotalQuedaPorPagar = { aPagar: 0, deuda: 0, personas: 0, sinCuenta: 0, conDeuda: 0 };
  for (const p of personas) {
    const q = calcularQuedaPorPagar(p);
    if (!q) {
      total.sinCuenta++;
      continue;
    }
    total.personas++;
    total.aPagar = r2(total.aPagar + q.aPagar);
    total.deuda = r2(total.deuda + q.deuda);
    if (q.deuda > 0) total.conDeuda++;
  }
  return total;
}

/** Una línea para el desplegable «Cómo sale»: la resta escrita, con su fecha de corte. */
export function explicarQuedaPorPagar(q: QuedaPorPagar): string {
  const resta = `S/ ${fmt(q.ganado)} ganado − S/ ${fmt(q.adelantos)} de adelantos abiertos`;
  return q.deuda > 0
    ? `${resta}: el adelanto es mayor que lo ganado en este período, sigue debiendo S/ ${fmt(q.deuda)}.`
    : `${resta} = S/ ${fmt(q.aPagar)} por pagar.`;
}
