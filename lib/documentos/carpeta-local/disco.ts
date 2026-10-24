"use client";

/**
 * carpeta-local/disco — leer y escribir la carpeta del escritorio desde el navegador.
 *
 * Usa la File System Access API: el usuario elige una carpeta con el selector
 * del sistema y el navegador nos da un permiso REAL sobre ella (y sólo sobre
 * ella). No hay que instalar nada, y el permiso sobrevive al cierre de la
 * pestaña porque el handle se guarda en IndexedDB.
 *
 * Sólo existe en Chromium (Chrome, Edge, Brave, Opera). En Firefox y Safari la
 * API no está: `soportado()` lo dice y la pantalla ofrece el agente de Windows.
 */

import { rutaSegura } from "./rutas";

/** ¿Este navegador puede abrir una carpeta del disco? */
export function soportado(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

type Permiso = "granted" | "denied" | "prompt";

interface HandleConPermisos extends FileSystemDirectoryHandle {
  queryPermission?: (d: { mode: "read" | "readwrite" }) => Promise<Permiso>;
  requestPermission?: (d: { mode: "read" | "readwrite" }) => Promise<Permiso>;
}

/** Abre el selector de carpetas del sistema. `null` si la persona lo cancela. */
export async function elegirCarpeta(): Promise<FileSystemDirectoryHandle | null> {
  if (!soportado()) throw new Error("navegador_sin_soporte");
  try {
    const picker = (window as unknown as {
      showDirectoryPicker: (o: { mode: "readwrite"; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    // `startIn: "desktop"` abre directo en el Escritorio, que es donde la gente
    // tiene la carpeta que quiere vincular.
    return await picker({ mode: "readwrite", startIn: "desktop" });
  } catch (err) {
    // Cancelar el selector tira AbortError: no es un error que haya que mostrar.
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

/**
 * ¿Seguimos teniendo permiso de escritura sobre la carpeta guardada?
 *
 * Al volver a abrir el panel el handle sigue en IndexedDB pero el permiso está
 * en "prompt": hay que pedirlo de nuevo, y el navegador exige que sea a partir
 * de un gesto del usuario (un click). Por eso `pedir` es explícito.
 */
export async function permisoDeEscritura(
  handle: FileSystemDirectoryHandle,
  opciones: { pedir?: boolean } = {},
): Promise<Permiso> {
  const h = handle as HandleConPermisos;
  const actual = (await h.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  if (actual === "granted" || !opciones.pedir) return actual;
  return (await h.requestPermission?.({ mode: "readwrite" })) ?? "denied";
}

export interface EntradaEscaneada {
  size: number;
  modificado: number;
  handle: FileSystemFileHandle;
}

/** Carpetas de sistema que no tiene sentido sincronizar. */
const IGNORAR = new Set([".git", "node_modules", ".DS_Store", "Thumbs.db", "desktop.ini", ".buleje-sync"]);

/**
 * Recorre la carpeta entera y devuelve cada archivo con su ruta relativa.
 *
 * El tope de `maxArchivos` no es capricho: sin él, vincular por error una
 * carpeta con 200.000 archivos cuelga la pestaña antes de que nadie pueda
 * cancelar. Se avisa en pantalla cuando se corta.
 */
export async function escanear(
  dir: FileSystemDirectoryHandle,
  opciones: { maxArchivos?: number; señal?: AbortSignal } = {},
): Promise<{ archivos: Map<string, EntradaEscaneada>; cortado: boolean }> {
  const max = opciones.maxArchivos ?? 5000;
  const archivos = new Map<string, EntradaEscaneada>();
  let cortado = false;

  const recorrer = async (actual: FileSystemDirectoryHandle, prefijo: string): Promise<void> => {
    if (cortado || opciones.señal?.aborted) return;
    // `entries()` es un async iterator del handle; no está en los tipos viejos.
    const entradas = (actual as unknown as {
      entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    }).entries();

    for await (const [nombre, handle] of entradas) {
      if (cortado || opciones.señal?.aborted) return;
      if (nombre.startsWith("~$") || IGNORAR.has(nombre)) continue; // temporales de Office
      const ruta = prefijo ? `${prefijo}/${nombre}` : nombre;

      if (handle.kind === "directory") {
        await recorrer(handle as FileSystemDirectoryHandle, ruta);
        continue;
      }
      if (archivos.size >= max) { cortado = true; return; }
      const file = await (handle as FileSystemFileHandle).getFile();
      archivos.set(ruta, { size: file.size, modificado: file.lastModified, handle: handle as FileSystemFileHandle });
    }
  };

  await recorrer(dir, "");
  return { archivos, cortado };
}

/** Baja por el árbol creando las carpetas que falten. */
async function carpetaDe(
  raiz: FileSystemDirectoryHandle,
  partes: string[],
  crear: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  let actual = raiz;
  for (const parte of partes) {
    try {
      actual = await actual.getDirectoryHandle(parte, { create: crear });
    } catch {
      return null;
    }
  }
  return actual;
}

/** Escribe (o reemplaza) un archivo en la carpeta, creando el camino. */
export async function escribirArchivo(
  raiz: FileSystemDirectoryHandle,
  ruta: string,
  contenido: Blob,
): Promise<void> {
  const partes = rutaSegura(ruta).split("/");
  const nombre = partes.pop()!;
  const dir = await carpetaDe(raiz, partes, true);
  if (!dir) throw new Error(`no se pudo crear la carpeta de ${ruta}`);
  const archivo = await dir.getFileHandle(nombre, { create: true });
  const escritor = await archivo.createWritable();
  try {
    await escritor.write(contenido);
  } finally {
    await escritor.close();
  }
}

/** Lee un archivo de la carpeta. `null` si ya no está. */
export async function leerArchivo(raiz: FileSystemDirectoryHandle, ruta: string): Promise<File | null> {
  const partes = rutaSegura(ruta).split("/");
  const nombre = partes.pop()!;
  const dir = await carpetaDe(raiz, partes, false);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(nombre);
    return await handle.getFile();
  } catch {
    return null;
  }
}

/**
 * Borra un archivo del disco.
 *
 * No hay forma de mandarlo a la papelera de Windows desde el navegador: la API
 * sólo sabe borrar. Por eso el panel avisa antes de la primera sincronización
 * que un documento borrado en el drive desaparece del disco.
 */
export async function borrarArchivo(raiz: FileSystemDirectoryHandle, ruta: string): Promise<boolean> {
  const partes = rutaSegura(ruta).split("/");
  const nombre = partes.pop()!;
  const dir = await carpetaDe(raiz, partes, false);
  if (!dir) return false;
  try {
    await dir.removeEntry(nombre);
    return true;
  } catch {
    return false;
  }
}
