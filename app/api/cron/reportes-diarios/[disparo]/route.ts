import { cronReportesDiarios } from "@/lib/forestal/reporte-diario-cron";

/**
 * GET /api/cron/reportes-diarios/<disparo> — el mismo despachador (ADR-439).
 *
 * `vercel.json` registra un cron por hora de disparo (`/0700`, `/1300`,
 * `/1800`, `/2100`, hora de Lima). Cada uno con su propio path para no
 * depender de que Vercel acepte dos crons sobre la misma ruta. El segmento es
 * sólo una etiqueta: el despachador decide por el reloj, no por él.
 */
export const GET = cronReportesDiarios;
