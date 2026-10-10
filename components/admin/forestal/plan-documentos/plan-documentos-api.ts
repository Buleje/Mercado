/**
 * El ida y vuelta de «Documentos del plan» (ADR-467) con el servidor.
 *
 * Tres puertas distintas y ninguna nueva de más:
 *   · las rutas del plan (`/api/admin/forestal/plan/documentos`) — la vista
 *     entera, preparar las carpetas en el Drive, crear/editar/adoptar carpetas;
 *   · los campos personalizados (ADR-427) — la plantilla de carpetas y los
 *     casilleros `archivo` de cada una son filas de ahí;
 *   · el Drive (`/api/admin/documents`) — la subida y, DESPUÉS, la etiqueta
 *     `campo:` y el vencimiento en UN PATCH: la subida escribe sus propias
 *     etiquetas (`pdf`, `imagen`…) y pisaría la del casillero.
 *
 * Toda ruta de escritura del plan devuelve la vista entera: la pantalla no
 * arma estado a mano, lo reemplaza.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import type { CampoPersonalizadoGuardado } from "@/lib/campos-personalizados";
import type { DbDocument } from "@/lib/types/documents";
import {
  FORMULARIO_CARPETAS_PLAN,
  TIPO_ARCHIVO,
  TIPO_CARPETA,
  formularioDeCarpeta,
  tagCampo,
  type AdoptarCarpetaInput,
  type CarpetaEditarInput,
  type CarpetaNuevaInput,
  type PlanDocumentosVista,
  type PlantillaCarpetaPatchInput,
  type VincularArchivoInput,
} from "@/lib/forestal/plan-documentos-tipos";

export const RUTA_DOCS_PLAN = "/api/admin/forestal/plan/documentos";
const RUTA_CAMPOS = "/api/admin/campos-personalizados";
const RUTA_DRIVE = "/api/admin/documents";

/** El servidor no tiene esta función (404) o este rol no la ve (403). */
export class DocumentosNoDisponibles extends Error {
  constructor(public readonly status: number) {
    super(status === 403 ? "Tu rol no puede ver los documentos del plan." : "Los documentos del plan todavía no están disponibles.");
  }
}

async function motivo(r: Response, quePedia: string): Promise<string> {
  const j = await leerJson<{ message?: string; error?: string }>(r);
  return j?.message ?? j?.error ?? `No se pudo ${quePedia} (HTTP ${r.status})`;
}

async function pedir<T>(url: string, init: RequestInit | undefined, quePedia: string): Promise<T> {
  const r = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: init?.body ? csrfHeaders({ "Content-Type": "application/json" }) : init?.method && init.method !== "GET" ? csrfHeaders() : undefined,
  });
  if (r.status === 404 || r.status === 403) {
    // 404 de la RUTA (despliegue sin la función) vs 404 de un registro: el
    // servidor manda `error` en el segundo; sin cuerpo es que no existe.
    const j = await leerJson<{ error?: string; message?: string }>(r.clone());
    if (r.status === 403 || !j?.error) throw new DocumentosNoDisponibles(r.status);
    throw new Error(j.message ?? j.error);
  }
  if (!r.ok) throw new Error(await motivo(r, quePedia));
  return ((await leerJson<T>(r)) ?? ({} as T));
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

// ── La vista del plan ───────────────────────────────────────────────────────

export async function leerVista(planId: string): Promise<PlanDocumentosVista> {
  const j = await pedir<{ vista?: PlanDocumentosVista }>(`${RUTA_DOCS_PLAN}?planId=${encodeURIComponent(planId)}`, undefined, "leer los documentos del plan");
  if (!j.vista) throw new Error("El servidor no devolvió los documentos del plan.");
  return j.vista;
}

async function escribir(sub: string, method: string, body: unknown, quePedia: string): Promise<PlanDocumentosVista> {
  const j = await pedir<{ vista?: PlanDocumentosVista }>(`${RUTA_DOCS_PLAN}${sub}`, json(method, body), quePedia);
  if (!j.vista) throw new Error(`No se pudo ${quePedia}: el servidor no devolvió la vista.`);
  return j.vista;
}

/** Crea la raíz del plan y sus carpetas en el Drive (idempotente). */
export const prepararCarpetas = (planId: string) => escribir("/preparar", "POST", { planId }, "preparar las carpetas");
export const crearCarpeta = (input: CarpetaNuevaInput) => escribir("/carpetas", "POST", input, "crear la carpeta");
export const editarCarpeta = (input: CarpetaEditarInput) => escribir("/carpetas", "PATCH", input, "cambiar la carpeta");
export const adoptarCarpeta = (input: AdoptarCarpetaInput) => escribir("/carpetas/adoptar", "POST", input, "sumar la carpeta a la lista");
export const editarPlantilla = (planId: string, input: PlantillaCarpetaPatchInput) =>
  escribir(`/plantilla?planId=${encodeURIComponent(planId)}`, "PATCH", input, "cambiar la plantilla");
export const vincularArchivo = (input: VincularArchivoInput) => escribir("/vincular", "POST", input, "mover el archivo");

// ── La plantilla, para un alta (todavía no hay plan al que pedirle la vista) ─

/** Una carpeta de la plantilla con sus casilleros `archivo`, como la pinta un alta. */
export interface PlantillaCarpeta {
  clave: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  plantillaId: string | null;
  /** Los casilleros `archivo` de la carpeta, en orden. */
  archivos: { id: string | null; clave: string; nombre: string; descripcion: string | null }[];
}

/** Las filas vivas y permanentes de un formulario (con su tipo real: `carpeta`/`archivo` incluidos). */
async function permanentesDe(formulario: string): Promise<CampoPersonalizadoGuardado[]> {
  const j = await pedir<{ campos?: CampoPersonalizadoGuardado[] }>(
    `${RUTA_CAMPOS}?formulario=${encodeURIComponent(formulario)}`,
    undefined,
    "leer la plantilla de carpetas",
  );
  return (j.campos ?? []).filter((c) => c.activo && c.soloParaRegistroId == null);
}

const porOrden = (a: { orden: number; nombre: string }, b: { orden: number; nombre: string }) =>
  a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es");

/**
 * La plantilla del negocio, para un alta (todavía no hay plan al que pedirle la
 * vista): las filas `carpeta` del formulario de la plantilla y, de cada una,
 * sus casilleros `archivo`. La lectura de campos personalizados los devuelve
 * con su tipo real SÓLO en los formularios de «Documentos del plan». Vacía =
 * el negocio nunca preparó un plan (se muestra la semilla).
 */
export async function leerPlantilla(): Promise<PlantillaCarpeta[]> {
  const carpetas = (await permanentesDe(FORMULARIO_CARPETAS_PLAN)).filter((c) => c.tipo === TIPO_CARPETA).sort(porOrden);
  const casilleros = await Promise.all(carpetas.map((c) => permanentesDe(formularioDeCarpeta(c.clave))));
  return carpetas.map((c, i) => ({
    clave: c.clave,
    nombre: c.nombre,
    descripcion: c.descripcion,
    orden: c.orden,
    plantillaId: c.id,
    archivos: casilleros[i]
      .filter((x) => x.tipo === TIPO_ARCHIVO)
      .sort(porOrden)
      .map((x) => ({ id: x.id, clave: x.clave, nombre: x.nombre, descripcion: x.descripcion })),
  }));
}

/** Un casillero `archivo` nuevo en una carpeta (ADR-467: sólo bajo el prefijo). */
export async function crearCasilleroArchivo(input: {
  carpetaClave: string;
  nombre: string;
  descripcion: string;
  /** `null` = en todos los planes; con id = sólo en ese. */
  soloParaRegistroId: string | null;
}): Promise<CampoPersonalizadoGuardado> {
  const r = await fetch(RUTA_CAMPOS, {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      formulario: formularioDeCarpeta(input.carpetaClave),
      nombre: input.nombre.trim(),
      descripcion: input.descripcion.trim() || null,
      tipo: TIPO_ARCHIVO,
      opciones: [],
      soloParaRegistroId: input.soloParaRegistroId,
    }),
  });
  const j = (await leerJson<{ campo?: CampoPersonalizadoGuardado; message?: string; error?: string }>(r)) ?? {};
  if (r.status === 409) throw new Error(`Ya hay un documento «${input.nombre.trim()}» en esta carpeta.`);
  if (!r.ok || !j.campo) throw new Error(j.message ?? j.error ?? `No se pudo crear el documento esperado (HTTP ${r.status})`);
  return j.campo;
}

// ── El Drive ────────────────────────────────────────────────────────────────

/** `2026-10-12` → medianoche UTC, como lo guarda el visor del Drive. */
export const vencimientoIso = (fecha: string | null): string | null => (fecha ? `${fecha.slice(0, 10)}T00:00:00.000Z` : null);

/**
 * Después de subir: la etiqueta del casillero y el vencimiento en UN PATCH.
 * Las etiquetas se SUMAN a las que puso la subida (el PATCH del Drive las
 * reemplaza enteras, y las de la subida sirven para buscar).
 */
export async function etiquetarDocumento(
  doc: Pick<DbDocument, "id" | "tags">,
  cambios: { campoId: string | null; expiresAt?: string | null },
): Promise<DbDocument | null> {
  const body: Record<string, unknown> = {};
  if (cambios.campoId) body.tags = [...new Set([...(doc.tags ?? []), tagCampo(cambios.campoId)])].slice(0, 20);
  if (cambios.expiresAt !== undefined) body.expiresAt = vencimientoIso(cambios.expiresAt);
  if (Object.keys(body).length === 0) return null;
  const r = await fetch(`${RUTA_DRIVE}/${encodeURIComponent(doc.id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await motivo(r, "guardar la etiqueta y el vencimiento"));
  return (await leerJson<{ document?: DbDocument }>(r))?.document ?? null;
}

/** Cambia sólo el vencimiento de un archivo ya subido. */
export async function cambiarVencimiento(documentId: string, fecha: string | null): Promise<void> {
  const r = await fetch(`${RUTA_DRIVE}/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresAt: vencimientoIso(fecha) }),
  });
  if (!r.ok) throw new Error(await motivo(r, "guardar el vencimiento"));
}

/** A la papelera del Drive (se recupera desde Documentos › Papelera). */
export async function mandarAPapelera(documentId: string): Promise<void> {
  const r = await fetch(`${RUTA_DRIVE}/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    credentials: "include",
    headers: csrfHeaders(),
  });
  if (!r.ok) throw new Error(await motivo(r, "mandar el archivo a la papelera"));
}

/** Dónde se abre esta carpeta en el Drive. */
export const enlaceAlDrive = (folderId: string | null): string =>
  folderId ? `/admin?tab=documentos&sub=folder&carpeta=${encodeURIComponent(folderId)}` : "/admin?tab=documentos";
