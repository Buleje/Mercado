/**
 * tramites-api — las llamadas de Trámites (ADR-524 §3.1). Nunca lanzan: cada
 * una devuelve `{ ok, data }` o `{ ok:false, error }` con la frase lista para
 * mostrar (`pedirAdm`).
 */
import type { CanalTramite, Dia, EntidadTramite, EstadoTramite, RequisitosOps, TramiteDto } from "@/lib/admin/fichas-tramites-alquileres";
import { pedirAdm, query } from "../comun/pedir-administracion";

const BASE = "/api/admin/tramites";

export interface FiltroTramites {
  estado?: EstadoTramite;
  entidad?: EntidadTramite;
  parteId?: string;
  alquilerId?: string;
  q?: string;
  /** Sólo los que vencen (o tienen próximo paso) dentro de estos días. */
  vencen?: number;
}

/** Lo que se escribe en la ventana: el DTO sin lo que pone el servidor. */
export interface DatosTramite {
  entidad: EntidadTramite;
  entidadNombre: string | null;
  asunto: string;
  parteId: string | null;
  personaNombre: string | null;
  alquilerId: string | null;
  estado: EstadoTramite;
  iniciadoEl: Dia | null;
  enviadoEl: Dia | null;
  venceEl: Dia | null;
  proximoPaso: string | null;
  proximoPasoEl: Dia | null;
  canal: CanalTramite | null;
  contacto: string | null;
  notas: string | null;
}

export type CuerpoCrearTramite = DatosTramite & { plantilla?: string };

export const leerTramites = (f: FiltroTramites = {}) =>
  pedirAdm<{ tramites: TramiteDto[] }>(`${BASE}${query({ ...f })}`);

export const leerTramite = (id: string) => pedirAdm<{ tramite: TramiteDto }>(`${BASE}/${encodeURIComponent(id)}`);

export const crearTramite = (cuerpo: CuerpoCrearTramite) => pedirAdm<{ tramite: TramiteDto }>(BASE, "POST", cuerpo);

/** Parcial: lo que no viaja no se toca; `null` borra. */
export const editarTramite = (id: string, cambios: Partial<DatosTramite>) =>
  pedirAdm<{ tramite: TramiteDto }>(`${BASE}/${encodeURIComponent(id)}`, "PATCH", cambios);

export const cambiarRequisitos = (id: string, ops: RequisitosOps) =>
  pedirAdm<{ tramite: TramiteDto }>(`${BASE}/${encodeURIComponent(id)}/requisitos`, "PATCH", ops);

export const borrarTramite = (id: string) => pedirAdm<{ ok: true }>(`${BASE}/${encodeURIComponent(id)}`, "DELETE");

/** La carpeta del Archivo donde van los papeles de un trámite: «Trámites/Agrobanco 2026-10». */
export function carpetaDelTramite(t: Pick<TramiteDto, "entidadNombre" | "entidad" | "asunto" | "iniciadoEl" | "createdAt">): string {
  const quien = (t.entidadNombre?.trim() || t.asunto.trim() || t.entidad).replace(/[/\\]/g, "-").slice(0, 60);
  const mes = (t.iniciadoEl ?? t.createdAt).slice(0, 7);
  return `Trámites/${quien} ${mes}`;
}
