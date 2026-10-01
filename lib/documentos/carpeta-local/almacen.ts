"use client";

/**
 * carpeta-local/almacen — lo que hay que recordar entre sesiones, en IndexedDB.
 *
 * Dos cosas:
 *  1. el **handle** de la carpeta elegida (los `FileSystemDirectoryHandle` son
 *     estructurados-clonables: IndexedDB los guarda y al volver a abrir el
 *     panel la carpeta sigue siendo la misma, sin volver a elegirla);
 *  2. el **estado** de cada archivo sincronizado — sin eso no se distingue
 *     "documento nuevo en el panel" de "archivo que borraste en tu PC".
 *
 * `localStorage` no sirve para el handle (sólo guarda texto) y se queda corto
 * para el estado (5 MB para miles de archivos).
 *
 * Todo va por tenant: dos empresas en el mismo navegador no comparten carpeta.
 */

import type { EstadoPrevio } from "./decidir";

const BASE = "buleje-carpeta-local";
const VERSION = 1;
const TIENDA = "vinculos";

export interface VinculoGuardado {
  /** Clave: el tenant. */
  tenantId: string;
  handle: FileSystemDirectoryHandle;
  /** Nombre visible de la carpeta ("Documentos Buleje"). */
  nombre: string;
  /** Carpeta del panel con la que se emparejó (null = todo el drive). */
  folderIdRaiz: string | null;
  vinculadaEl: string;
  /** Estado por ruta lógica. */
  estado: Record<string, EstadoPrevio>;
  /** Última vez que terminó un ciclo completo. */
  ultimaSync: string | null;
  /** Sincronizar solo cuando lo piden a mano. */
  pausado: boolean;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TIENDA)) db.createObjectStore(TIENDA, { keyPath: "tenantId" });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function conTienda<T>(modo: IDBTransactionMode, fn: (t: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((res, rej) => {
      const tx = db.transaction(TIENDA, modo);
      const req = fn(tx.objectStore(TIENDA));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } finally {
    db.close();
  }
}

export async function leerVinculo(tenantId: string): Promise<VinculoGuardado | null> {
  if (typeof indexedDB === "undefined") return null;
  const v = await conTienda<VinculoGuardado | undefined>("readonly", (t) => t.get(tenantId));
  return v ?? null;
}

export async function guardarVinculo(v: VinculoGuardado): Promise<void> {
  await conTienda("readwrite", (t) => t.put(v));
}

export async function olvidarVinculo(tenantId: string): Promise<void> {
  await conTienda("readwrite", (t) => t.delete(tenantId));
}

/**
 * Guarda el estado de los archivos que se acaban de sincronizar.
 *
 * Se lee y se reescribe el vínculo entero en vez de llevar una tienda por
 * archivo: son unos pocos miles de entradas chicas y así el estado nunca queda
 * a mitad de camino si la pestaña se cierra en medio de un ciclo.
 */
export async function guardarEstado(
  tenantId: string,
  cambios: { poner?: Record<string, EstadoPrevio>; sacar?: string[]; ultimaSync?: string },
): Promise<void> {
  const actual = await leerVinculo(tenantId);
  if (!actual) return;
  const estado = { ...actual.estado, ...cambios.poner };
  for (const ruta of cambios.sacar ?? []) delete estado[ruta];
  await guardarVinculo({ ...actual, estado, ultimaSync: cambios.ultimaSync ?? actual.ultimaSync });
}
