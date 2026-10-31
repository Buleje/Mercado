/**
 * Agenda → calendario ICS (RFC 5545) y la regla de repetición que comparte con Google
 * Calendar (ADR-501 §5a). PURO: sin imports de servidor ni de Prisma, lo prueban los tests
 * y lo usan la ruta pública del feed y `lib/agenda/google/calendar.ts`.
 *
 * Cada actividad es UN evento con su RRULE (no una fila por día): así el feed no depende
 * del motor que calcula «¿ya está hecho?» y Google/Outlook/Apple expanden la repetición
 * solos. Notas con fecha y tareas con fecha van como eventos de todo el día (Google
 * ignora VTODO en un calendario suscrito).
 *
 * Sin montos: el enlace es público para quien lo tenga. Los textos libres (nota de la
 * actividad, contenido de la nota del día) pasan por `sinMontos` antes de salir.
 *
 * Zona: America/Lima es −05:00 todo el año (sin horario de verano desde 1994), así que el
 * VTIMEZONE va fijo y la conversión a UTC es restar cinco horas.
 */
import type { FechaKey, Recurrencia, ReglaAgenda } from "./tipos";

// ── Entradas (sin Prisma: la DB class arma esto) ────────────────────────────

export interface ActividadIcs {
  id: string;
  nombre: string;
  regla: ReglaAgenda;
  /** Con quién es (parte o beneficiario), snapshot del nombre. */
  objetivoNombre: string | null;
  recurrencia: Recurrencia;
  /** «HH:MM» de pared en Lima; null = todo el día. */
  hora: string | null;
  nota: string | null;
  actualizado: Date;
}

export interface NotaIcs {
  id: string;
  titulo: string;
  contenido: string;
  fecha: FechaKey;
  actualizado: Date;
}

export interface TareaIcs {
  id: string;
  titulo: string;
  /** pendiente | en_progreso | completada (AdminTask.status). */
  estado: string;
  fecha: FechaKey;
  actualizado: Date;
}

/** Un vencimiento del sistema (adelanto, entrega pactada…): sólo el título, nunca el monto. */
export interface VencimientoIcs {
  /** «adelanto:<id>», «entrega:<id>»… (VencimientoDelDia.id) */
  id: string;
  titulo: string;
  fecha: FechaKey;
}

export interface DatosIcs {
  actividades: ActividadIcs[];
  notas: NotaIcs[];
  tareas: TareaIcs[];
  vencimientos?: VencimientoIcs[];
}

export interface OpcionesIcs {
  nombreCalendario: string;
  /** Enlace a la pestaña (va en URL y al pie de la descripción). */
  urlPanel?: string | null;
  /** Hora de armado (DTSTAMP). Los tests la fijan. */
  ahora?: Date;
}

export const ZONA_AGENDA = "America/Lima";
/** La pestaña donde se marca lo hecho (enlace del feed y de los eventos de Google). */
export const RUTA_PANEL_AGENDA = "/admin?tab=administracion&vista=hoy";
/** Lima = UTC−5 fijo. */
const OFFSET_LIMA_MIN = -5 * 60;
/** Lo que dura un evento con hora: lo justo para que se vea en la grilla. */
export const MINUTOS_EVENTO_CON_HORA = 30;
const DOMINIO_UID = "agenda.buleje";
const CRLF = "\r\n";
const MS_DIA = 86_400_000;

/** RFC 5545 §3.3.10: 0 = domingo … 6 = sábado, igual que `diasSemana`. */
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
/** Orden de lectura (lunes primero) para que la regla se lea como en el panel. */
const ORDEN_LUNES_PRIMERO = [1, 2, 3, 4, 5, 6, 0];

const ETIQUETA_REGLA: Record<ReglaAgenda, string> = {
  asistencia: "Asistencia del personal",
  facturas: "Facturas",
  servicio_aserrio: "Servicio de aserrío",
  gastos_ingresos: "Gastos e ingresos",
  adelantos: "Adelantos",
  cuenta_tercero: "Cuenta de un tercero",
  manual: "Actividad",
};

// ── Texto ───────────────────────────────────────────────────────────────────

/**
 * Montos fuera de un texto libre: «S/ 1,250.00», «s/.50», «$ 30», «USD 12», «300 soles».
 * El feed es público para quien tenga el enlace: un nombre está bien, una cifra no.
 */
const RE_MONTO_PREFIJO = /(?:S\/\.?|US\$|\$|\bUSD|\bPEN)\s*-?\d(?:[\d.,' ]*\d)?/gi;
const RE_MONTO_SUFIJO = /\d[\d.,']*\s*(?:soles|sol|dólares|dolares|usd|pen)\b/gi;
export const MONTO_OCULTO = "[monto]";

export function sinMontos(texto: string): string {
  return texto.replace(RE_MONTO_PREFIJO, MONTO_OCULTO).replace(RE_MONTO_SUFIJO, MONTO_OCULTO);
}

/** RFC 5545 §3.3.11 (TEXT): `\` `;` `,` y los saltos de línea se escapan. */
export function escaparTexto(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: ninguna línea pasa de 75 OCTETOS (no caracteres); la continuación
 * empieza con un espacio, que cuenta dentro de los 75. Nunca parte un carácter UTF-8
 * de varios bytes («ñ», «á», «·»).
 */
const utf8 = new TextEncoder();
const octetos = (texto: string): number => utf8.encode(texto).length;

export function plegarLinea(linea: string): string {
  const MAX = 75;
  if (octetos(linea) <= MAX) return linea;
  const partes: string[] = [];
  let actual = "";
  let bytes = 0;
  let limite = MAX;
  for (const ch of linea) {
    const b = octetos(ch);
    if (bytes + b > limite) {
      partes.push(actual);
      actual = "";
      bytes = 0;
      limite = MAX - 1; // el espacio de la continuación ocupa un octeto
    }
    actual += ch;
    bytes += b;
  }
  if (actual) partes.push(actual);
  return partes.join(`${CRLF} `);
}

// ── Fechas (todo en «pared de Lima», aritmética en UTC para no depender del TZ del server) ──

function aUtc(fecha: FechaKey): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function deUtc(ms: number): FechaKey {
  return new Date(ms).toISOString().slice(0, 10);
}

export function sumarDias(fecha: FechaKey, dias: number): FechaKey {
  return deUtc(aUtc(fecha) + dias * MS_DIA);
}

function diaSemana(fecha: FechaKey): number {
  return new Date(aUtc(fecha)).getUTCDay();
}

/** Lunes de la semana (WKST=MO) de una fecha. */
function lunesDe(fecha: FechaKey): number {
  const dow = diaSemana(fecha);
  return aUtc(fecha) - ((dow + 6) % 7) * MS_DIA;
}

function diasDelMes(fecha: FechaKey): number {
  const [y, m] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 20261018 */
export function compacta(fecha: FechaKey): string {
  return fecha.replace(/-/g, "");
}

/** 20261018T120000Z */
function utcCompacta(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export interface HoraPared {
  fecha: FechaKey;
  hhmmss: string;
}

/** «HH:MM» + minutos → fecha y hora de pared (puede pasar al día siguiente). */
export function horaMas(fecha: FechaKey, hora: string, minutos: number): HoraPared {
  const [h, mi] = hora.split(":").map(Number);
  const total = h * 60 + mi + minutos;
  const dias = Math.floor(total / 1440);
  const resto = total - dias * 1440;
  const hh = String(Math.floor(resto / 60)).padStart(2, "0");
  const mm = String(resto % 60).padStart(2, "0");
  return { fecha: sumarDias(fecha, dias), hhmmss: `${hh}${mm}00` };
}

// ── Repetición ──────────────────────────────────────────────────────────────

function diasOrdenados(dias: number[]): number[] {
  const set = new Set(dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  return ORDEN_LUNES_PRIMERO.filter((d) => set.has(d));
}

/** Día del mes en que cae la mensual ese mes: 31 = último; 29/30 bajan al último si el mes es corto. */
function diaMensualEn(fecha: FechaKey, diaMes: number): number {
  return Math.min(diaMes, diasDelMes(fecha));
}

/**
 * Primera fecha ≥ `desde` que cumple la regla (RFC 5545 §3.8.5.3: DTSTART tiene que
 * caer en la regla; si no, el conjunto queda indefinido y cada cliente hace otra cosa).
 * Quincenal: las semanas se cuentan de lunes a domingo desde la semana de `desde`
 * (semana 0 = la de `desde`, se toman las pares) — es lo que hace INTERVAL=2;WKST=MO.
 */
export function primeraFecha(rec: Recurrencia): FechaKey | null {
  const { frecuencia, desde } = rec;
  if (frecuencia === "una_vez" || frecuencia === "cada_n_dias") return desde;
  if (frecuencia === "mensual") {
    if (!rec.diaMes) return null;
    for (let i = 0; i < 62; i++) {
      const f = sumarDias(desde, i);
      if (Number(f.slice(8, 10)) === diaMensualEn(f, rec.diaMes)) return f;
    }
    return null;
  }
  const dias = diasOrdenados(rec.diasSemana);
  if (frecuencia === "diaria" && (dias.length === 0 || dias.length === 7)) return desde;
  if (dias.length === 0) return null;
  const lunes0 = lunesDe(desde);
  for (let i = 0; i < 21; i++) {
    const f = sumarDias(desde, i);
    if (!dias.includes(diaSemana(f))) continue;
    if (frecuencia === "quincenal") {
      const semana = Math.round((lunesDe(f) - lunes0) / (7 * MS_DIA));
      if (semana % 2 !== 0) continue;
    }
    return f;
  }
  return null;
}

export interface ReglaRepeticion {
  /** Primer día del evento (DTSTART). */
  inicio: FechaKey;
  /** Sin el prefijo «RRULE:». null = una sola vez. */
  rrule: string | null;
  /**
   * Días sueltos que la RRULE no da (RDATE): el febrero de una mensual del 29/30, que en
   * el panel cae el último día del mes. Vacío casi siempre.
   */
  extras: FechaKey[];
}

/** Años hacia adelante para los RDATE de febrero (después, quien lo mire lo verá en el panel). */
const ANIOS_EXTRAS = 10;

/** Los febreros en que una mensual del 29/30 cae el último día (RFC: BYMONTHDAY=30 los salta). */
function febrerosCortos(inicio: FechaKey, hasta: FechaKey | null, diaMes: number): FechaKey[] {
  if (diaMes < 29 || diaMes >= 31) return [];
  const out: FechaKey[] = [];
  const y0 = Number(inicio.slice(0, 4));
  for (let y = y0; y <= y0 + ANIOS_EXTRAS; y++) {
    const ultimo = new Date(Date.UTC(y, 2, 0)).getUTCDate();
    if (ultimo >= diaMes) continue;
    const f = `${y}-02-${String(ultimo).padStart(2, "0")}`;
    // Si DTSTART cae en un febrero corto, va también en RDATE: así queda dentro del
    // conjunto aunque BYMONTHDAY=30 no lo dé (ical.js salta un DTSTART fuera de la regla).
    if (f < inicio || (hasta && f > hasta)) continue;
    out.push(f);
  }
  return out;
}

/**
 * La RRULE de una actividad, la misma para el ICS y para `recurrence` de Google Calendar.
 *  · diaria (7 días o ninguno) → FREQ=DAILY · diaria con algunos días → FREQ=WEEKLY;BYDAY
 *    (equivale a DAILY;BYDAY y Outlook sólo entiende la semanal)
 *  · semanal → FREQ=WEEKLY;BYDAY · quincenal → FREQ=WEEKLY;INTERVAL=2;BYDAY
 *  · mensual → BYMONTHDAY=n · 31 = -1 (último) · 29/30 = BYMONTHDAY=n + RDATE del último
 *    de febrero («ese día o el último si el mes es más corto»). No BYSETPOS: ical.js lo
 *    expande mal (medido 18-10: 28, 29 y 30 de marzo) y Outlook no lo entiende.
 *  · cada_n_dias → FREQ=DAILY;INTERVAL=n
 *  · UNTIL: fecha si es de todo el día; si tiene hora, 23:59:59 de Lima en UTC (§3.3.10:
 *    con DTSTART local+TZID, UNTIL va en UTC).
 * null = la regla no da ningún día (p. ej. `hasta` antes del primero).
 */
export function reglaDeRepeticion(rec: Recurrencia, hora: string | null): ReglaRepeticion | null {
  const inicio = primeraFecha(rec);
  if (!inicio) return null;
  if (rec.hasta && inicio > rec.hasta) return null;
  if (rec.frecuencia === "una_vez") return { inicio, rrule: null, extras: [] };

  const partes: string[] = [];
  const dias = diasOrdenados(rec.diasSemana);
  const byday = dias.map((d) => BYDAY[d]).join(",");
  switch (rec.frecuencia) {
    case "diaria":
      if (dias.length === 0 || dias.length === 7) partes.push("FREQ=DAILY");
      else partes.push("FREQ=WEEKLY", "WKST=MO", `BYDAY=${byday}`);
      break;
    case "semanal":
      partes.push("FREQ=WEEKLY", "WKST=MO", `BYDAY=${byday}`);
      break;
    case "quincenal":
      partes.push("FREQ=WEEKLY", "INTERVAL=2", "WKST=MO", `BYDAY=${byday}`);
      break;
    case "mensual": {
      const n = rec.diaMes ?? 1;
      partes.push("FREQ=MONTHLY");
      partes.push(n >= 31 ? "BYMONTHDAY=-1" : `BYMONTHDAY=${n}`);
      break;
    }
    case "cada_n_dias": {
      const n = Math.max(1, rec.cadaN ?? 1);
      partes.push("FREQ=DAILY");
      if (n > 1) partes.push(`INTERVAL=${n}`);
      break;
    }
  }
  if (rec.hasta) {
    if (hora) {
      // 23:59:59 de Lima = 04:59:59Z del día siguiente
      const finUtc = new Date(aUtc(rec.hasta) + MS_DIA - 1000 - OFFSET_LIMA_MIN * 60_000);
      partes.push(`UNTIL=${utcCompacta(finUtc)}`);
    } else {
      partes.push(`UNTIL=${compacta(rec.hasta)}`);
    }
  }
  const extras = rec.frecuencia === "mensual" ? febrerosCortos(inicio, rec.hasta, rec.diaMes ?? 1) : [];
  return { inicio, rrule: partes.join(";"), extras };
}

// ── Descripciones (compartidas con Google) ──────────────────────────────────

export function descripcionActividad(a: Pick<ActividadIcs, "regla" | "objetivoNombre" | "nota">, urlPanel?: string | null): string {
  const lineas = [ETIQUETA_REGLA[a.regla] ?? "Actividad"];
  if (a.objetivoNombre) lineas.push(`Con: ${a.objetivoNombre}`);
  if (a.nota) lineas.push(sinMontos(a.nota));
  if (urlPanel) lineas.push(`Marcarla en el panel: ${urlPanel}`);
  return lineas.join("\n");
}

export function etiquetaRegla(regla: ReglaAgenda): string {
  return ETIQUETA_REGLA[regla] ?? "Actividad";
}

// ── Armado ──────────────────────────────────────────────────────────────────

function prop(nombre: string, valor: string): string {
  return plegarLinea(`${nombre}:${valor}`);
}

function eventoTodoElDia(
  uid: string,
  fecha: FechaKey,
  resumen: string,
  descripcion: string | null,
  actualizado: Date,
  ahora: Date,
  urlPanel: string | null | undefined,
  rrule: string | null = null,
  extras: FechaKey[] = [],
): string[] {
  const l = [
    "BEGIN:VEVENT",
    prop("UID", uid),
    prop("DTSTAMP", utcCompacta(ahora)),
    prop("LAST-MODIFIED", utcCompacta(actualizado)),
    prop("DTSTART;VALUE=DATE", compacta(fecha)),
    prop("DTEND;VALUE=DATE", compacta(sumarDias(fecha, 1))),
  ];
  if (rrule) l.push(prop("RRULE", rrule));
  if (extras.length) l.push(prop("RDATE;VALUE=DATE", extras.map(compacta).join(",")));
  l.push(prop("SUMMARY", escaparTexto(resumen)));
  if (descripcion) l.push(prop("DESCRIPTION", escaparTexto(descripcion)));
  if (urlPanel) l.push(prop("URL;VALUE=URI", urlPanel));
  l.push("TRANSP:TRANSPARENT", "END:VEVENT");
  return l;
}

function eventoActividad(a: ActividadIcs, ahora: Date, urlPanel: string | null | undefined): string[] {
  const regla = reglaDeRepeticion(a.recurrencia, a.hora);
  if (!regla) return [];
  const uid = `act-${a.id}@${DOMINIO_UID}`;
  const descripcion = descripcionActividad(a, urlPanel);
  if (!a.hora) {
    return eventoTodoElDia(uid, regla.inicio, a.nombre, descripcion, a.actualizado, ahora, urlPanel, regla.rrule, regla.extras);
  }
  const inicio = horaMas(regla.inicio, a.hora, 0);
  const fin = horaMas(regla.inicio, a.hora, MINUTOS_EVENTO_CON_HORA);
  const l = [
    "BEGIN:VEVENT",
    prop("UID", uid),
    prop("DTSTAMP", utcCompacta(ahora)),
    prop("LAST-MODIFIED", utcCompacta(a.actualizado)),
    prop(`DTSTART;TZID=${ZONA_AGENDA}`, `${compacta(inicio.fecha)}T${inicio.hhmmss}`),
    prop(`DTEND;TZID=${ZONA_AGENDA}`, `${compacta(fin.fecha)}T${fin.hhmmss}`),
  ];
  if (regla.rrule) l.push(prop("RRULE", regla.rrule));
  if (regla.extras.length) {
    const valores = regla.extras.map((f) => `${compacta(f)}T${inicio.hhmmss}`).join(",");
    l.push(prop(`RDATE;TZID=${ZONA_AGENDA}`, valores));
  }
  l.push(prop("SUMMARY", escaparTexto(a.nombre)), prop("DESCRIPTION", escaparTexto(descripcion)));
  if (urlPanel) l.push(prop("URL;VALUE=URI", urlPanel));
  l.push("TRANSP:OPAQUE", "END:VEVENT");
  return l;
}

const VTIMEZONE_LIMA = [
  "BEGIN:VTIMEZONE",
  `TZID:${ZONA_AGENDA}`,
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0500",
  "TZNAME:-05",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** El texto completo del calendario, con CRLF y líneas plegadas. */
export function armarIcs(datos: DatosIcs, opciones: OpcionesIcs): string {
  const ahora = opciones.ahora ?? new Date();
  const url = opciones.urlPanel ?? null;
  const lineas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Buleje//Agenda de Administracion//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    prop("X-WR-CALNAME", escaparTexto(opciones.nombreCalendario)),
    prop("X-WR-TIMEZONE", ZONA_AGENDA),
    prop("X-WR-CALDESC", escaparTexto("Lo que toca hacer en el negocio, según la agenda de Administración.")),
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE_LIMA,
  ];
  for (const a of datos.actividades) lineas.push(...eventoActividad(a, ahora, url));
  for (const n of datos.notas) {
    const contenido = n.contenido.trim() ? sinMontos(n.contenido.trim()) : null;
    lineas.push(
      ...eventoTodoElDia(`nota-${n.id}@${DOMINIO_UID}`, n.fecha, `Nota: ${sinMontos(n.titulo)}`, contenido, n.actualizado, ahora, url),
    );
  }
  for (const t of datos.tareas) {
    const hecha = t.estado === "completada";
    lineas.push(
      ...eventoTodoElDia(
        `tarea-${t.id}@${DOMINIO_UID}`,
        t.fecha,
        `${hecha ? "Hecha" : "Tarea"}: ${sinMontos(t.titulo)}`,
        null,
        t.actualizado,
        ahora,
        url,
      ),
    );
  }
  for (const v of datos.vencimientos ?? []) {
    // Sin LAST-MODIFIED propio: el vencimiento no tiene fila con updatedAt (se arma de varias tablas).
    lineas.push(...eventoTodoElDia(`venc-${v.id}@${DOMINIO_UID}`, v.fecha, sinMontos(v.titulo), null, ahora, ahora, url));
  }
  lineas.push("END:VCALENDAR");
  return lineas.join(CRLF) + CRLF;
}
