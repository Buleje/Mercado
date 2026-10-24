import { cronReportesDiarios } from "@/lib/forestal/reporte-diario-cron";

/**
 * GET /api/cron/reportes-diarios/<disparo> — el mismo despachador (ADR-439).
 *
 * `vercel.json` registra un cron por hora de disparo (`/0700`, `/1300`,
 * `/1800`, `/2100`, hora de Lima). Cada uno con su propio path para no
 * depender de que Vercel acepte dos crons sobre la misma ruta. El segmento es
 * sólo una etiqueta: el despachador decide por el reloj, no por él. La única
 * que cambia algo es `/hora-exacta` (el disparador de cada media hora): deja
 * su latido antes de despachar (`DISPARO_HORA_EXACTA`).
 */
export const GET = cronReportesDiarios;
