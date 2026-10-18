/**
 * Agenda → Google Calendar (ADR-501 §5b). Un evento recurrente por actividad en el
 * calendario «Buleje · Administración» que crea la app (alcance
 * `calendar.app.created`: no ve ni toca la agenda personal).
 *
 * La repetición es la MISMA que la del feed ICS (`reglaDeRepeticion` de lib/agenda/ics.ts):
 * RRULE + RDATE de los febreros cortos. El id del evento es propio y estable
 * (sha256 de conexión+actividad, en hex ⊂ base32hex como pide Google), así un
 * reintento no duplica: el alta que choca (409) se vuelve edición.
 */
import "server-only";
import { createHash } from "node:crypto";
import {
  MINUTOS_EVENTO_CON_HORA,
  ZONA_AGENDA,
  compacta,
  descripcionActividad,
  horaMas,
  reglaDeRepeticion,
  sumarDias,
  type ActividadIcs,
} from "@/lib/agenda/ics";
import { errorDe, llamarGoogle } from "./oauth";

const API = "https://www.googleapis.com/calendar/v3";
export const NOMBRE_CALENDARIO = "Buleje · Administración";
const DESCRIPCION_CALENDARIO =
  "Actividades de la agenda de Administración de Buleje. Se llena sola desde el panel: los cambios hechos acá no vuelven al panel.";

/** Id de evento estable: [0-9a-f] es parte de base32hex (a-v, 0-9) y 64 caracteres entran en 5-1024. */
export function idEventoGoogle(conexionId: string, actividadId: string): string {
  return createHash("sha256").update(`agenda:${conexionId}:${actividadId}`).digest("hex");
}

/** sha256 de lo que se manda: igual = no se llama a Google. */
export function huellaDe(cuerpo: unknown): string {
  return createHash("sha256").update(JSON.stringify(cuerpo)).digest("hex");
}

function hhmmssAIso(fecha: string, hhmmss: string): string {
  return `${fecha}T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}`;
}

/**
 * El cuerpo del evento (Events resource). null = la regla no da ningún día
 * (p. ej. `hasta` antes del primero): no hay nada que publicar.
 */
export function cuerpoEvento(a: ActividadIcs, urlPanel: string | null): Record<string, unknown> | null {
  const regla = reglaDeRepeticion(a.recurrencia, a.hora);
  if (!regla) return null;
  const recurrence: string[] = [];
  if (regla.rrule) recurrence.push(`RRULE:${regla.rrule}`);

  let start: Record<string, string>;
  let end: Record<string, string>;
  if (a.hora) {
    const ini = horaMas(regla.inicio, a.hora, 0);
    const fin = horaMas(regla.inicio, a.hora, MINUTOS_EVENTO_CON_HORA);
    start = { dateTime: hhmmssAIso(ini.fecha, ini.hhmmss), timeZone: ZONA_AGENDA };
    end = { dateTime: hhmmssAIso(fin.fecha, fin.hhmmss), timeZone: ZONA_AGENDA };
    if (regla.extras.length) {
      recurrence.push(`RDATE;TZID=${ZONA_AGENDA}:${regla.extras.map((f) => `${compacta(f)}T${ini.hhmmss}`).join(",")}`);
    }
  } else {
    start = { date: regla.inicio };
    end = { date: sumarDias(regla.inicio, 1) };
    if (regla.extras.length) recurrence.push(`RDATE;VALUE=DATE:${regla.extras.map(compacta).join(",")}`);
  }

  return {
    summary: a.nombre,
    description: descripcionActividad(a, urlPanel),
    start,
    end,
    ...(recurrence.length ? { recurrence } : {}),
    // Con hora: aviso 10 min antes. Todo el día: lo que tenga el calendario.
    reminders: a.hora ? { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] } : { useDefault: true },
    transparency: a.hora ? "opaque" : "transparent",
    status: "confirmed",
    ...(urlPanel ? { source: { title: "Panel de Buleje", url: urlPanel } } : {}),
  };
}

/**
 * El calendario de la app: si el guardado sigue existiendo se reusa; si no, se crea.
 * Devuelve su id.
 */
export async function asegurarCalendario(accessToken: string, calendarIdPrevio: string | null): Promise<string> {
  if (calendarIdPrevio) {
    const r = await llamarGoogle(accessToken, `${API}/calendars/${encodeURIComponent(calendarIdPrevio)}`);
    if (r.status === 200) return calendarIdPrevio;
    if (r.status !== 404 && r.status !== 403 && r.status !== 410) throw errorDe(r, "Leer el calendario");
  }
  const r = await llamarGoogle(accessToken, `${API}/calendars`, {
    method: "POST",
    body: { summary: NOMBRE_CALENDARIO, description: DESCRIPCION_CALENDARIO, timeZone: ZONA_AGENDA },
  });
  const id = typeof r.json.id === "string" ? r.json.id : null;
  if (r.status !== 200 || !id) throw errorDe(r, "Crear el calendario");
  return id;
}

/** Alta o edición del evento con id propio. Devuelve el id. */
export async function guardarEventoGoogle(
  accessToken: string,
  calendarId: string,
  eventId: string,
  cuerpo: Record<string, unknown>,
  yaExistia: boolean,
): Promise<string> {
  const base = `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const editar = () => llamarGoogle(accessToken, `${base}/${eventId}`, { method: "PUT", body: cuerpo });
  if (yaExistia) {
    const r = await editar();
    if (r.status === 200) return eventId;
    if (r.status !== 404 && r.status !== 410) throw errorDe(r, "Editar el evento");
  }
  const alta = await llamarGoogle(accessToken, base, { method: "POST", body: { ...cuerpo, id: eventId } });
  if (alta.status === 200) return eventId;
  // 409 = ese id ya existe (un alta anterior sin vínculo, o un evento borrado): se edita.
  if (alta.status === 409) {
    const r = await editar();
    if (r.status === 200) return eventId;
    throw errorDe(r, "Editar el evento");
  }
  throw errorDe(alta, "Crear el evento");
}

/** Borra el evento. 404/410 = ya no estaba: cuenta como hecho. */
export async function borrarEventoGoogle(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const r = await llamarGoogle(accessToken, `${API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: "DELETE",
  });
  if (r.status === 204 || r.status === 200 || r.status === 404 || r.status === 410) return;
  throw errorDe(r, "Borrar el evento");
}
