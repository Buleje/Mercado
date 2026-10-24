/**
 * El papel de una cubicación en el Archivo: listar, subir, cambiar y quitar.
 * Usa los endpoints genéricos del Archivo (`/api/admin/documents`), sin
 * servidor propio: el vínculo es carpeta + etiquetas (ADR-502). Sólo
 * navegador (cookie + CSRF del panel).
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { carpetaDeRuta } from "@/lib/grabadora/archivo";
import type { DbDocument } from "@/lib/types/documents";
import { RUTA_CUBICACIONES_TROZAS } from "../hooks/use-cubicaciones-trozas";
import {
  CARPETA_PAPELES, TAG_PAPEL, etiquetasDelPapel, idDeCubicacionEnTags, nombreDelPapel, tagCubicacion, type TipoPapel,
} from "./papel-cubicador";

const BASE = "/api/admin/documents";

function mensajeDeError(status: number): string {
  if (status === 401 || status === 403) return "Tu usuario no puede usar el Archivo. Pídele permiso al dueño.";
  if (status === 404) return "Ese papel ya no está en el Archivo.";
  if (status === 413) return "El archivo pesa demasiado: toma la foto con menos resolución.";
  if (status === 429) return "Muchos pedidos seguidos: espera un minuto.";
  return `El Archivo no respondió (código ${status}). Prueba de nuevo.`;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const json = init?.body && !(init.body instanceof FormData);
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include", headers: csrfHeaders(json ? { "Content-Type": "application/json" } : {}), ...init });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error("Sin conexión: prueba de nuevo.");
  }
  if (!res.ok) throw new Error(mensajeDeError(res.status));
  return (await res.json()) as T;
}

const vivo = (d: DbDocument) => !d.deletedAt && (d.tags ?? []).includes(TAG_PAPEL);

/** Los papeles de UNA cubicación, la hoja 1 primero. */
export async function papelesDe(cubicacionId: string, signal?: AbortSignal): Promise<DbDocument[]> {
  const q = new URLSearchParams({ tags: tagCubicacion(cubicacionId) });
  const { documents } = await pedir<{ documents?: DbDocument[] }>(`${BASE}?${q}`, { signal });
  return (documents ?? [])
    .filter((d) => vivo(d) && idDeCubicacionEnTags(d.tags) === cubicacionId)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

/** Cuántos papeles tiene cada cubicación (UNA llamada para toda la lista de guardadas). */
export async function papelesPorCubicacion(signal?: AbortSignal): Promise<Map<string, number>> {
  const q = new URLSearchParams({ tags: TAG_PAPEL });
  const { documents } = await pedir<{ documents?: DbDocument[] }>(`${BASE}?${q}`, { signal });
  const porId = new Map<string, number>();
  for (const d of documents ?? []) {
    if (!vivo(d)) continue;
    const id = idDeCubicacionEnTags(d.tags);
    if (id) porId.set(id, (porId.get(id) ?? 0) + 1);
  }
  return porId;
}

/** Sube la foto o el PDF a «Cubicador/Papeles» con su nombre y sus etiquetas. */
export async function subirPapel(o: {
  archivo: File;
  tipo: TipoPapel;
  cubicacionId: string;
  codigo: string;
  etiqueta?: string | null;
  hoja: number;
}): Promise<DbDocument> {
  const folderId = await carpetaDeRuta(CARPETA_PAPELES, true);
  const fd = new FormData();
  fd.append("file", o.archivo);
  if (folderId) fd.append("folderId", folderId);
  const { document } = await pedir<{ document: DbDocument }>(BASE, { method: "POST", body: fd });
  const { document: final } = await pedir<{ document: DbDocument }>(`${BASE}/${document.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: nombreDelPapel(o.codigo, o.etiqueta, o.hoja),
      tags: etiquetasDelPapel({ tipo: o.tipo, cubicacionId: o.cubicacionId, codigo: o.codigo, previas: document.tags }),
    }),
  });
  return final;
}

/** Cambia la foto: versión nueva del MISMO documento (la anterior queda en su historial). */
export async function cambiarPapel(docId: string, archivo: File): Promise<void> {
  const fd = new FormData();
  fd.append("file", archivo);
  fd.append("changeNote", "Se cambió la foto de la hoja desde el cubicador");
  await pedir(`${BASE}/${docId}/versions`, { method: "POST", body: fd });
}

/** A la papelera del Archivo (se restaura desde ahí). */
export async function quitarPapel(docId: string): Promise<void> {
  await pedir(`${BASE}/${docId}`, { method: "DELETE" });
}

/** Para ver o la miniatura; cambia con cada versión para no mostrar la vieja del caché. */
export const urlDelPapel = (d: Pick<DbDocument, "id" | "size" | "updatedAt">): string =>
  `${BASE}/${d.id}/raw?v=${encodeURIComponent(`${d.size}-${d.updatedAt}`)}`;

/** Todos los papeles de la cubicación en el Archivo (buscador y vista previa). */
export function urlEnElArchivo(cubicacionId: string, codigo: string): string {
  const q = new URLSearchParams({ tab: "documentos", sub: "all", etiqueta: tagCubicacion(cubicacionId), et: `Papel ${codigo}` });
  return `/admin?${q.toString()}`;
}

/** El «CUB-…» y la fórmula de una cubicación de la cuenta (`null` si no se pudo leer). */
export async function datosDeLaCuenta(id: string, signal?: AbortSignal): Promise<{ codigo: string; formula: string; persona: string | null } | null> {
  try {
    const res = await fetch(`${RUTA_CUBICACIONES_TROZAS}/${encodeURIComponent(id)}`, { credentials: "include", signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { cubicacion?: { codigo?: string; formula?: string; personaNombre?: string | null } };
    const c = j.cubicacion;
    return c?.codigo ? { codigo: c.codigo, formula: c.formula ?? "", persona: c.personaNombre ?? null } : null;
  } catch {
    return null;
  }
}
