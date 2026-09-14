/**
 * ganado.ts — lo ganado de referencia, función pura on-read (ADR-414 §5).
 *
 * Servidor (`GanadoDB.periodo`) y pantalla (vista previa) llaman `calcularGanado`
 * con los MISMOS argumentos — la lección de ADR-412, donde la vista previa
 * llamaba la misma función sin `unit` y calculaba 424 veces de más.
 *
 * **No resta adelantos.** No hay ningún pago de sueldo anotado todavía: restar
 * el saldo de Adelantos afirmaría una deuda que el sistema no puede probar
 * (regla `verificacion-de-verdad` §2). Este módulo sólo dice cuánto se ganó;
 * el saldo de Adelantos se muestra AL LADO, en `GanadoDB.periodo`.
 *
 * **Copy obligatorio junto a todo monto** (lo pone la pantalla, no este
 * módulo): «Referencia: no es planilla electrónica ni boleta. No calcula CTS,
 * gratificaciones, EsSalud, ONP/AFP ni horas extra.»
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { diasDelMes, mesDe, sumarDias } from "./fechas";
import type { EstadoAsistencia, FechaKey, GanadoPersona, Modalidad, TramoGanado } from "./tipos";

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

  return {
    colaboradorId: colaborador.id,
    total,
    tramos: listaTramos,
    conteo,
    sinMarcar,
    sinTarifa,
    fueraDePeriodo,
    avisos,
  };
}

/** El importe de un tramo, redondeado UNA sola vez (ADR-414 §5). */
function valorDelTramo(acc: Acumulador): number {
  const { tarifa, factor, horas, mes } = acc;
  switch (tarifa.modalidad) {
    case "DIA":
      return r2(tarifa.monto * factor);
    case "HORA":
      return r2(tarifa.monto * horas);
    case "SEMANA":
      return r2((tarifa.monto / 7) * factor);
    case "MES":
      return r2((tarifa.monto / diasDelMes(mes)) * factor);
    case "SIN_PAGO":
      return 0;
    default:
      return 0;
  }
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
      return `Sin pago del ${t.desde} al ${t.hasta} (${t.dias} día${t.dias === 1 ? "" : "s"}).`;
    }
    if (t.modalidad === "DIA") {
      return `${t.dias} día${t.dias === 1 ? "" : "s"} × S/ ${fmt(t.monto)} = S/ ${fmt(t.importe)}`;
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
