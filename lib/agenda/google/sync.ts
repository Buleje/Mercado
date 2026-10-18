/**
 * Agenda → Google Calendar/Tasks (ADR-501 §5b). STUB de la fase 0: existe para que el
 * carril A (rutas de actividades) compile y lo llame desde ya; el carril C lo llena con el
 * upsert del evento recurrente (huella sha256 para no llamar a Google sin cambios).
 *
 * Contrato: quien lo llama NO espera — fire-and-forget con
 * `.catch(err => logger.error(...))`. Nunca lanza por un Google caído: la actividad
 * ya quedó guardada en Buleje.
 */
import { logger } from "@/lib/logger";

export async function sincronizarActividad(
  tenantId: string,
  actividadId: string,
  accion: "guardar" | "borrar",
): Promise<void> {
  logger.debug("[agenda/google] sincronizarActividad: stub de la fase 0, todavía no envía nada", {
    tenantId,
    actividadId,
    accion,
  });
}
