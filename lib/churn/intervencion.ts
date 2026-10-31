/**
 * Qué cuenta como «ya se actuó» sobre una alerta de abandono (ChurnSignal).
 * Puro y sin `server-only`: lo usan el motor, la DB class y la ficha del negocio.
 *
 * Hasta el 2026-10-09 el motor anotaba en `intervention` también lo que NO salió
 * («WhatsApp skip (sin config)», «Error: …», «sin plantilla, no se envió nada»).
 * Las 14 alertas abiertas de producción traían «skip (sin config)» y por eso
 * quedaban como atendidas: la regla de llamada no actuaba sobre las 9 críticas.
 * Ahora lo que no salió deja `intervention` en null; estas marcas sólo sirven
 * para reconocer las filas viejas.
 */

/** Textos viejos que significan «no se envió nada». */
export const MARCAS_SIN_ACCION = {
  contiene: ["skip (sin config)", "no se envió nada"],
  empiezaCon: ["Error:"],
} as const;

/** `true` sólo si el texto describe una acción que de verdad ocurrió (o está en curso). */
export function fueAccionReal(texto: string | null | undefined): texto is string {
  if (!texto) return false;
  if (MARCAS_SIN_ACCION.contiene.some((m) => texto.includes(m))) return false;
  if (MARCAS_SIN_ACCION.empiezaCon.some((m) => texto.startsWith(m))) return false;
  return true;
}

/**
 * De varias alertas abiertas del mismo negocio y tipo (filas viejas duplicadas, o
 * dos corridas del cron a la vez), cuál queda: la que ya tuvo acción real; si
 * ninguna, la más antigua. `filas` viene ordenada por `createdAt` y `id` ascendente,
 * así dos corridas que leen lo mismo eligen la misma.
 */
export function elegirAbierta<T extends { id: string; intervention: string | null }>(filas: T[]): T | null {
  return filas.find((f) => fueAccionReal(f.intervention)) ?? filas[0] ?? null;
}
