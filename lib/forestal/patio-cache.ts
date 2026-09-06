"use client";

/**
 * Lo último que el patio alcanzó a ver, para poder consultarlo sin señal.
 *
 * ── Por qué una base APARTE de la cola ───────────────────────────────────────
 * `patio-cola` guarda lo que el operario ANOTÓ: es irreemplazable, si se pierde
 * hay que volver a la pila a contar. Esto guarda copias de lo que el servidor ya
 * tiene: es descartable por definición. Compartir la base obligaría a subirle la
 * versión a la que custodia lo irreemplazable cada vez que este caché cambie de
 * forma, y un `onupgradeneeded` mal hecho se lleva puestas las anotaciones.
 *
 * ── Lo que este caché NO hace ────────────────────────────────────────────────
 * No decide nada. Una troza cacheada puede haberse consumido hace dos horas en
 * otra tablet, así que la vista TIENE que decir de cuándo es el dato — un patio
 * que muestra una pieza como libre sin aclarar que la información es de ayer es
 * peor que uno que no muestra nada.
 */

const DB_NAME = "buleje-patio-cache";
const DB_VERSION = 1;
const STORE = "vistas";

export type ClaveCache = "trozas" | "guias" | "corridas";

export interface EntradaCache<T> {
  clave: ClaveCache;
  datos: T[];
  guardadoEn: string;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clave" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Guarda en segundo plano: que falle el caché nunca puede romper la pantalla. */
export async function guardar<T>(clave: ClaveCache, datos: T[]): Promise<void> {
  try {
    const db = await abrir();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ clave, datos, guardadoEn: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Modo privado, cuota llena, IndexedDB deshabilitado: se sigue sin caché.
  }
}

export async function leer<T>(clave: ClaveCache): Promise<EntradaCache<T> | null> {
  try {
    const db = await abrir();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(clave);
      req.onsuccess = () => resolve((req.result as EntradaCache<T>) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/**
 * Hace cuánto se guardó, en criollo.
 *
 * Sube a "hace X h" recién pasada la hora: en el patio, quince minutos no
 * cambian nada y "hace 47 minutos" es precisión que nadie usa. Lo que importa es
 * distinguir "recién" de "esto es de ayer".
 */
export function antiguedad(guardadoEn: string, ahora: Date): string {
  const t = new Date(guardadoEn).getTime();
  if (!Number.isFinite(t)) return "de fecha desconocida";
  const min = Math.floor((ahora.getTime() - t) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "de ayer" : `de hace ${d} días`;
}

/** Un dato de más de esto ya no se puede mirar sin desconfiar. */
export const VIEJO_MINUTOS = 120;

export function esViejo(guardadoEn: string, ahora: Date): boolean {
  const t = new Date(guardadoEn).getTime();
  if (!Number.isFinite(t)) return true;
  return ahora.getTime() - t > VIEJO_MINUTOS * 60_000;
}

/**
 * Buscar una troza en lo cacheado, con la MISMA semántica que el servidor:
 * por codificación o por código de planta, sin distinguir mayúsculas.
 *
 * Si acá se buscara distinto, el patio encontraría con señal lo que no encuentra
 * sin ella, y el operario concluiría —con razón— que la pantalla no es confiable.
 */
export function buscarLocal<T extends { codificacion?: string | null; codigoPlanta?: string | null }>(
  trozas: ReadonlyArray<T>,
  q: string,
  limite = 20,
): T[] {
  const texto = q.trim().toLowerCase();
  if (!texto) return [];
  return trozas
    .filter((t) =>
      [t.codificacion, t.codigoPlanta].some((v) => (v ?? "").toLowerCase().includes(texto)),
    )
    .slice(0, limite);
}
