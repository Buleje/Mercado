/**
 * Agenda → Google Tasks (ADR-501 §5c). Google Keep no tiene API para cuentas
 * personales (sólo Workspace con delegación de dominio); lo más cercano es Tasks:
 * las tareas con vencimiento (AdminTask) y las notas con fecha van a la lista
 * «Buleje», que se ve en la app Tasks y al costado de Google Calendar.
 *
 * Una sola dirección (Buleje → Google). Sin montos: el título y las notas pasan por
 * `sinMontos`, igual que en el feed ICS.
 */
import "server-only";
import { sinMontos, type NotaIcs, type TareaIcs } from "@/lib/agenda/ics";
import { errorDe, llamarGoogle } from "./oauth";

const API = "https://tasks.googleapis.com/tasks/v1";
export const NOMBRE_LISTA = "Buleje";
/** Tasks corta títulos largos; las notas aceptan hasta 8192. */
const MAX_TITULO = 1024;
const MAX_NOTAS = 8000;

export const claveTarea = (id: string) => `tarea:${id}`;
export const claveNota = (id: string) => `nota:${id}`;

/** `due` de Tasks es sólo fecha: Google ignora la hora y pide RFC 3339 a medianoche UTC. */
function vence(fecha: string): string {
  return `${fecha}T00:00:00.000Z`;
}

export function cuerpoTarea(t: TareaIcs, urlPanel: string | null): Record<string, unknown> {
  const hecha = t.estado === "completada";
  return {
    title: sinMontos(t.titulo).slice(0, MAX_TITULO),
    notes: urlPanel ? `Tarea del panel: ${urlPanel}` : "Tarea del panel de Buleje",
    due: vence(t.fecha),
    status: hecha ? "completed" : "needsAction",
  };
}

export function cuerpoNota(n: NotaIcs, urlPanel: string | null): Record<string, unknown> {
  const contenido = sinMontos(n.contenido).trim();
  const pie = urlPanel ? `Nota del panel: ${urlPanel}` : "Nota del panel de Buleje";
  return {
    title: `Nota: ${sinMontos(n.titulo)}`.slice(0, MAX_TITULO),
    notes: (contenido ? `${contenido}\n\n${pie}` : pie).slice(0, MAX_NOTAS),
    due: vence(n.fecha),
    status: "needsAction",
  };
}

/** La lista «Buleje»: si la guardada sigue existiendo se reusa; si no, se crea. */
export async function asegurarLista(accessToken: string, listaPrevia: string | null): Promise<string> {
  if (listaPrevia) {
    const r = await llamarGoogle(accessToken, `${API}/users/@me/lists/${encodeURIComponent(listaPrevia)}`);
    if (r.status === 200) return listaPrevia;
    if (r.status !== 404 && r.status !== 403 && r.status !== 410) throw errorDe(r, "Leer la lista de tareas");
  }
  const r = await llamarGoogle(accessToken, `${API}/users/@me/lists`, { method: "POST", body: { title: NOMBRE_LISTA } });
  const id = typeof r.json.id === "string" ? r.json.id : null;
  if (r.status !== 200 || !id) throw errorDe(r, "Crear la lista de tareas");
  return id;
}

/** Alta o edición. Tasks pone el id: si la guardada ya no existe, se crea otra. Devuelve el id. */
export async function guardarTareaGoogle(
  accessToken: string,
  listaId: string,
  taskId: string | null,
  cuerpo: Record<string, unknown>,
): Promise<string> {
  const base = `${API}/lists/${encodeURIComponent(listaId)}/tasks`;
  if (taskId) {
    const r = await llamarGoogle(accessToken, `${base}/${encodeURIComponent(taskId)}`, { method: "PATCH", body: cuerpo });
    if (r.status === 200) return taskId;
    if (r.status !== 404 && r.status !== 410) throw errorDe(r, "Editar la tarea");
  }
  const r = await llamarGoogle(accessToken, base, { method: "POST", body: cuerpo });
  const id = typeof r.json.id === "string" ? r.json.id : null;
  if (r.status !== 200 || !id) throw errorDe(r, "Crear la tarea");
  return id;
}

/** 404/410 = ya no estaba: cuenta como hecho. */
export async function borrarTareaGoogle(accessToken: string, listaId: string, taskId: string): Promise<void> {
  const r = await llamarGoogle(accessToken, `${API}/lists/${encodeURIComponent(listaId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
  if (r.status === 204 || r.status === 200 || r.status === 404 || r.status === 410) return;
  throw errorDe(r, "Borrar la tarea");
}
