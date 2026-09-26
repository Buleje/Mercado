import { cronReportesDiarios } from "@/lib/forestal/reporte-diario-cron";

/**
 * GET /api/cron/reportes-diarios — despachador de los reportes diarios (ADR-439).
 *
 * Manda los reportes cuya hora (Lima) ya pasó hoy y todavía no salieron. Es
 * IDEMPOTENTE por (reporte, día): se puede llamar cuantas veces se quiera, cada
 * reporte sale una sola vez por día. Por eso sirve cualquier disparador:
 *  · los crons diarios de `vercel.json` (plan Hobby: sólo diarios, y cada uno
 *    cae en cualquier minuto de su hora — ver `DISPAROS_LIMA`);
 *  · un disparador externo cada 30 min (cron-job.org, Supabase pg_cron, GitHub
 *    Actions) con `Authorization: Bearer <CRON_SECRET>`, para la hora exacta.
 *
 * `vercel.json` llama a `/api/cron/reportes-diarios/<hora>` (ver `[disparo]`):
 * una ruta por disparo para que cada cron tenga su propio path.
 *
 * Autorización: Bearer <CRON_SECRET> (`withCronAuth`).
 */
export const GET = cronReportesDiarios;
