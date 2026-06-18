export type JuntaEffectiveStatus = "OPEN" | "COMPLETE" | "EXPIRED";

/**
 * Estado efectivo de una junta, computado on-read (Fase A1 sin cron).
 * Prioridad: COMPLETE (llegó a la meta) > EXPIRED (venció la ventana) > OPEN.
 */
export function effectiveStatus(
  memberCount: number,
  target: number,
  windowEnd: Date,
  now: Date,
): JuntaEffectiveStatus {
  if (memberCount >= target) return "COMPLETE";
  if (windowEnd.getTime() <= now.getTime()) return "EXPIRED";
  return "OPEN";
}
