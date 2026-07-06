/**
 * marketplace-store-hours — utilidades puras para evaluar el horario de
 * atención de una tienda y derivar su estado actual.
 *
 * Estos helpers son **deterministas y testeables** — siempre se les pasa
 * `now` explícito para evitar acoplar la lógica a `new Date()`. En runtime
 * los callers usan `now = new Date()` por defecto.
 *
 * Storage: el horario se guarda en `Store.hoursJson` (jsonb) como objeto
 * keyed por día (`mon`..`sun`) con `{ open, close, closed }`.
 */

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DayHours {
  open?: string;   // "HH:MM" 24h
  close?: string;
  closed?: boolean;
}

export type StoreHours = Partial<Record<DayKey, DayHours>>;

/** Etiquetas legibles. Lun-Sáb son cortas; "Domingo" no se abrevia para mensajes. */
export const DAY_FULL: Record<DayKey, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

const JS_DAY_TO_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Convierte "HH:MM" a minutos desde medianoche. Devuelve null si inválido. */
function toMinutes(hhmm?: string): number | null {
  if (!hhmm || typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(mi)) return null;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/** ¿Está abierta la tienda en `now` según `hours`? */
export function isOpenNow(hours: StoreHours | null | undefined, now: Date): boolean {
  if (!hours) return false;
  const todayKey = JS_DAY_TO_KEY[now.getDay()];
  const day = hours[todayKey];
  if (!day || day.closed) return false;
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (open === null || close === null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  // Soporte de cierres después de medianoche (close < open):
  // ej. 19:00 → 02:00. Se considera abierto si cur >= open OR cur <= close.
  if (close < open) return cur >= open || cur <= close;
  return cur >= open && cur <= close;
}

/**
 * Próxima fecha/hora de apertura desde `now`. Retorna null si todos los
 * días están `closed` (ej. tienda permanentemente cerrada).
 *
 * Si la tienda abre hoy más tarde, devuelve hoy a esa hora.
 * Si la tienda ya cerró hoy, busca el próximo día con `closed: false`.
 * Búsqueda hasta 14 días para evitar loops infinitos.
 */
export function nextOpening(hours: StoreHours | null | undefined, now: Date): Date | null {
  if (!hours) return null;
  const cur = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset < 14; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const key = JS_DAY_TO_KEY[d.getDay()];
    const day = hours[key];
    if (!day || day.closed) continue;
    const open = toMinutes(day.open);
    if (open === null) continue;
    if (offset === 0 && open <= cur) {
      // hoy ya pasó la apertura — sigue al día siguiente
      continue;
    }
    const result = new Date(d);
    result.setHours(Math.floor(open / 60), open % 60, 0, 0);
    return result;
  }
  return null;
}

/** Frase legible "Abre hoy a las 7:00 AM" / "Abre el lunes a las 7:00 AM". */
export function nextOpeningLabel(hours: StoreHours | null | undefined, now: Date): string {
  const next = nextOpening(hours, now);
  if (!next) return "Sin horario configurado";
  const sameDay = next.getDate() === now.getDate() && next.getMonth() === now.getMonth();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    next.getDate() === tomorrow.getDate() && next.getMonth() === tomorrow.getMonth();
  const time = next.toLocaleTimeString("es-PE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (sameDay) return `Abre hoy a las ${time}`;
  if (isTomorrow) return `Abre mañana a las ${time}`;
  const dayKey = JS_DAY_TO_KEY[next.getDay()];
  return `Abre el ${DAY_FULL[dayKey].toLowerCase()} a las ${time}`;
}

/** Minutos desde medianoche → "8:00 a. m." (formato PE 12h). */
function minutesToLabel(mins: number): string {
  const base = new Date(2000, 0, 1, 0, 0, 0, 0);
  base.setMinutes(mins);
  return base.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Rango de atención de HOY, p.ej. "8:00 a. m.–10:00 p. m.". Devuelve `null` si el
 * día está cerrado, faltan datos, o `hours` no viene con el shape por-día
 * esperado (degradación limpia — la card simplemente no muestra el horario).
 */
export function todayHoursLabel(hours: StoreHours | null | undefined, now: Date): string | null {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return null;
  const key = JS_DAY_TO_KEY[now.getDay()];
  const day = (hours as StoreHours)[key];
  if (!day || day.closed) return null;
  const o = toMinutes(day.open);
  const c = toMinutes(day.close);
  if (o == null || c == null) return null;
  return `${minutesToLabel(o)}–${minutesToLabel(c)}`;
}

/** Estado derivado de una tienda. Prioridad construction > vacation > closed > open. */
export type StoreStatus = "open" | "vacation" | "closed" | "construction";

export interface StoreStatusInput {
  isPublished?: boolean;
  vacationMode?: boolean;
  underConstruction?: boolean;
  hours?: StoreHours | null;
}

export function storeStatus(store: StoreStatusInput, now: Date): StoreStatus {
  if (store.underConstruction) return "construction";
  if (store.vacationMode) return "vacation";
  if (!isOpenNow(store.hours, now)) return "closed";
  return "open";
}

/** Orden numérico para ordenar listings: open (0) → vacation (1) → closed (2) → construction (3). */
const STATUS_ORDER: Record<StoreStatus, number> = {
  open: 0,
  vacation: 1,
  closed: 2,
  construction: 3,
};

export function sortStoresByStatus<T extends StoreStatusInput>(
  stores: T[],
  now: Date,
): T[] {
  return [...stores].sort((a, b) => {
    const sa = STATUS_ORDER[storeStatus(a, now)];
    const sb = STATUS_ORDER[storeStatus(b, now)];
    return sa - sb;
  });
}

/** Valida que `scheduledFor` cae dentro de un horario de atención válido. */
export function isValidReservationSlot(
  hours: StoreHours | null | undefined,
  when: Date,
  now: Date,
  maxDaysAhead = 7,
): { ok: true } | { ok: false; reason: string } {
  if (!hours) return { ok: false, reason: "Tienda sin horario configurado" };
  if (when.getTime() <= now.getTime()) {
    return { ok: false, reason: "La fecha de reserva debe ser futura" };
  }
  const limit = new Date(now);
  limit.setDate(limit.getDate() + maxDaysAhead);
  if (when.getTime() > limit.getTime()) {
    return { ok: false, reason: `Solo aceptamos reservas hasta ${maxDaysAhead} días en el futuro` };
  }
  const key = JS_DAY_TO_KEY[when.getDay()];
  const day = hours[key];
  if (!day || day.closed) {
    return { ok: false, reason: `La tienda no atiende el ${DAY_FULL[key].toLowerCase()}` };
  }
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  const slot = when.getHours() * 60 + when.getMinutes();
  if (open === null || close === null) {
    return { ok: false, reason: "Horario inválido" };
  }
  const inRange = close < open ? slot >= open || slot <= close : slot >= open && slot <= close;
  if (!inRange) {
    return { ok: false, reason: "La hora elegida está fuera del horario de atención" };
  }
  return { ok: true };
}
