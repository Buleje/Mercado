/**
 * components/admin/metas/calendario/calendario-calculos.ts — las cuentas del
 * calendario y de la tarjeta semanal (ADR-488).
 *
 * Los días son claves "YYYY-MM-DD" del día de Lima que arma el servidor; acá
 * nunca se pasa por `new Date()` local ni por `toISOString()` (una venta de
 * las 20:00 de Pucallpa caía en el día siguiente). Puro.
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

/** Los 7 días de lunes a domingo de la semana de `fecha`. */
export function diasDeLaSemana(fecha: string): string[] {
  const lunes = sumarDiasAFecha(fecha, -indiceSemana(fecha));
  return Array.from({ length: 7 }, (_, i) => sumarDiasAFecha(lunes, i));
}

export interface ResumenMes {
  total: number;
  n: number;
  mejorDia: { fecha: string; total: number } | null;
  /** Días ya vividos del mes (todos si el mes ya pasó; 0 si es futuro). */
  transcurridos: number;
  /** Días que cumplieron: la meta diaria, o con al menos una venta si no hay meta. */
  cumplidos: number;
  /** El mes anterior hasta el mismo número de día. */
  anteriorAlDia: number;
  /** % contra el mes anterior al mismo día; `null` si ese iba en 0. */
  delta: number | null;
  /** La venta más alta de un día del mes (para la intensidad del color). */
  maximo: number;
}

const suma = (xs: readonly (TramoVenta | undefined)[]): TramoVenta =>
  xs.reduce<TramoVenta>(
    (a, t) => ({
      total: Math.round((a.total + (t?.total ?? 0)) * 100) / 100,
      n: a.n + (t?.n ?? 0),
    }),
    { total: 0, n: 0 },
  );

export function resumirMes(
  mes: string,
  dias: VentasPorDia,
  anterior: VentasPorDia,
  hoy: string,
  metaDiaria: number | null,
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
    transcurridos: vividos.length,
    cumplidos: vividos.filter((f) => diaCumple(dias[f], metaDiaria)).length,
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
