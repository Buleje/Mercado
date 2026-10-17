/**
 * formatRelativeTime — tiempo relativo en español para la prueba social de la
 * junta ("se sumó un vecino hace 5 min"). Puro y determinista: recibe el `now`
 * para ser testeable y evitar `Date.now()` en el render.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Tolerancia a desfase de reloj servidor↔cliente para "recién". */
const SKEW = 30_000;

/**
 * Devuelve una etiqueta tipo "recién" / "hace 5 min" / "hace 2 h" / "hace 3 d".
 * Un desfase de reloj de hasta 30 s hacia el futuro se trata como "recién" (un
 * vecino que se acaba de sumar). Fechas claramente futuras o inválidas → null.
 */
export function formatRelativeTime(iso: string, now: number): string | null {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diff = now - then;
  if (diff < -SKEW) return null;
  if (diff < MIN) return "recién";
  if (diff < HOUR) return `hace ${Math.floor(diff / MIN)} min`;
  if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
  return `hace ${Math.floor(diff / DAY)} d`;
}
