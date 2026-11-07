/**
 * cierre-sin-conteo — las notas que dejan los cierres donde NADIE contó el cajón.
 *
 * Dos lectores deciden por el texto de la nota, no por una columna:
 *  - la caja: `esCierreAutomatico` (`lib/caja/arqueo-veredicto.ts`, «cierre
 *    automático» en cualquier lugar) → el arqueo dice «Cerrada sin conteo» y no
 *    «Conforme», aunque la diferencia sea 0;
 *  - el turno: `cifrasDeCajaDelTurno` (`lib/db/turnos.db.ts`, empieza con
 *    «Cerrado automaticamente») → el historial de turnos no muestra diferencia.
 *
 * Por eso las notas viven acá y una prueba las cruza con los dos lectores
 * (`__tests__/caja-cierre-sin-conteo.test.ts`): reescribir una sin el otro
 * convertía un cierre sin contar en «Cuadrado».
 *
 * PURO y client-safe.
 */

/** Horas que un turno puede quedar abierto antes de que el cron lo cierre. */
export const HORAS_TURNO_OLVIDADO = 12;

/** Cron de turnos olvidados: nota del turno. */
export const NOTA_TURNO_ZOMBIE = `Cerrado automaticamente (zombie >${HORAS_TURNO_OLVIDADO}h) sin conteo. Revisar arqueo manual.`;
/** Cron de turnos olvidados: nota de la caja vinculada. */
export const NOTA_CAJA_ZOMBIE = `Cierre automático (turno zombie >${HORAS_TURNO_OLVIDADO}h) sin conteo. Revisar arqueo manual.`;

/** «Cerrar turno» del hub de caja sin monto contado: nota del turno. */
export const NOTA_TURNO_CERRAR_SIN_CONTEO = "Cerrado automaticamente con close-shift";
/** «Cerrar turno» del hub de caja sin monto contado: nota de la caja. */
export const NOTA_CAJA_CERRAR_SIN_CONTEO = "Cierre automático desde Cerrar Turno";

/**
 * «Cerrar turno» CON monto contado. NO lleva la marca de cierre automático: es
 * un arqueo de verdad y su diferencia vale. La nota de quien contó va tal cual
 * (como en `PATCH /api/cash-registers/[id]`): ahí viaja el desglose del conteo
 * (`notaDelConteo`) que leen el arqueo y el reporte impreso.
 */
export function notaCajaCerrarConConteo(notas?: string | null): string {
  return notas?.trim() || "Cierre de turno con conteo";
}

export function notaTurnoCerrarConConteo(contado: number, notas?: string | null): string {
  const extra = notas?.trim();
  return `Cerrado con conteo (S/${contado.toFixed(2)})${extra ? ` — ${extra}` : ""}`;
}
