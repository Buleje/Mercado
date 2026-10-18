/**
 * Llamadas de la agenda de Administración (ADR-501 §7) desde el panel.
 *
 * Una sola forma de pedir: `pedirJson` nunca lanza, devuelve `{ ok, data }` o
 * `{ ok: false, status, error }` con un mensaje en castellano. `status` 404
 * deja a la vista tratarlo como «todavía no hay nada» (la ruta no existe aún
 * o la actividad ya se borró) sin pintar un error rojo; 0 = sin conexión.
 *
 * Las mutaciones van con `csrfHeaders()` (proxy), igual que Notas y Tareas.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import type { z } from "zod";
import type { ActividadEditarSchema } from "@/lib/agenda/schemas";
import type { CuerpoCrearActividad } from "@/lib/agenda/plantillas";
import type {
  ActividadDTO,
  ConexionGoogleDTO,
  DiaAgenda,
  EstadoManual,
  FechaKey,
  FeedIcsDTO,
  OcurrenciaDTO,
  ResumenAgendaHoy,
} from "@/lib/agenda/tipos";

/** `sinConfigurar`: el servidor dijo `configurado: false` (Google sin su clave): no es un error que se arregle reintentando. */
export type Respuesta<T> = { ok: true; data: T } | { ok: false; status: number; error: string; sinConfigurar?: boolean };

const BASE = "/api/admin/agenda";

const MENSAJE_POR_ESTADO: Record<number, string> = {
  401: "Tu sesión venció: vuelve a entrar.",
  403: "Tu usuario no puede hacer esto.",
  404: "No se encontró.",
  409: "Otra persona la cambió mientras la editabas: ciérrala y vuelve a abrirla.",
  429: "Muchos pedidos seguidos: espera unos segundos.",
};

function mensajeDe(cuerpo: unknown, status: number): string {
  if (cuerpo && typeof cuerpo === "object") {
    const { error, message } = cuerpo as { error?: unknown; message?: unknown };
    if (typeof error === "string" && error.length > 0 && error.length < 200 && !/^[a-z_]+$/.test(error)) return error;
    if (typeof message === "string" && message.length > 0 && message.length < 200) return message;
  }
  return MENSAJE_POR_ESTADO[status] ?? (status >= 500 ? "El servidor no respondió bien. Intenta de nuevo en un momento." : "No se pudo completar.");
}

export async function pedirJson<T>(url: string, init: RequestInit = {}): Promise<Respuesta<T>> {
  const metodo = (init.method ?? "GET").toUpperCase();
  const headers =
    metodo === "GET" ? init.headers : csrfHeaders(init.body !== undefined ? { "Content-Type": "application/json" } : {});
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers });
  } catch {
    return { ok: false, status: 0, error: "Sin conexión: revisa tu internet e intenta de nuevo." };
  }
  const cuerpo: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const sinConfigurar = !!cuerpo && typeof cuerpo === "object" && (cuerpo as { configurado?: unknown }).configurado === false;
    return { ok: false, status: res.status, error: mensajeDe(cuerpo, res.status), ...(sinConfigurar ? { sinConfigurar } : {}) };
  }
  return { ok: true, data: cuerpo as T };
}

const json = (cuerpo: unknown): string => JSON.stringify(cuerpo);

// ── Lecturas ────────────────────────────────────────────────────────────────

export const leerHoy = () => pedirJson<ResumenAgendaHoy>(`${BASE}/hoy`);
export const leerActividades = () => pedirJson<{ actividades: ActividadDTO[] }>(`${BASE}/actividades`);
export const leerCalendario = (desde: FechaKey, hasta: FechaKey) =>
  pedirJson<{ dias: DiaAgenda[] }>(`${BASE}/calendario?desde=${desde}&hasta=${hasta}`);

// ── Actividades ─────────────────────────────────────────────────────────────

/** Lo que viaja: la entrada del schema (el servidor pone los valores por defecto). */
export type CuerpoEditarActividad = z.input<typeof ActividadEditarSchema>;

export const crearActividad = (datos: CuerpoCrearActividad) =>
  pedirJson<ActividadDTO>(`${BASE}/actividades`, { method: "POST", body: json(datos) });
export const editarActividad = (id: string, datos: CuerpoEditarActividad) =>
  pedirJson<ActividadDTO>(`${BASE}/actividades/${encodeURIComponent(id)}`, { method: "PATCH", body: json(datos) });
export const borrarActividad = (id: string) =>
  pedirJson<{ ok: boolean }>(`${BASE}/actividades/${encodeURIComponent(id)}`, { method: "DELETE" });

// ── Marcas del día ──────────────────────────────────────────────────────────

export interface Marca {
  actividadId: string;
  fecha: FechaKey;
  estado: EstadoManual;
  posponerA?: FechaKey | null;
  nota?: string | null;
}

export const marcarOcurrencia = (marca: Marca) =>
  pedirJson<OcurrenciaDTO>(`${BASE}/ocurrencias`, { method: "PUT", body: json(marca) });
export const desmarcarOcurrencia = (actividadId: string, fecha: FechaKey) =>
  pedirJson<{ ok: boolean }>(`${BASE}/ocurrencias?actividadId=${encodeURIComponent(actividadId)}&fecha=${fecha}`, {
    method: "DELETE",
  });

// ── Notas con fecha (`/api/notes` + `fecha`, ADR-501 §6) ─────────────────────

export interface NotaParaGuardar {
  title: string;
  content: string;
  color: string;
  fecha: FechaKey | null;
}

export const crearNota = (nota: NotaParaGuardar) =>
  pedirJson<{ id: string }>("/api/notes", { method: "POST", body: json({ ...nota, pinned: false }) });
export const editarNota = (id: string, nota: NotaParaGuardar) =>
  pedirJson<{ id: string }>(`/api/notes?id=${encodeURIComponent(id)}`, { method: "PATCH", body: json(nota) });
export const borrarNota = (id: string) =>
  pedirJson<{ ok: boolean }>(`/api/notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });

// ── Conectar ────────────────────────────────────────────────────────────────

export const leerFeeds = () => pedirJson<{ feeds: FeedIcsDTO[] }>(`${BASE}/ics`);
export const crearFeed = (nombre: string) =>
  pedirJson<{ feed: FeedIcsDTO; url: string }>(`${BASE}/ics`, { method: "POST", body: json({ nombre }) });
export const revocarFeed = (id: string) =>
  pedirJson<{ ok: boolean }>(`${BASE}/ics/${encodeURIComponent(id)}`, { method: "DELETE" });

export const leerGoogle = () => pedirJson<ConexionGoogleDTO | null>(`${BASE}/google`);
export const sincronizarGoogle = () =>
  pedirJson<{ enviados: number; sinCambios: number; fallidos: number }>(`${BASE}/google/sincronizar`, { method: "POST" });
export const desconectarGoogle = () => pedirJson<{ ok: boolean }>(`${BASE}/google`, { method: "DELETE" });
/** El permiso de Google se pide en su pantalla: es una navegación, no un fetch. */
export const URL_CONECTAR_GOOGLE = `${BASE}/google/conectar`;
