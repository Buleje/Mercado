/**
 * Fechas de la agenda como claves «YYYY-MM-DD» del día de Lima (ADR-501 §3).
 * Aritmética en UTC (la del motor, `lib/agenda/recurrencia.ts`) y nombres de
 * días y meses escritos a mano: `Intl` cambia por versión de ICU.
 */
import { limaDateKey } from "@/lib/utils";
import { diaSemanaDe, sumarDias } from "@/lib/agenda/recurrencia";
import type { FechaKey } from "@/lib/agenda/tipos";

export { diaSemanaDe, sumarDias };

/** 0 = domingo … 6 = sábado, como `Recurrencia.diasSemana`. */
export const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
export const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
export const DIAS_INICIAL = ["D", "L", "M", "M", "J", "V", "S"] as const;
/** La semana del panel empieza el lunes. */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

export const MESES_NOMBRES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
] as const;

export const hoyKey = (): FechaKey => limaDateKey();

const partes = (f: FechaKey) => f.split("-").map(Number) as [number, number, number];
const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** «18/10». */
export function fechaCorta(f: FechaKey): string {
  const [, m, d] = partes(f);
  return `${dosDigitos(d)}/${dosDigitos(m)}`;
}

/** «sábado 18/10». */
export function fechaLarga(f: FechaKey): string {
  return `${DIAS_LARGOS[diaSemanaDe(f)]} ${fechaCorta(f)}`;
}

/** «Hoy», «Mañana», «Ayer» o «sábado 18/10». */
export function fechaRelativa(f: FechaKey, hoy: FechaKey = hoyKey()): string {
  if (f === hoy) return "Hoy";
  if (f === sumarDias(hoy, 1)) return "Mañana";
  if (f === sumarDias(hoy, -1)) return "Ayer";
  return fechaLarga(f);
}

export const diaDelMes = (f: FechaKey): number => partes(f)[2];

export function inicioDeMes(f: FechaKey): FechaKey {
  const [y, m] = partes(f);
  return `${y}-${dosDigitos(m)}-01`;
}

/** El 1.º del mes que está `n` meses antes o después. */
export function sumarMeses(f: FechaKey, n: number): FechaKey {
  const [y, m] = partes(f);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${dosDigitos((total % 12) + 1)}-01`;
}

export const mismoMes = (a: FechaKey, b: FechaKey): boolean => a.slice(0, 7) === b.slice(0, 7);

/** El lunes de la semana de `f`. */
export function inicioDeSemana(f: FechaKey): FechaKey {
  return sumarDias(f, -((diaSemanaDe(f) + 6) % 7));
}

export function diasDesde(desde: FechaKey, cuantos: number): FechaKey[] {
  return Array.from({ length: cuantos }, (_, i) => sumarDias(desde, i));
}

/** Las 6 semanas (42 días, de lunes) que muestran el mes entero en la grilla. */
export function grillaDelMes(mes: FechaKey): FechaKey[] {
  return diasDesde(inicioDeSemana(inicioDeMes(mes)), 42);
}

/** «octubre 2026». */
export function tituloMes(f: FechaKey): string {
  const [y, m] = partes(f);
  return `${MESES_NOMBRES[m - 1]} ${y}`;
}

/** «13 al 19 de octubre» o «27 de octubre al 2 de noviembre». */
export function tituloSemana(lunes: FechaKey): string {
  const domingo = sumarDias(lunes, 6);
  const [, m1, d1] = partes(lunes);
  const [, m2, d2] = partes(domingo);
  return m1 === m2
    ? `${d1} al ${d2} de ${MESES_NOMBRES[m2 - 1]}`
    : `${d1} de ${MESES_NOMBRES[m1 - 1]} al ${d2} de ${MESES_NOMBRES[m2 - 1]}`;
}
