/**
 * Las grabaciones viven en el Archivo (Documentos) del negocio: una carpeta
 * (por defecto «Cubicador › Grabaciones») + la etiqueta `grabacion`, el mismo
 * cableado tag+carpeta de ADR-502. Así se escuchan desde cualquier equipo y se
 * comparten con el enlace público del Archivo.
 *
 * Sólo navegador (usa `fetch` con la cookie y el CSRF del panel). Un audio no
 * pasa por el OCR ni por la IA del indexador: `isAnalyzableMime` lo deja fuera.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { DbDocument, DbDocumentFolder, DbDocumentShare } from "@/lib/types/documents";
import { extensionDeMime, limpiarNombre, mimeBase } from "./formato";
import { DIAS_ENLACE, elegirEnlaceVigente } from "./whatsapp";

const BASE = "/api/admin/documents";
export const TAG_GRABACION = "grabacion";
export const TAG_CUBICADOR = "cubicador";
export const CARPETA_POR_DEFECTO = "Cubicador/Grabaciones";

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const json = init?.body && !(init.body instanceof FormData);
  const res = await fetch(url, {
    credentials: "include",
    headers: csrfHeaders(json ? { "Content-Type": "application/json" } : {}),
    ...init,
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(mensajeDeError(res.status, texto));
  }
  return (await res.json()) as T;
}

function mensajeDeError(status: number, cuerpo: string): string {
  if (status === 401 || status === 403) return "Tu sesión no puede usar el Archivo. Vuelve a entrar.";
  if (status === 404) return "Esa grabación ya no está en el Archivo.";
  if (status === 413) return "La grabación pesa más de 50 MB: grábala en partes.";
  if (status === 429) return "Muchos pedidos seguidos: espera un minuto.";
  return `El Archivo no respondió (HTTP ${status}${cuerpo ? `: ${cuerpo.slice(0, 80)}` : ""}).`;
}

/** «Cubicador/Grabaciones» → ["Cubicador", "Grabaciones"]. */
export function partesDeRuta(ruta: string): string[] {
  return ruta.split("/").map((p) => p.trim()).filter(Boolean);
}

/** La carpeta de cada nivel por nombre (sin mayúsculas ni tildes que dividan). */
function igual(a: string, b: string): boolean {
  return a.localeCompare(b, "es", { sensitivity: "base" }) === 0;
}

/**
 * El id de la carpeta de la ruta. Con `crear`, arma los niveles que falten;
 * sin él (al abrir la pantalla) devuelve `null` si todavía no existe: mirar la
 * lista no debe dejar carpetas vacías en el Archivo.
 */
export async function carpetaDeRuta(ruta: string, crear: boolean, signal?: AbortSignal): Promise<string | null> {
  const partes = partesDeRuta(ruta);
  if (partes.length === 0) return null;
  const { folders } = await pedir<{ folders: DbDocumentFolder[] }>(`${BASE}/folders`, { signal });
  let padre: string | null = null;
  for (const nombre of partes) {
    const hallada: DbDocumentFolder | undefined = folders.find((f) => f.parentId === padre && igual(f.name, nombre));
    if (hallada) {
      padre = hallada.id;
      continue;
    }
    if (!crear) return null;
    const respuesta: { folder: DbDocumentFolder } = await pedir<{ folder: DbDocumentFolder }>(`${BASE}/folders`, {
      method: "POST",
      body: JSON.stringify({ name: nombre, parentId: padre }),
      signal,
    });
    const folder: DbDocumentFolder = respuesta.folder;
    folders.push(folder);
    padre = folder.id;
  }
  return padre;
}

export async function listarGrabaciones(folderId: string, signal?: AbortSignal): Promise<DbDocument[]> {
  const q = new URLSearchParams({ folderId, tags: TAG_GRABACION });
  const { documents } = await pedir<{ documents: DbDocument[] }>(`${BASE}?${q}`, { signal });
  return documents
    .filter((d) => d.mimeType.startsWith("audio/") && !d.deletedAt)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** La nota escrita a mano (la descripción del Archivo). */
export function notaDe(doc: DbDocument): string {
  const v = doc.ocrMetadata?.descripcionUsuario;
  return typeof v === "string" ? v : "";
}

/** URL para el `<audio>` del panel; cambia con cada versión para no tocar la vieja del caché. */
export function urlAudio(doc: Pick<DbDocument, "id" | "size" | "updatedAt">): string {
  return `${BASE}/${doc.id}/raw?v=${encodeURIComponent(`${doc.size}-${doc.updatedAt}`)}`;
}

export function archivoDeGrabacion(blob: Blob, nombre: string): File {
  const mime = mimeBase(blob.type);
  return new File([blob], `${limpiarNombre(nombre) || "Grabación"}.${extensionDeMime(mime)}`, { type: mime });
}

export async function guardarGrabacion(o: {
  blob: Blob;
  nombre: string;
  folderId: string;
  nota?: string;
}): Promise<DbDocument> {
  const fd = new FormData();
  fd.append("file", archivoDeGrabacion(o.blob, o.nombre));
  fd.append("folderId", o.folderId);
  const { document } = await pedir<{ document: DbDocument }>(BASE, { method: "POST", body: fd });
  const tags = Array.from(new Set([...(document.tags ?? []), TAG_GRABACION, TAG_CUBICADOR])).slice(0, 20);
  return editarGrabacion(document.id, {
    name: limpiarNombre(o.nombre) || document.name,
    tags,
    ...(o.nota?.trim() ? { descripcion: o.nota.trim() } : {}),
  });
}

export async function editarGrabacion(
  id: string,
  cambios: { name?: string; descripcion?: string; tags?: string[] },
): Promise<DbDocument> {
  const { document } = await pedir<{ document: DbDocument }>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(cambios),
  });
  return document;
}

/** A la papelera del Archivo (se puede restaurar desde ahí). */
export async function borrarGrabacion(id: string): Promise<void> {
  await pedir(`${BASE}/${id}`, { method: "DELETE" });
}

/** Sube el audio recortado como versión nueva: la anterior queda en el historial del Archivo. */
export async function reemplazarAudio(id: string, archivo: File, nota: string): Promise<void> {
  const fd = new FormData();
  fd.append("file", archivo);
  fd.append("changeNote", nota);
  await pedir(`${BASE}/${id}/versions`, { method: "POST", body: fd });
}

/** El enlace público (`/d/<token>`): reusa uno vivo o crea uno que vence en 7 días. */
export async function enlacePublico(id: string): Promise<string> {
  const { shares } = await pedir<{ shares: DbDocumentShare[] }>(`${BASE}/${id}/share`);
  let token = elegirEnlaceVigente(shares, new Date());
  if (!token) {
    const { share } = await pedir<{ share: DbDocumentShare }>(`${BASE}/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ expiresInDays: DIAS_ENLACE }),
    });
    token = share.token;
  }
  return `${window.location.origin}/d/${token}`;
}

/** El audio como `File`, para compartirlo adjunto desde el celular. */
export async function bajarArchivo(doc: DbDocument): Promise<File> {
  const res = await fetch(urlAudio(doc), { credentials: "include" });
  if (!res.ok) throw new Error(mensajeDeError(res.status, ""));
  const blob = await res.blob();
  const mime = mimeBase(blob.type || doc.mimeType);
  return new File([blob], `${limpiarNombre(doc.name) || "Grabación"}.${extensionDeMime(mime)}`, { type: mime });
}

/** El audio decodificado (para recortar): canales, tasa y duración en segundos. */
export async function decodificarAudio(
  doc: DbDocument,
  signal?: AbortSignal,
): Promise<{ canales: Float32Array[]; tasa: number; segundos: number }> {
  const res = await fetch(urlAudio(doc), { credentials: "include", signal });
  if (!res.ok) throw new Error(mensajeDeError(res.status, ""));
  const datos = await res.arrayBuffer();
  const ac = new AudioContext();
  try {
    const buf = await ac.decodeAudioData(datos);
    const canales = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    return { canales, tasa: buf.sampleRate, segundos: buf.duration };
  } finally {
    ac.close().catch((err: unknown) => logger.warn("[grabadora] cerrar decodificador", { err: String(err) }));
  }
}
