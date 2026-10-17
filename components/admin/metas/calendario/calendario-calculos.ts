/**
 * components/admin/metas/calendario/calendario-calculos.ts — las cuentas del
 * calendario y de la tarjeta semanal (ADR-488).
 *
 * Los días son claves "YYYY-MM-DD" del día de Lima que arma el servidor; acá
 * nunca se pasa por `new Date()` local ni por `toISOString()` (una venta de
 * las 20:00 de Pucallpa caía en el día siguiente). Puro.
 *
 * Desde el 10-10 la tarjeta «Esta semana» ya no existe (repetía la fila de la
 * semana de la grilla): el total de cada semana va en la columna «Semana» de
 * la grilla (`semanasDelMes` + `totalDeSemana`).
 */
import { diaCumple, type TramoVenta, type VentasPorDia } from "@/lib/metas/logros-reglas";
import { sumarDiasAFecha } from "@/lib/admin/metas-tareas";
import { formatNumber } from "@/lib/format";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;
export const INICIALES_SEMANA = ["L", "M", "M", "J", "V", "S", "D"] as const;
/** Lunes = 0 … domingo = 6, para leer («los sábados»). */
export const NOMBRES_SEMANA = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

const redondear = (v: number) => Math.round(v * 100) / 100;
const suma = (xs: readonly (TramoVenta | undefined)[]): TramoVenta =>
  xs.reduce<TramoVenta>(
    (a, t) => ({
      total: redondear(a.total + (t?.total ?? 0)),
      n: a.n + (t?.n ?? 0),
    }),
    { total: 0, n: 0 },
  );


/** El monto de un casillero sin «S/»: «0.1», «45.5», «1,250». */
export function montoCorto(v: number): string {
  return formatNumber(v, { max: Number.isInteger(v) || Math.abs(v) >= 1000 ? 0 : 2 });
}

/** «octubre 2026». */
export function nombreDelMes(mes: string): string {
  return `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
}

/** "2026-10" ± n meses. */
export function moverMes(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Lunes = 0 … domingo = 6. */
export const indiceSemana = (fecha: string) => (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Los días del mes y cuántos huecos van antes del día 1 (la semana empieza el lunes). */
export function diasDelMes(mes: string): { dias: string[]; huecos: number } {
  const ultimo = new Date(
    Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0),
  ).getUTCDate();
  const dias = Array.from({ length: ultimo }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
  return { dias, huecos: indiceSemana(dias[0]!) };
}

/** Una fila del calendario: los 7 días de lunes a domingo; `null` = el día es de otro mes. */
export interface SemanaDelMes {
  fechas: string[];
  delMes: (string | null)[];
}

/** Las filas del mes, de la semana del día 1 a la del último día. */
export function semanasDelMes(mes: string): SemanaDelMes[] {
  const { dias } = diasDelMes(mes);
  const ultimo = dias[dias.length - 1]!;
  const filas: SemanaDelMes[] = [];
  for (let lunes = sumarDiasAFecha(dias[0]!, -indiceSemana(dias[0]!)); lunes <= ultimo; lunes = sumarDiasAFecha(lunes, 7)) {
    const fechas = Array.from({ length: 7 }, (_, i) => sumarDiasAFecha(lunes, i));
    filas.push({ fechas, delMes: fechas.map((f) => (f.startsWith(mes) ? f : null)) });
  }
  return filas;
}

export interface TotalSemana extends TramoVenta {
  /** Un día ya vivido de la semana no se leyó (la cola de un mes pasado cae en el mes siguiente). */
  parcial: boolean;
  /** El domingo ya pasó. */
  cerrada: boolean;
}

/**
 * Lo vendido de lunes a domingo. `leidos` trae los días de `meses` (el mes que
 * se mira y el anterior): la semana del día 1 se completa con los del mes
 * anterior. Un día ya vivido de un mes que no se leyó la deja `parcial` —no se
 * compara contra la meta semanal— en vez de contarlo como 0.
 */
export function totalDeSemana(
  fechas: readonly string[],
  leidos: VentasPorDia,
  meses: readonly string[],
  hoy: string,
): TotalSemana {
  const parcial = fechas.some((f) => f <= hoy && !meses.some((m) => f.startsWith(m)));
  return { ...suma(fechas.map((f) => leidos[f])), parcial, cerrada: fechas[fechas.length - 1]! < hoy };
}

/** Cómo se pinta el total de una semana contra la meta semanal (los mismos tonos que un día). */
export function tonoDeSemana(s: TotalSemana, desde: string, hoy: string, metaSemanal: number | null): TonoDia {
  if (desde > hoy) return "futuro";
  if (metaSemanal === null || metaSemanal <= 0 || s.parcial) return "nivel0";
  if (s.total >= metaSemanal) return "cumplio";
  return s.cerrada ? "no_cumplio" : "hoy_abierto";
}

export interface CumplePorDia {
  cumplidos: number;
  /** Días ya cerrados de ese día de la semana; hoy cuenta sólo si ya cumplió (el día sigue abierto). */
  evaluados: number;
}

/** De lunes (0) a domingo (6): cuántos de `fechas` cumplieron la meta diaria. */
export function cumplimientoPorDiaSemana(
  fechas: readonly string[],
  dias: VentasPorDia,
  hoy: string,
  metaDiaria: number | null,
): CumplePorDia[] {
  const out = Array.from({ length: 7 }, () => ({ cumplidos: 0, evaluados: 0 }));
  for (const f of fechas) {
    if (f > hoy) continue;
    const ok = diaCumple(dias[f], metaDiaria);
    if (f === hoy && !ok) continue;
    const c = out[indiceSemana(f)]!;
    c.evaluados++;
    if (ok) c.cumplidos++;
  }
  return out;
}

export function sumarCumplimiento(c: readonly CumplePorDia[]): CumplePorDia {
  return c.reduce((a, x) => ({ cumplidos: a.cumplidos + x.cumplidos, evaluados: a.evaluados + x.evaluados }), {
    cumplidos: 0,
    evaluados: 0,
  });
}

/**
 * El día de la semana que más cumple y el que menos (índice lunes = 0). Sólo
 * cuentan los que tienen al menos `minimo` días cerrados —uno solo no dice
 * cómo «suele» ir— y sólo si no cumplen todos parejo.
 */
export function firmeYFlojo(
  c: readonly CumplePorDia[],
  minimo = 2,
): { firme: number; flojo: number } | null {
  const tasa = (i: number) => c[i]!.cumplidos / c[i]!.evaluados;
  const con = c.map((_, i) => i).filter((i) => c[i]!.evaluados >= minimo);
  if (con.length < 2) return null;
  const firme = con.reduce((a, i) => (tasa(i) > tasa(a) ? i : a));
  const flojo = con.reduce((a, i) => (tasa(i) < tasa(a) ? i : a));
  return tasa(firme) === tasa(flojo) ? null : { firme, flojo };
}

export interface ParaLlegar {
  falta: number;
  /** Días que quedan del mes, contando hoy. */
  quedan: number;
  porDia: number;
  /** El último día del mes. */
  hasta: string;
}

/** La meta del mes que corre: cuánto vender por día, contando hoy, para llegar. `null` si el mes no es el de hoy o ya se cumplió. */
export function paraLlegarAlMes(mes: string, hoy: string, total: number, meta: number | null): ParaLlegar | null {
  if (!hoy.startsWith(mes) || meta === null || meta <= 0 || total >= meta) return null;
  const { dias } = diasDelMes(mes);
  const hasta = dias[dias.length - 1]!;
  const quedan = Number(hasta.slice(8, 10)) - Number(hoy.slice(8, 10)) + 1;
  const falta = redondear(meta - total);
  return { falta, quedan, porDia: redondear(falta / quedan), hasta };
}

export interface ResumenMes {
  total: number;
  n: number;
  mejorDia: { fecha: string; total: number } | null;
  /** El último día ya vivido del mes (1-31; 0 si el mes es futuro). */
  ultimoVivido: number;
  /** El mes anterior hasta el mismo número de día. */
  anteriorAlDia: number;
  /** % contra el mes anterior al mismo día; `null` si ese iba en 0. */
  delta: number | null;
  /** La venta más alta de un día del mes (para la intensidad del color). */
  maximo: number;
}

export function resumirMes(
  mes: string,
  dias: VentasPorDia,
  anterior: VentasPorDia,
  hoy: string,
): ResumenMes {
  const { dias: fechas } = diasDelMes(mes);
  const vividos = fechas.filter((f) => f <= hoy);
  const { total, n } = suma(fechas.map((f) => dias[f]));
  let mejorDia: ResumenMes["mejorDia"] = null;
  let maximo = 0;
  for (const f of fechas) {
    const t = dias[f]?.total ?? 0;
    maximo = Math.max(maximo, t);
    if (t > 0 && (!mejorDia || t > mejorDia.total)) mejorDia = { fecha: f, total: t };
  }
  const ultimoVivido = vividos.length > 0 ? Number(vividos[vividos.length - 1]!.slice(8, 10)) : 0;
  const anteriorAlDia = suma(
    Object.entries(anterior)
      .filter(([f]) => Number(f.slice(8, 10)) <= ultimoVivido)
      .map(([, t]) => t),
  ).total;
  return {
    total,
    n,
    mejorDia,
    ultimoVivido,
    anteriorAlDia,
    delta: anteriorAlDia > 0 ? ((total - anteriorAlDia) / anteriorAlDia) * 100 : null,
    maximo,
  };
}

export type TonoDia =
  | "cumplio"
  | "no_cumplio"
  | "futuro"
  | "hoy_abierto"
  | `nivel${0 | 1 | 2 | 3 | 4}`;

/**
 * Cómo se pinta un día. Con meta diaria: verde si la cumplió, rojo suave si ya
 * pasó sin cumplirla, hoy sin cumplir todavía no es rojo. Sin meta: intensidad
 * según lo vendido contra el mejor día del mes (5 niveles).
 */
export function tonoDelDia(
  fecha: string,
  tramo: TramoVenta | undefined,
  hoy: string,
  metaDiaria: number | null,
  maximo: number,
): TonoDia {
  if (fecha > hoy) return "futuro";
  if (metaDiaria !== null && metaDiaria > 0) {
    if (diaCumple(tramo, metaDiaria)) return "cumplio";
    return fecha === hoy ? "hoy_abierto" : "no_cumplio";
  }
  const t = tramo?.total ?? 0;
  if (t <= 0 || maximo <= 0) return "nivel0";
  const r = t / maximo;
  return r > 0.75 ? "nivel4" : r > 0.5 ? "nivel3" : r > 0.25 ? "nivel2" : "nivel1";
}

/** Fondo y texto de cada tono, sólo tokens (claro y oscuro). */
export const CLASE_TONO: Readonly<Record<TonoDia, string>> = {
  cumplio:
    "bg-[var(--data-success)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] ring-1 ring-inset ring-[var(--data-success)]/40",
  no_cumplio:
    "bg-[var(--data-error)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  hoy_abierto:
    "bg-[var(--surface-raised)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--rule-base)]",
  futuro: "bg-transparent text-[var(--text-tertiary)]",
  nivel0: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  nivel1: "bg-[var(--accent)]/10 text-[var(--text-primary)]",
  nivel2: "bg-[var(--accent)]/25 text-[var(--text-primary)]",
  nivel3: "bg-[var(--accent)]/45 text-[var(--text-primary)]",
  nivel4: "bg-[var(--accent)]/70 text-[var(--text-primary)]",
};
