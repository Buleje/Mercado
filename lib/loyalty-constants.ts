/**
 * loyalty-constants.ts — Fuente única de verdad para conversión de puntos.
 *
 * Regla: 100 puntos = S/ 1 (calculado server-side en lib/db/marketplace/orders.db.ts).
 * El frontend usa esta constante solo para preview — el total real siempre
 * se recalcula en el backend (CLAUDE.md regla #6).
 *
 * CR-2.3: unificar PTS_PER_SOL (50 UI) y LOYALTY_POINTS_PER_SOL (100 DB).
 * Fuente de verdad = valor del servidor (100).
 */
export const PTS_PER_SOL = 100;
