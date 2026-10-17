/**
 * Los avisos del Resumen viven en `lib/planificacion/avisos.ts`: la campana
 * (cron `planificacion-avisos`) arma los suyos con la MISMA regla y el mismo
 * texto. Este archivo sólo los re-exporta para el Resumen.
 */
export { DESTINO, avisosDelPlan, type AvisoPlan, type TonoAviso } from "@/lib/planificacion/avisos";
