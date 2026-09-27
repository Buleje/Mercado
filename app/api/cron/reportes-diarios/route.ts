import { cronReportesDiarios } from "@/lib/forestal/reporte-diario-cron";

/**
 * GET /api/cron/reportes-diarios — despachador de los reportes diarios (ADR-439).
 *
 * Manda los reportes cuya hora (Lima) ya pasó hoy y todavía no salieron. Es
 * IDEMPOTENTE por (reporte, día): se puede llamar cuantas veces se quiera, cada
 * reporte sale una sola vez por día. Por eso sirve cualquier disparador:
 *  · los crons diarios de `vercel.json` (plan Hobby: sólo diarios, y cada uno
 *    cae en cualquier minuto de su hora — ver `DISPAROS_LIMA`);
 *  · un disparador externo cada 30 min, para la hora exacta: ése llama a
 *    `/api/cron/reportes-diarios/hora-exacta` (deja el latido que hace que el
 *    editor prometa la hora; runbook `docs/runbooks/reportes-hora-exacta.md`).
 *    La raíz despacha igual, pero sin latido.
 *
 * `vercel.json` llama a `/api/cron/reportes-diarios/<hora>` (ver `[disparo]`):
 * una ruta por disparo para que cada cron tenga su propio path.
 *
 * Autorización: Bearer <CRON_SECRET> (`withCronAuth`).
 */
export const GET = cronReportesDiarios;
