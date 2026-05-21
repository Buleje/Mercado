/**
 * lib/superadmin/safe-helpers.ts
 *
 * Helpers defensivos compartidos del módulo /superadmin para evitar crashes
 * runtime por null/undefined/NaN en datos que vienen de DB o user input.
 *
 * Brandon 2026-05-21 audit blindaje batch 1: el audit detectó 15 lugares
 * con `new Date(x).toLocale*()` sin guard que producen "Invalid Date" o
 * crash. Centralizar en helpers permite fix sistemático sin duplicar
 * lógica en cada archivo.
 */

/**
 * Parse seguro a Date. Devuelve null si la entrada es null/undefined,
 * o si el resultado es Invalid Date (e.g. string mal formado).
 *
 * @example
 *   const d = safeDate(item.createdAt);
 *   if (!d) return "—";
 *   return d.toLocaleDateString("es-PE");
 */
export function safeDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format date a string es-PE con guard. Devuelve fallback si la entrada
 * no es parseable.
 *
 * @example
 *   fmtDateSafe(order.createdAt) // "21 may. 2026"
 *   fmtDateSafe(null) // "—"
 *   fmtDateSafe(null, "Sin fecha") // "Sin fecha"
 */
export function fmtDateSafe(
  v: unknown,
  fallback = "—",
  opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" },
): string {
  const d = safeDate(v);
  if (!d) return fallback;
  return d.toLocaleDateString("es-PE", opts);
}

/**
 * Format time a string es-PE con guard.
 *
 * @example
 *   fmtTimeSafe(incident.since) // "14:32:05"
 *   fmtTimeSafe(null) // "ahora"
 */
export function fmtTimeSafe(
  v: unknown,
  fallback = "ahora",
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = safeDate(v);
  if (!d) return fallback;
  return d.toLocaleTimeString("es-PE", opts);
}

/**
 * Format datetime full a string es-PE con guard.
 */
export function fmtDateTimeSafe(
  v: unknown,
  fallback = "—",
): string {
  const d = safeDate(v);
  if (!d) return fallback;
  return d.toLocaleString("es-PE");
}

/**
 * Compara si una fecha (que puede ser null/string) es del futuro.
 * Útil para trials, expiraciones, etc.
 *
 * @example
 *   const isStillInTrial = isFutureDate(tenant.trialEndsAt);
 */
export function isFutureDate(v: unknown): boolean {
  const d = safeDate(v);
  if (!d) return false;
  return d.getTime() > Date.now();
}

/**
 * Compara si una fecha (que puede ser null/string) es del pasado.
 */
export function isPastDate(v: unknown): boolean {
  const d = safeDate(v);
  if (!d) return false;
  return d.getTime() < Date.now();
}

/**
 * Parse seguro a number. Acepta string|number, devuelve fallback si NaN
 * o Infinity. Mucho mejor que `Number(x) || 0` (que coerciona 0/"" a fallback).
 *
 * @example
 *   safeNumber("12.5")        // 12.5
 *   safeNumber("invalid", 0)  // 0
 *   safeNumber(null, 0)       // 0
 *   safeNumber("", 0)         // 0
 *   safeNumber(0, 99)         // 0   (importante: 0 NO es fallback)
 */
export function safeNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * División segura: devuelve 0 si denominator es 0/NaN/Infinity en lugar
 * de crash o Infinity. Útil para %, ratios, growth metrics.
 *
 * @example
 *   safeDiv(100, 0)    // 0
 *   safeDiv(100, 50)   // 2
 *   safeDiv(NaN, 50)   // 0
 */
export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  return numerator / denominator;
}

/**
 * Growth percentage entre 2 periodos con guard de división por cero.
 * Devuelve null cuando no se puede calcular (en lugar de -100% engañoso).
 *
 * @example
 *   growthPct(150, 100) // 50  (subió 50%)
 *   growthPct(0, 100)   // -100 (cayó al cero — válido)
 *   growthPct(100, 0)   // null (no había datos previos — sin info)
 *   growthPct(0, 0)     // null
 */
export function growthPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * JSON.parse seguro: devuelve fallback si el JSON es inválido o null.
 * Evita crashes en componentes que leen localStorage o respuestas API
 * malformadas.
 *
 * @example
 *   const config = safeJsonParse<NavConfig>(localStorage.getItem("nav"), DEFAULT_NAV);
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
