"use client";

/**
 * Lo último que se vio en el Archivo, para pintarlo AL INSTANTE al volver
 * (22-10, Brandon: «abrir el Archivo al instante»). Medido: la segunda apertura
 * tardaba 1,9 s en mostrar la primera tarjeta y repetía los 8 pedidos.
 *
 * Privacidad (Ley 29733, PCs compartidas en caja): los nombres de los papeles
 * NUNCA van a `localStorage`. Viven en memoria del módulo (mientras la pestaña
 * del panel está abierta) y la última vista en `sessionStorage` (se borra al
 * cerrar la pestaña) para sobrevivir a un F5. Todo va con la clave de quién
 * mira (tienda + usuario + rol): otra sesión no lee lo de la anterior, y entrar,
 * salir o suplantar lo borra todo.
 *
 * Toda escritura a `/api/admin/documents…` (subir, borrar, mover, etiquetar,
 * venga de donde venga) borra lo guardado: la vista montada se vuelve a guardar
 * con lo que tiene en pantalla al desmontar, y al volver se refresca igual.
 */

import { cachedJsonVigente, oirEscrituras } from "@/lib/client-cache-fetch";
import { TAGS_FOTOS_DE_MAQUINA } from "@/lib/documents/fotos-de-maquina";
import type { DbDocument, DbDocumentFolder, DocumentListFilters } from "@/lib/types/documents";

const BASE = "/api/admin/documents";
/** Más vieja que esto, se pide como la primera vez (con su cargando). */
const MAX_EDAD_MS = 30 * 60_000;
/** Pasar el puntero por el menú no vuelve a pedir lo que se leyó hace menos de esto. */
const PRECARGA_FRESCA_MS = 30_000;
const MAX_VISTAS = 12;
const MAX_BYTES_SESION = 500_000;
const CLAVE_SESION = "archivo:v1:ultima";

export type RespuestaLista = { documents: DbDocument[]; semanticTerms?: string[] };
export type Guardada<T> = { at: number; data: T };

/* ── Quién mira ─────────────────────────────────────────────────────────── */

type Yo = { tenantId?: string | null; username?: string | null; role?: string | null; authenticated?: boolean };

/**
 * Tienda + usuario + rol de la sesión, del `/api/auth/me` que el panel ya pidió
 * (sin pedir nada). `null` si todavía no se sabe: sin quién, no se guarda ni se lee.
 */
export function identidadActual(): string | null {
  const yo = cachedJsonVigente<Yo | null>("/api/auth/me", Number.POSITIVE_INFINITY);
  if (!yo?.authenticated || !yo.tenantId || !yo.username) return null;
  return `${yo.tenantId}|${yo.username}|${yo.role ?? ""}`;
}

/* ── Consulta ───────────────────────────────────────────────────────────── */

/** La consulta del listado, ÚNICA fuente para el hook y la precarga. */
export function qsDeFiltros(f: DocumentListFilters): string {
  const qs = new URLSearchParams();
  if (f.folderId === null) qs.set("folderId", "null");
  else if (f.folderId) qs.set("folderId", f.folderId);
  if (f.category) qs.set("category", f.category);
  if (f.q) qs.set("q", f.q);
  if (f.tags?.length) qs.set("tags", f.tags.join(","));
  if (f.sinTags?.length) qs.set("excluir", f.sinTags.join(","));
  if (f.favorite !== undefined) qs.set("favorite", f.favorite ? "1" : "0");
  if (f.customerId) qs.set("customerId", f.customerId);
  if (f.supplierId) qs.set("supplierId", f.supplierId);
  if (f.orderId) qs.set("orderId", f.orderId);
  // ADR-119 — vista "Por vencer" + búsqueda semántica
  if (f.expiring) qs.set("expiring", String(f.expiring));
  if (f.semantic && f.q) qs.set("semantic", "1");
  if (f.deletedOnly) qs.set("deleted", "1");
  // ADR-516 — vista «Código por poner»: papeles con código sin anotar en el físico.
  if (f.codigoPendiente) qs.set("codigoPendiente", "1");
  return qs.toString();
}

/** Una búsqueda escrita no se guarda: cada letra sería una vista distinta y la IA no se repite. */
export function seGuarda(f: DocumentListFilters): boolean {
  return !f.q;
}

/** La vista «Todos» del Archivo (lo que abre por defecto). */
export const QS_TODOS = qsDeFiltros({ sinTags: [...TAGS_FOTOS_DE_MAQUINA] });

/* ── Memoria ────────────────────────────────────────────────────────────── */

const listas = new Map<string, Guardada<DbDocument[]>>();
const carpetas = new Map<string, Guardada<DbDocumentFolder[]>>();
const taxonomias = new Map<string, Guardada<string[]>>();
const cuentasEnlaces = new Map<string, Guardada<number>>();
const enVuelo = new Map<string, Promise<RespuestaLista>>();
const carpetasEnVuelo = new Map<string, Promise<{ folders: DbDocumentFolder[] }>>();

function vigente<T>(g: Guardada<T> | undefined, maxMs = MAX_EDAD_MS): Guardada<T> | null {
  return g && Date.now() - g.at < maxMs ? g : null;
}

function claveLista(quien: string, qs: string): string {
  return `${quien}\u0000${qs}`;
}

/* ── sessionStorage (sólo la última vista, para el F5) ──────────────────── */

type EnSesion = { quien: string; qs: string; at: number; documents: DbDocument[]; folders: DbDocumentFolder[] | null };

function sesion(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // modo privado estricto o almacenamiento bloqueado: queda sólo la memoria
  }
}

function leerSesion(quien: string): EnSesion | null {
  const s = sesion();
  const crudo = s?.getItem(CLAVE_SESION);
  if (!s || !crudo) return null;
  try {
    const v = JSON.parse(crudo) as Partial<EnSesion>;
    if (v.quien !== quien || typeof v.qs !== "string" || typeof v.at !== "number" || !Array.isArray(v.documents)) {
      // De otra sesión o roto: no se muestra y no se deja ahí.
      s.removeItem(CLAVE_SESION);
      return null;
    }
    return { quien, qs: v.qs, at: v.at, documents: v.documents, folders: Array.isArray(v.folders) ? v.folders : null };
  } catch (err) {
    console.warn("[archivo] la última vista guardada no se pudo leer", err);
    s.removeItem(CLAVE_SESION);
    return null;
  }
}

let timerSesion: ReturnType<typeof setTimeout> | null = null;
let pendienteSesion: EnSesion | null = null;

function escribirSesionYa(): void {
  if (timerSesion) clearTimeout(timerSesion);
  timerSesion = null;
  const v = pendienteSesion;
  pendienteSesion = null;
  const s = sesion();
  if (!v || !s) return;
  try {
    const json = JSON.stringify(v);
    if (json.length > MAX_BYTES_SESION) s.removeItem(CLAVE_SESION);
    else s.setItem(CLAVE_SESION, json);
  } catch (err) {
    // Lleno: se queda sólo la memoria, que es lo que importa al cambiar de pestaña.
    console.warn("[archivo] no entró la última vista en sessionStorage", err);
    s.removeItem(CLAVE_SESION);
  }
}

/** Escribe la última vista un rato después: el espejo de cada cambio no serializa 400 papeles por clic. */
function programarSesion(v: EnSesion): void {
  pendienteSesion = v;
  if (!timerSesion) timerSesion = setTimeout(escribirSesionYa, 400);
}

function borrarSesion(): void {
  if (timerSesion) clearTimeout(timerSesion);
  timerSesion = null;
  pendienteSesion = null;
  sesion()?.removeItem(CLAVE_SESION);
}

/* ── Lectura y guardado ─────────────────────────────────────────────────── */

/**
 * La lista de esa consulta tal como se vio la última vez (`null` si no hay o ya
 * es vieja). `at` = cuándo la confirmó el servidor (los cambios optimistas de
 * encima no la rejuvenecen).
 */
export function listaGuardada(qs: string): Guardada<DbDocument[]> | null {
  const quien = identidadActual();
  if (!quien) return null;
  const hit = vigente(listas.get(claveLista(quien, qs)));
  if (hit) return hit;
  const s = leerSesion(quien);
  if (s && s.qs === qs && Date.now() - s.at < MAX_EDAD_MS) {
    const g = { at: s.at, data: s.documents };
    listas.set(claveLista(quien, qs), g);
    if (s.folders && !carpetas.has(quien)) carpetas.set(quien, { at: s.at, data: s.folders });
    return g;
  }
  return null;
}

/** El árbol de carpetas tal como se vio la última vez. */
export function carpetasGuardadas(): Guardada<DbDocumentFolder[]> | null {
  const quien = identidadActual();
  if (!quien) return null;
  const hit = vigente(carpetas.get(quien));
  if (hit) return hit;
  const s = leerSesion(quien);
  if (s?.folders && Date.now() - s.at < MAX_EDAD_MS) {
    const g = { at: s.at, data: s.folders };
    carpetas.set(quien, g);
    return g;
  }
  return null;
}

/**
 * Guarda lo que hay en pantalla para esa consulta (también los cambios
 * optimistas). `at` = cuándo llegó del servidor lo que está debajo.
 */
export function guardarLista(qs: string, documents: DbDocument[], folders: DbDocumentFolder[] | null, at = Date.now()): void {
  const quien = identidadActual();
  if (!quien) return;
  const clave = claveLista(quien, qs);
  listas.delete(clave); // al final del orden: es la más reciente
  listas.set(clave, { at, data: documents });
  while (listas.size > MAX_VISTAS) {
    const vieja = listas.keys().next().value;
    if (vieja === undefined) break;
    listas.delete(vieja);
  }
  if (folders) carpetas.set(quien, { at, data: folders });
  programarSesion({ quien, qs, at, documents, folders: folders ?? vigente(carpetas.get(quien))?.data ?? null });
}

/** Al cerrar la pestaña o pasar a otra app: que el F5 de después encuentre lo último. */
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", escribirSesionYa);
}

/* ── Pedidos compartidos (hook + precarga) ──────────────────────────────── */

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const text = await res.text().catch((err: unknown) => {
      console.warn("[archivo] respuesta sin cuerpo legible", err);
      return "";
    });
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * Pide la lista de esa consulta compartiendo el pedido en vuelo: si el puntero
 * ya la precargó al pasar por el menú, el hook se sube a ese mismo pedido.
 */
export function pedirLista(qs: string): Promise<RespuestaLista> {
  const quien = identidadActual() ?? "";
  const clave = claveLista(quien, qs);
  const vuela = enVuelo.get(clave);
  if (vuela) return vuela;
  const p = getJson<RespuestaLista>(`${BASE}?${qs}`).finally(() => {
    if (enVuelo.get(clave) === p) enVuelo.delete(clave);
  });
  enVuelo.set(clave, p);
  return p;
}

/** Lo mismo para el árbol de carpetas. */
export function pedirCarpetas(): Promise<{ folders: DbDocumentFolder[] }> {
  const quien = identidadActual() ?? "";
  const vuela = carpetasEnVuelo.get(quien);
  if (vuela) return vuela;
  const p = getJson<{ folders: DbDocumentFolder[] }>(`${BASE}/folders`).finally(() => {
    if (carpetasEnVuelo.get(quien) === p) carpetasEnVuelo.delete(quien);
  });
  carpetasEnVuelo.set(quien, p);
  return p;
}

/**
 * Al pasar el puntero (o el foco) por «Archivo» en el menú: pide «Todos» y el
 * árbol, para que al entrar ya estén. Siempre «Todos»: el Archivo abre ahí
 * aunque la última vez se haya quedado en una carpeta o en la papelera
 * (`recordar: false` en `DocumentosModule`); precargar otra vista era un pedido
 * de más. No pide lo que se leyó hace menos de 30 s ni lo que ya está en vuelo.
 */
export function precargarListaArchivo(): void {
  const quien = identidadActual();
  if (!quien) return;
  const qs = QS_TODOS;
  const clave = claveLista(quien, qs);
  if (!vigente(listas.get(clave), PRECARGA_FRESCA_MS) && !enVuelo.has(clave)) {
    const gen0 = generacion;
    pedirLista(qs)
      .then((r) => {
        // Una escritura en el medio la deja vieja: mejor no guardar nada.
        if (gen0 === generacion && identidadActual() === quien) {
          guardarLista(qs, r.documents, null);
        }
      })
      .catch((err: unknown) => console.warn("[archivo] la precarga de la lista falló", err));
  }
  if (!vigente(carpetas.get(quien), PRECARGA_FRESCA_MS) && !carpetasEnVuelo.has(quien)) {
    const gen0 = generacion;
    pedirCarpetas()
      .then((r) => {
        if (gen0 === generacion && identidadActual() === quien) carpetas.set(quien, { at: Date.now(), data: r.folders });
      })
      .catch((err: unknown) => console.warn("[archivo] la precarga de las carpetas falló", err));
  }
}

/* ── Etiquetas y enlaces (chicos, sólo memoria) ─────────────────────────── */

/** La taxonomía de etiquetas que se leyó hace menos de 5 min. */
export function taxonomiaGuardada(): string[] | null {
  const quien = identidadActual();
  return quien ? (vigente(taxonomias.get(quien), 5 * 60_000)?.data ?? null) : null;
}

export function guardarTaxonomia(tags: string[]): void {
  const quien = identidadActual();
  if (quien) taxonomias.set(quien, { at: Date.now(), data: tags });
}

/** Cuántos enlaces compartidos había la última vez (para no pintar «Enlaces» y sacarlo). */
export function cuentaEnlacesGuardada(): number | null {
  const quien = identidadActual();
  return quien ? (vigente(cuentasEnlaces.get(quien), 5 * 60_000)?.data ?? null) : null;
}

export function guardarCuentaEnlaces(n: number): void {
  const quien = identidadActual();
  if (quien) cuentasEnlaces.set(quien, { at: Date.now(), data: n });
}

/* ── Escrituras ─────────────────────────────────────────────────────────── */

/** Sube con cada escritura al Archivo (al salir y al volver): una lectura que la cruzó puede ser vieja. */
let generacion = 0;
let escriturasEnCurso = 0;
const alTerminar = new Set<() => void>();

export function generacionEscrituras(): number {
  return generacion;
}

/**
 * Corre `fn` cuando no quede ninguna escritura al Archivo en vuelo (ya, si no
 * hay). Para re-leer después de descartar una lectura que cruzó una escritura.
 */
export function cuandoTerminenLasEscrituras(fn: () => void): () => void {
  if (escriturasEnCurso === 0) {
    fn();
    return () => undefined;
  }
  alTerminar.add(fn);
  return () => {
    alTerminar.delete(fn);
  };
}

function borrarLoDelArchivo(): void {
  listas.clear();
  carpetas.clear();
  taxonomias.clear();
  cuentasEnlaces.clear();
  enVuelo.clear();
  carpetasEnVuelo.clear();
  borrarSesion();
}

/** Para tests y para «salir»: no queda nada de nadie. */
export function olvidarTodoElArchivo(): void {
  borrarLoDelArchivo();
  generacion++;
}

if (typeof window !== "undefined") {
  oirEscrituras(({ ruta, fase, cambiaSesion }) => {
    if (cambiaSesion) {
      olvidarTodoElArchivo();
      return;
    }
    if (ruta !== BASE && !ruta.startsWith(`${BASE}/`) && !ruta.startsWith(`${BASE}?`)) return;
    generacion++;
    borrarLoDelArchivo();
    if (fase === "sale") {
      escriturasEnCurso++;
      return;
    }
    escriturasEnCurso = Math.max(0, escriturasEnCurso - 1);
    if (escriturasEnCurso === 0) {
      for (const fn of [...alTerminar]) {
        alTerminar.delete(fn);
        fn();
      }
    }
  });
}
