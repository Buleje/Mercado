/**
 * La fecha de una guardada como se dice en el patio: «jueves 10/09» (con el
 * año si no es el de hoy). Date-only: en UTC. La re-exporta la tarjeta de
 * Guardadas, donde vivía.
 */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export function fechaDeLaGuardada(iso: string, anioDeHoy = new Date().getUTCFullYear()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const base = `${DIAS[d.getUTCDay()]} ${m[3]}/${m[2]}`;
  return Number(m[1]) === anioDeHoy ? base : `${base}/${m[1]}`;
}
