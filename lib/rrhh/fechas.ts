/**
 * fechas.ts — la aritmética de fechas de Recursos Humanos (ADR-414).
 *
 * Todo acá es **date-only** en UTC, mismo criterio que
 * `lib/forestal/semana-de-registro.ts`: `fecha`, `fechaIngreso`, `fechaCese` y
 * `vigenteDesde` viajan como `"2026-09-14"` y se leen/escriben en
 * `T00:00:00.000Z`. Si se usara la hora local del navegador, un dispositivo
 * con la zona mal configurada correría la tira un día. El «hoy» de la
 * asistencia y de las tarifas es aparte: lo calcula `limaDateKey()` en el
 * servidor (`lib/utils.ts`), nunca el reloj del cliente.
 *
 * PURO: sin Prisma, React ni fetch.
 */

const MS_DIA = 86_400_000;
const FECHA_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Los nombres largos del día, escritos a mano (no `Intl`: ICU cambia "Setiembre" entre versiones de Node). */
const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

/** `true` si el texto es una fecha `YYYY-MM-DD` que existe de verdad (rechaza "2026-02-30"). */
export function esFechaKey(v: string | null | undefined): v is string {
  if (!v || !FECHA_KEY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** El `Date` UTC de una `FechaKey`, para escribir en una columna `@db.Date`. */
export function dateDeFechaKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * La `FechaKey` de un `Date` leyendo sus partes UTC — nunca `.toISOString()`
 * directo sobre una hora local, y nunca la hora local del proceso: una
 * columna `@db.Date` ya llega a medianoche UTC desde Postgres.
 */
export function fechaKeyDeDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Suma (o resta) días a una `FechaKey`, sin salir de UTC. */
export function sumarDias(key: string, dias: number): string {
  const base = dateDeFechaKey(key).getTime();
  return new Date(base + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Cuántos días tiene el mes de `key` (28 a 31): la base del ÷ de la modalidad MES. */
export function diasDelMes(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `"2026-09"` — el mes de `key`, para agrupar tarifas y avisos por tramo. */
export function mesDe(key: string): string {
  return key.slice(0, 7);
}

/**
 * Todos los días entre `desde` y `hasta`, ambos incluidos. `[]` si el rango
 * está invertido o alguna punta no es una fecha válida: un rango roto no
 * inventa días.
 */
export function rangoDeDias(desde: string, hasta: string): string[] {
  if (!esFechaKey(desde) || !esFechaKey(hasta) || hasta < desde) return [];
  const dias: string[] = [];
  let d = desde;
  while (d <= hasta) {
    dias.push(d);
    d = sumarDias(d, 1);
  }
  return dias;
}

/** El lunes de la semana que contiene `key` (semana lunes–domingo, ADR-414 dudas #2). */
function lunesDe(key: string): string {
  const dow = dateDeFechaKey(key).getUTCDay(); // 0 = domingo
  return sumarDias(key, -((dow + 6) % 7));
}

/** El rango lunes–domingo de la semana de `key`. */
export function semanaDe(key: string): { desde: string; hasta: string } {
  const desde = lunesDe(key);
  return { desde, hasta: sumarDias(desde, 6) };
}

/** `0..6` — la posición del día en la semana (lunes = 0), para nombrarlo. */
function indiceDelDia(key: string): number {
  return (dateDeFechaKey(key).getUTCDay() + 6) % 7;
}

/** `"11/09"` — sólo día y mes, sin nombre (para «Ingresó el 15/09», «Cesó el 10/09»). */
export function etiquetaCorta(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/**
 * `"jueves 11/09"` — cómo se nombra un día en la hoja de asistencia (§7). Con
 * el año sólo cuando NO es el de `referencia`: repetirlo en cada fila de una
 * tira del mismo año no dice nada.
 */
export function etiquetaDia(key: string, referencia?: string): string {
  const anio = key.slice(0, 4);
  const anioRef = (referencia ?? key).slice(0, 4);
  const sufijo = anio === anioRef ? "" : `/${anio}`;
  return `${DIAS_LARGOS[indiceDelDia(key)]} ${key.slice(8, 10)}/${key.slice(5, 7)}${sufijo}`;
}

/** `"07:30"` → 450 minutos desde las 00:00. `null` si el formato no es `HH:MM` válido. */
export function minutosDeHora(hora: string | null | undefined): number | null {
  if (!hora || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** 450 → `"07:30"`. `null` fuera de `[0, 1440)`. */
export function horaDeMinutos(min: number | null | undefined): string | null {
  if (min == null || !Number.isFinite(min) || min < 0 || min >= 1440) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
