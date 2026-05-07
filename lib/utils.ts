import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Export an array of objects as a CSV file download */
export function exportToCSV(
  rows: Record<string, string | number | boolean | null | undefined>[],
  filename: string,
) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv =
    keys.map(escape).join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => escape(r[k])).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Formatters ──────────────────────────────────────────────────────────────
// Single source of truth — import from "@/lib/utils" in all admin tabs.

/**
 * Format a number as Peruvian Soles.
 * @example formatCurrency(1234.5) → "S/ 1,234.50"
 */
export function formatCurrency(amount: number): string {
  return `S/ ${amount.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format an ISO date string to a readable date in es-PE locale.
 * @example formatDate("2024-03-15T00:00:00Z") → "15 mar. 2024"
 */
export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format an ISO datetime string to date + time in es-PE locale.
 * @example formatDateTime("2024-03-15T14:30:00Z") → "15 mar. 2024, 14:30"
 */
export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Human-friendly relative time (e.g. "hace 5 min").
 * Covers seconds → weeks; beyond that returns "hace N sem".
 */
export function timeAgo(date: Date | string): string {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "hace unos segundos";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)}d`;
  return `hace ${Math.floor(diff / 604800)} sem`;
}

/**
 * Desglose de vuelto en billetes/monedas peruanas.
 * @example calcularVuelto(73.5) → "1xS/50 + 1xS/20 + 1xS/2 + 1xS/1 + 1xS/0.5"
 */
export function calcularVuelto(monto: number): string {
  const denominaciones = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2];
  const result: string[] = [];
  let restante = monto;
  for (const d of denominaciones) {
    const count = Math.floor(restante / d);
    if (count > 0) {
      result.push(`${count}xS/${d % 1 === 0 ? d : d.toFixed(1)}`);
      restante = Math.round((restante - count * d) * 100) / 100;
    }
  }
  return result.join(" + ");
}

/**
 * Convierte un numero a palabras en español (para boletas/facturas).
 * Soporta 0–999,999 con decimales.
 */
export function numeroAPalabras(n: number): string {
  if (n === 0) return "cero";
  const unidades = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const decenas = ["", "diez", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const especiales: Record<number, string> = {
    11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
    16: "dieciséis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve",
    21: "veintiuno", 22: "veintidós", 23: "veintitrés", 24: "veinticuatro",
    25: "veinticinco", 26: "veintiséis", 27: "veintisiete", 28: "veintiocho", 29: "veintinueve",
  };
  const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

  function convertChunk(num: number): string {
    if (num === 0) return "";
    if (num === 100) return "cien";
    if (especiales[num]) return especiales[num];
    if (num < 10) return unidades[num];
    if (num < 100) {
      const d = Math.floor(num / 10);
      const u = num % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} y ${unidades[u]}`;
    }
    const c = Math.floor(num / 100);
    const rest = num % 100;
    return rest === 0 ? centenas[c] : `${centenas[c]} ${convertChunk(rest)}`;
  }

  const entero = Math.floor(Math.abs(n));
  const decimales = Math.round((Math.abs(n) - entero) * 100);
  let resultado = "";
  if (entero >= 1000) {
    const miles = Math.floor(entero / 1000);
    const resto = entero % 1000;
    resultado = miles === 1 ? "mil" : `${convertChunk(miles)} mil`;
    if (resto > 0) resultado += ` ${convertChunk(resto)}`;
  } else {
    resultado = convertChunk(entero);
  }
  if (decimales > 0) resultado += ` con ${decimales}/100`;
  return resultado.trim();
}


// ─── Helpers anti-NaN / anti-crash (audit 2026-05-05) ──────────────────────────
// Previenen bugs comunes que el audit profundo encontró: divisiones por cero,
// JSON.parse de localStorage corrupto, fechas inválidas que se filtran como NaN.

/**
 * Garantiza que el valor sea un número finito. Si es NaN, Infinity, undefined,
 * null o un string no parseable, retorna `fallback` (default 0).
 *
 * Uso típico:
 *   const utilDelta = safeNumber((curr - prev) / Math.abs(prev), 0);
 *   const stock = safeNumber(parseFloat(input.value));
 */
export function safeNumber(n: unknown, fallback = 0): number {
  if (typeof n === "number") return Number.isFinite(n) ? n : fallback;
  if (typeof n === "string") {
    const parsed = parseFloat(n);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * JSON.parse seguro — captura errores de parseo y retorna `fallback`.
 * Útil para leer localStorage / sessionStorage sin riesgo de crash si el
 * contenido fue corrompido por una versión anterior o una extensión.
 *
 * Uso típico:
 *   const cart = safeJsonParse(localStorage.getItem("cart"), [] as CartItem[]);
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Parsea una fecha ISO (o Date) de forma defensiva. Si es inválida, retorna
 * `fallback` (default null). Útil para evitar que NaN se propague en filtros
 * cuando el API devuelve `createdAt: undefined` o un string corrupto.
 *
 * Uso típico:
 *   const t = safeDateMs(order.createdAt);
 *   if (t === null) continue;
 */
export function safeDateMs(value: string | Date | null | undefined, fallback: number | null = null): number | null {
  if (!value) return fallback;
  const ms = typeof value === "string" ? new Date(value).getTime() : value.getTime();
  return Number.isFinite(ms) ? ms : fallback;
}

// ─── Timezone helpers — Lima/Perú UTC-5 (audit 2026-05-05) ─────────────────────
// Brandon (Pucallpa, Perú): el navegador de un cajero puede tener timezone mal
// configurada. Forzamos `America/Lima` para que "Hoy" siempre signifique el mismo
// rango de horas, sin importar la config local. Evita que filtros de "ventas hoy"
// muestren datos del día equivocado cuando hay diferencia de zona horaria.

export const STORE_TIMEZONE = "America/Lima";

/**
 * Formatea fecha en zona Lima — devuelve "DD/MM/YYYY" o el formato pedido.
 *
 * Uso:
 *   formatLimaDate(order.createdAt)              → "05/05/2026"
 *   formatLimaDate(order.createdAt, { hour: "2-digit", minute: "2-digit" })
 */
export function formatLimaDate(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: STORE_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  }).format(date);
}

/**
 * Retorna el inicio del día (00:00:00) en zona Lima como timestamp UTC ms.
 *
 * Uso:
 *   const todayStart = startOfLimaDay();
 *   const ordersToday = orders.filter(o => new Date(o.createdAt).getTime() >= todayStart);
 */
export function startOfLimaDay(reference?: Date | string): number {
  const ref = reference ? (typeof reference === "string" ? new Date(reference) : reference) : new Date();
  // Convertir a string en zona Lima, luego parsear como local
  const limaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ref);
  // Lima es UTC-5 → 00:00 Lima = 05:00 UTC del mismo día
  return new Date(`${limaDate}T05:00:00.000Z`).getTime();
}

/**
 * Retorna el inicio del día Lima hace N días.
 * Uso: `startOfLimaDayDaysAgo(7)` → inicio de hace 7 días en zona Lima.
 */
export function startOfLimaDayDaysAgo(days: number): number {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - days);
  return startOfLimaDay(now);
}
