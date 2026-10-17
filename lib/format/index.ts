/**
 * lib/format — el formato canónico del panel: fechas, horas, números y moneda.
 *
 * Por qué existe (medido 2026-09-22 en components/admin, 1.112 archivos):
 *   864 llamadas inline a toLocale{Date,Time,}String en 427 archivos, con 98 variantes
 *   distintas de opciones; 7 sin locale (en un navegador en inglés salen mm/dd/yyyy);
 *   64 con timeZone UTC y 209 sin (el MISMO registro puede mostrar dos días distintos);
 *   241 montos escritos `S/${x.toFixed(2)}` (sin separador de miles) al lado de
 *   `formatCurrency` (con miles). Y 12 definiciones de helper para dos conceptos:
 *   2 formatCurrency · 2 formatPEN · 2 formatSoles · 4 formatDate · 2 fmtFecha.
 *
 * Reglas que este módulo fija (verificadas con ICU de Node 24, locale es-PE):
 *   · Zona horaria: SIEMPRE America/Lima (STORE_TIMEZONE). El servidor puede correr en UTC.
 *   · Campos DATE-only (entryDate, gtfDate, fechas de vencimiento…) se guardan como medianoche
 *     UTC: renderizarlos en Lima los corre UN DÍA ATRÁS («2026-09-22» → «21 set.»). Para esos,
 *     pasar `{ soloFecha: true }` y se formatean en UTC. Para fecha+hora, nunca.
 *   · Hora en 24 h («19:30»). Sin `hourCycle`, es-PE da «07:30 p. m.».
 *   · Fecha corta «22 set.»: ICU la devuelve «22-set.» (con guion); acá se normaliza al espacio,
 *     que es como ya sale la forma con año («22 set. 2026»).
 *   · Día siempre a dos dígitos («02 set.», no «2 set.»): alinea columnas.
 *   · Sin dato / inválido → «—» (la convención más extendida del panel), nunca «Invalid Date».
 *   · Moneda: `lib/currency.formatCurrency` es el único canon («S/ 12,345.50»); se re-exporta.
 *
 * Los formateadores de Intl se cachean por opciones: crear uno por celda en una tabla de
 * 1.000 filas es lo que hacía lento el scroll.
 */
import { STORE_TIMEZONE } from "@/lib/utils";

export { formatCurrency, formatCurrencyCompact } from "@/lib/currency";

const LOCALE = "es-PE";

/** Lo que el panel muestra cuando no hay dato o el dato es inválido. */
export const SIN_DATO = "—";

export type FechaInput = string | number | Date | null | undefined;

export interface FechaOpts {
  /**
   * El valor es una fecha SIN hora guardada como medianoche UTC (columnas DATE de Postgres,
   * `"2026-09-22"`). Se formatea en UTC para que no retroceda un día en Lima.
   */
  soloFecha?: boolean;
}

function aFecha(v: FechaInput): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

const cacheFechas = new Map<string, Intl.DateTimeFormat>();
function formateador(opts: Intl.DateTimeFormatOptions, o?: FechaOpts): Intl.DateTimeFormat {
  const timeZone = o?.soloFecha ? "UTC" : STORE_TIMEZONE;
  const key = timeZone + JSON.stringify(opts);
  let f = cacheFechas.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { timeZone, ...opts });
    cacheFechas.set(key, f);
  }
  return f;
}

/** es-PE escribe «22-set.» en la forma corta; el resto del panel separa con espacio. */
function sinGuion(s: string): string {
  return s.replace(/^(\d{1,2})-(?=[a-záéíóúñ])/i, "$1 ");
}

function fecha(v: FechaInput, opts: Intl.DateTimeFormatOptions, o?: FechaOpts): string {
  const d = aFecha(v);
  return d ? sinGuion(formateador(opts, o).format(d)) : SIN_DATO;
}

// ── Fechas ────────────────────────────────────────────────────────────────────

/** «22 set.» — la más usada en tablas y listas. */
export function formatDateShort(v: FechaInput, o?: FechaOpts): string {
  return fecha(v, { day: "2-digit", month: "short" }, o);
}

/** «22 set. 2026» — la fecha por defecto del panel. */
export function formatDate(v: FechaInput, o?: FechaOpts): string {
  return fecha(v, { day: "2-digit", month: "short", year: "numeric" }, o);
}

/** «22/09/2026» — para documentos, exportaciones y campos que copian de un papel. */
export function formatDateNumeric(v: FechaInput, o?: FechaOpts): string {
  return fecha(v, { day: "2-digit", month: "2-digit", year: "numeric" }, o);
}

/** «22 de setiembre de 2026» — para textos corridos y cabeceras de reporte. */
export function formatDateLong(v: FechaInput, o?: FechaOpts): string {
  return fecha(v, { day: "2-digit", month: "long", year: "numeric" }, o);
}

/** «set. 2026» · con `largo`: «setiembre de 2026». Para agrupar por mes. */
export function formatMonthYear(v: FechaInput, o?: FechaOpts & { largo?: boolean }): string {
  return fecha(v, { month: o?.largo ? "long" : "short", year: "numeric" }, o);
}

/**
 * «set.» · con `largo`: «setiembre». Para ejes de gráficos y cabeceras de columna.
 * ICU capitaliza el mes cuando va solo («Set.», «Setiembre») pero no dentro de una fecha
 * («22 set. 2026»); se baja a minúscula para que la columna y el eje digan lo mismo.
 */
export function formatMonth(v: FechaInput, o?: FechaOpts & { largo?: boolean }): string {
  const s = fecha(v, { month: o?.largo ? "long" : "short" }, o);
  return s === SIN_DATO ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

/** «mar.» · con `largo`: «martes». */
export function formatWeekday(v: FechaInput, o?: FechaOpts & { largo?: boolean }): string {
  return fecha(v, { weekday: o?.largo ? "long" : "short" }, o);
}

// ── Horas ─────────────────────────────────────────────────────────────────────

/** «19:30» · con `segundos`: «19:30:05». Siempre 24 h y zona Lima. */
export function formatTime(v: FechaInput, o?: { segundos?: boolean }): string {
  return fecha(v, {
    hour: "2-digit",
    minute: "2-digit",
    ...(o?.segundos ? { second: "2-digit" } : {}),
    hourCycle: "h23",
  });
}

/** «22 set. 2026, 19:30» — fecha completa con hora. */
export function formatDateTime(v: FechaInput): string {
  return fecha(v, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** «22 set., 19:30» — para listas densas donde el año se sobreentiende. */
export function formatDateTimeShort(v: FechaInput): string {
  return fecha(v, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

// ── Números ───────────────────────────────────────────────────────────────────

/** `2` = exactamente 2 decimales · `{ max: 2 }` = hasta 2 · `{ min: 1, max: 3 }`. */
export type Decimales = number | { min?: number; max?: number };

const cacheNumeros = new Map<string, Intl.NumberFormat>();
function formateadorNumero(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(opts);
  let f = cacheNumeros.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, opts);
    cacheNumeros.set(key, f);
  }
  return f;
}

/**
 * «12,345.5» · `formatNumber(x, 2)` → «12,345.50» · `formatNumber(x, 0)` → «12,346».
 * Separador de miles siempre; sin dato o NaN → «—».
 */
export function formatNumber(n: number | string | null | undefined, decimales?: Decimales): string {
  const x = typeof n === "string" ? Number(n) : n;
  if (x == null || !Number.isFinite(x)) return SIN_DATO;
  const opts: Intl.NumberFormatOptions = {};
  if (typeof decimales === "number") {
    opts.minimumFractionDigits = decimales;
    opts.maximumFractionDigits = decimales;
  } else if (decimales) {
    if (decimales.min != null) opts.minimumFractionDigits = decimales.min;
    if (decimales.max != null) opts.maximumFractionDigits = decimales.max;
  }
  return formateadorNumero(opts).format(x);
}
