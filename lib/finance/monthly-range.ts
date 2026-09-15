/**
 * lib/finance/monthly-range.ts
 *
 * Rango [start, end) de un mes relativo a `ref` (monthsAgo meses atrás).
 *
 * Los límites son UTC a propósito: el cliente (FinanzasModule / shared.ts)
 * bucketea ingresos por `createdAt.slice(0, 7)`, que es el año-mes en UTC del
 * string ISO. Si el endpoint server-side usara `new Date(y, m, 1)` (hora local)
 * los bordes de mes se correrían en cualquier TZ != UTC → los meses no
 * coincidirían con el cliente (TZ skew de Supabase, ya documentado). Usar
 * Date.UTC garantiza el match exacto.
 */
export function utcMonthRange(ref: Date, monthsAgo: number): { monthKey: string; start: Date; end: Date } {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth() - monthsAgo;
  const start = new Date(Date.UTC(y, m, 1));   // Date.UTC normaliza meses negativos / overflow de año
  const end = new Date(Date.UTC(y, m + 1, 1));
  const monthKey = start.toISOString().slice(0, 7);
  return { monthKey, start, end };
}

/**
 * Día UTC ("YYYY-MM-DD") `daysAgo` días atrás respecto a `ref`. Mismo criterio
 * que el cliente (createdAt UTC → slice(0,10)) para el cashflow diario.
 */
export function utcDayKey(ref: Date, daysAgo: number): string {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - daysAgo))
    .toISOString()
    .slice(0, 10);
}
