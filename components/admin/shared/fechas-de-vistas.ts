/**
 * Fechas date-only (Lima) para las vistas de fábrica de las tablas: «ayer», «hoy + 7»,
 * «fin de este mes». Lima no tiene horario de verano: sumar días de 24 h es exacto.
 */
import { limaDateKey } from "@/lib/utils";

const DIA_MS = 86_400_000;

/** Fecha de Lima (AAAA-MM-DD) a `n` días de hoy (negativo = pasado). */
export const diaLima = (n = 0): string => limaDateKey(Date.now() + n * DIA_MS);

/** Último día del mes de Lima en curso. */
export function finDeMesLima(): string {
  const [a, m] = diaLima().split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}
