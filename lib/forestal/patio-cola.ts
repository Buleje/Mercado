"use client";

/**
 * patio-cola — anotar en el patio sin señal y subir al libro cuando vuelve.
 *
 * En el patio del aserradero no hay señal, y el operario igual tiene que anotar
 * lo que entra, lo que se corta y lo que sale. La alternativa real es el cuaderno
 * (y después alguien tipea de memoria, tarde y mal: eso es lo que después aparece
 * como "ingreso registrado fuera de plazo").
 *
 * ── Lo que esto NO hace ──────────────────────────────────────────────────────
 * NO decide nada del libro. Los invariantes (I1-I5, período cerrado) son del
 * servidor y ahí se quedan: acá sólo se guarda el borrador y se reintenta. Por
 * eso la distinción que gobierna todo el módulo:
 *
 *   · sin señal / 500 / timeout → TRANSITORIO: se reintenta solo.
 *   · 4xx del libro (422 invariante, 400 validación) → RECHAZADO: reintentar
 *     mil veces da el mismo resultado. Se guarda el motivo y espera a un humano.
 *
 * Tratar un rechazo como "pendiente" haría que el patio muestre para siempre un
 * contador que nunca baja; tratarlo como "subido" perdería el dato en silencio.
 *
 * ── Lo que tiene DUEÑO se sube en orden (2026-09-26) ─────────────────────────
 * Una medida es de UNA troza y un acta es de UN conteo (`duenosDeAnotacion`).
 * Lo viejo de un dueño nunca puede llegar al servidor DESPUÉS de lo nuevo: la v1
 * encolada (el fetch falló con el navegador «online») subía en el reintento y
 * pisaba la v2 que el operario había corregido y guardado directo. Por eso:
 *   · `escribirDelPatio`: si el dueño tiene algo pendiente, lo nuevo va DETRÁS
 *     (medidas: mandan sólo lo que cambió, no se pueden saltear) o lo REEMPLAZA
 *     (acta: se manda entera; el servidor además no pisa un acta más nueva).
 *   · `sincronizar`: si lo de un dueño falla, lo siguiente del MISMO dueño
 *     espera a la próxima vuelta; y lo rechazado que quedó atrás se descarta al
 *     subir lo nuevo (si no, «Reintentar» en la bandeja volvía a pisarlo).
 */

import { diaDelConteo } from "./conteo-patio-historial";
import { formatNumber } from "@/lib/format";
import { logger } from "@/lib/logger";

const DB_NAME = "buleje-patio-ctp";
const DB_VERSION = 1;
const STORE = "anotaciones";
/** Reintentos de un error transitorio antes de pedir ayuda. */
export const MAX_REINTENTOS = 8;

export type EstadoAnotacion = "pendiente" | "rechazado";

export interface AnotacionPatio {
  id: string;
  /** Sección del libro: ingresos | produccion | despacho. */
  section: string;
  /** Endpoint al que va: el ingreso de madera y la línea del libro son distintos. */
  url: string;
  /**
   * Verbo HTTP. Ausente = "POST", que es lo que guardaban las anotaciones
   * anteriores a la recepción: IndexedDB conserva las viejas y romperlas
   * perdería lo que un operario ya anotó sin señal.
   */
  metodo?: "POST" | "PATCH";
  /** El body tal cual lo mandaría el formulario online. */
  payload: Record<string, unknown>;
  /** Resumen legible para la bandeja (el payload no se lee de un vistazo). */
  resumen: string;
  createdAt: string;
  intentos: number;
  estado: EstadoAnotacion;
  /** Por qué lo rechazó el libro. Sólo si estado = "rechazado". */
  motivo?: string;
}

export type ResultadoSubida = "ok" | "reintentar" | "rechazado";

/**
 * Qué hacer con la respuesta del servidor. PURO — es la regla que decide si el
 * dato se reintenta o espera a una persona, y por eso se testea aparte.
 */
export function clasificarRespuesta(status: number, ok: boolean): ResultadoSubida {
  if (ok) return "ok";
  // 408/425/429 son "volvé a intentar" del propio protocolo.
  if (status === 408 || status === 425 || status === 429) return "reintentar";
  // 401/403: la sesión venció o falta el CSRF — se arregla volviendo a entrar,
  // no descartando la anotación.
  if (status === 401 || status === 403) return "reintentar";
  if (status >= 400 && status < 500) return "rechazado";
  return "reintentar";
}

/**
 * Qué hacer con un intento de escritura desde el patio. PURO.
 *
 * La decisión de encolar NO es "¿hay señal?" sino "¿el servidor llegó a
 * opinar?". Tres casos y sólo tres:
 *
 *   · el navegador se sabe sin señal, o el fetch tiró excepción → ENCOLAR.
 *     Nunca llegó; reintentarlo después es exactamente lo correcto.
 *   · el servidor contestó 4xx del libro → MOSTRAR. Reintentar mil veces da lo
 *     mismo, y encolarlo dejaría al operario con un contador que no baja
 *     creyendo que se va a arreglar solo.
 *   · el servidor contestó 5xx/408/429 → ENCOLAR: es transitorio de verdad.
 *
 * Encolar un rechazo del libro es el error que hay que evitar: convierte un
 * "corregí esto" en un "esperá para siempre".
 */
export type Destino = "encolar" | "mostrar-error" | "ok";

export function decidirDestino(input: {
  online: boolean;
  /** `null` = el fetch nunca llegó a responder (excepción de red). */
  status: number | null;
  ok: boolean;
}): Destino {
  if (!input.online || input.status == null) return "encolar";
  if (input.ok) return "ok";
  return clasificarRespuesta(input.status, input.ok) === "rechazado" ? "mostrar-error" : "encolar";
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v);

/**
 * De quién es una anotación: `medidas:<trozaId>` (una por troza medida) o
 * `conteo:<iniciadoEn>` (el acta de un conteo). Lo demás (recepción, consumo,
 * líneas del libro) no tiene dueño que se pise: `[]`.
 */
export function duenosDeAnotacion(section: string, payload: Record<string, unknown>): string[] {
  if (!esObjeto(payload)) return [];
  if (section === "medidas" && Array.isArray(payload.trozas)) {
    return (payload.trozas as unknown[])
      .map((t) => (esObjeto(t) && typeof t.id === "string" && t.id ? `medidas:${t.id}` : null))
      .filter((d): d is string => d != null);
  }
  if (section === "conteo" && esObjeto(payload.conteo) && typeof payload.conteo.iniciadoEn === "string") {
    return [`conteo:${payload.conteo.iniciadoEn}`];
  }
  /* Apartar y sacar una troza del lote mixto (ADR-441): «sacar» no puede
     llegar antes que el «apartar» que quedó sin subir. */
  if (section === "lote-mixto") return idsDeTrozas(payload).map((id) => `mixto:${id}`);
  return [];
}

/** Los ids de `trozaIds` (apartar/sacar del mixto), sin vacíos. */
function idsDeTrozas(payload: Record<string, unknown>): string[] {
  return Array.isArray(payload.trozaIds)
    ? (payload.trozaIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
}

/**
 * Qué hacer con lo nuevo de un dueño que tiene algo pendiente en la cola.
 * `detras`: la medida manda sólo lo que CAMBIÓ contra lo anterior — saltearse
 * lo anterior perdería datos. `reemplaza`: el acta viaja ENTERA, lo anterior
 * sobra.
 */
export function modoDelDueno(section: string): "detras" | "reemplaza" {
  return section === "conteo" ? "reemplaza" : "detras";
}

/** Lo que la cola tiene de estos dueños, por estado. */
export function delMismoDueno(
  lista: readonly AnotacionPatio[],
  duenos: readonly string[],
): { pendientes: AnotacionPatio[]; rechazadas: AnotacionPatio[] } {
  const pendientes: AnotacionPatio[] = [];
  const rechazadas: AnotacionPatio[] = [];
  if (duenos.length === 0) return { pendientes, rechazadas };
  const buscados = new Set(duenos);
  for (const a of lista) {
    if (!duenosDeAnotacion(a.section, a.payload).some((d) => buscados.has(d))) continue;
    (a.estado === "rechazado" ? rechazadas : pendientes).push(a);
  }
  return { pendientes, rechazadas };
}

/**
 * Un 200 que igual trae rechazos: `PATCH /trozas/medidas` responde
 * `{ trozas, rechazadas: [{ id, motivo }] }` y lo rechazado NO se guardó. La
 * cola lo contaba «subido» y lo borraba sin leerlo: la tablet mostraba como
 * guardado un PT que el libro no tenía. Devuelve el motivo (de las piezas de
 * esta anotación) o `null` si entró todo.
 */
export function rechazoDentroDelOk(
  payload: Record<string, unknown>,
  cuerpo: unknown,
  section?: string,
): string | null {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.rechazadas)) return null;
  const ids = new Set(
    (Array.isArray(payload.trozas) ? (payload.trozas as unknown[]) : [])
      .map((t) => (esObjeto(t) && typeof t.id === "string" ? t.id : null))
      .filter((id): id is string => id != null),
  );
  /* El mixto aparta por `trozaIds` y responde `{ agregadas, rechazadas }`. */
  if (section === "lote-mixto") for (const id of idsDeTrozas(payload)) ids.add(id);
  /* Sólo las piezas de ESTA anotación: sin piezas en el payload no hay de qué hablar. */
  if (ids.size === 0) return null;
  const motivos = (cuerpo.rechazadas as unknown[])
    .filter(esObjeto)
    .filter((r) => typeof r.id === "string" && ids.has(r.id))
    .map((r) => (typeof r.motivo === "string" && r.motivo.trim() ? r.motivo.trim() : "El libro no la aceptó."));
  return motivos.length > 0 ? [...new Set(motivos)].join(" ") : null;
}

/** Qué sabe la cola de un dueño: si tiene algo por subir y, si lo rechazó, por qué. */
export function estadoDelDueno(
  lista: readonly AnotacionPatio[],
  dueno: string,
): { pendiente: boolean; rechazo: string | null } {
  const { pendientes, rechazadas } = delMismoDueno(lista, [dueno]);
  const ultima = rechazadas[rechazadas.length - 1];
  return {
    pendiente: pendientes.length > 0,
    rechazo: ultima ? ultima.motivo?.trim() || "El libro la rechazó." : null,
  };
}

const medida = (v: unknown, unidad: string) =>
  v === null ? "—" : typeof v === "number" && Number.isFinite(v) ? `${formatNumber(v)}${unidad}` : null;

/**
 * «Troza 58 · 18″ · 22″ · 12′» — una medida en la bandeja. Sólo lo que se
 * mandó: una corrección de una punta dice «D2 22″»; vaciar las tres, «borrar
 * la medida».
 */
export function resumenDeMedida(codigo: string | null, cambio: Record<string, unknown>): string {
  const quien = codigo?.trim() ? `Troza ${codigo.trim()}` : "Medida de una troza";
  const d1 = medida(cambio.oxD1Pulg, "″");
  const d2 = medida(cambio.oxD2Pulg, "″");
  const l = medida(cambio.oxLargoPies, "′");
  const partes: string[] = [];
  if (cambio.oxD1Pulg === null && cambio.oxD2Pulg === null && cambio.oxLargoPies === null) {
    partes.push("borrar la medida");
  } else if (d1 != null && d2 != null && l != null) {
    partes.push(d1, d2, l);
  } else {
    if (d1 != null) partes.push(`D1 ${d1}`);
    if (d2 != null) partes.push(`D2 ${d2}`);
    if (l != null) partes.push(`largo ${l}`);
  }
  for (const [k, nombre] of [["d1Cm", "D1"], ["d2Cm", "D2"]] as const) {
    const v = medida(cambio[k], " cm");
    if (v != null && cambio[k] !== null) partes.push(`${nombre} ${v}`);
  }
  return [quien, ...partes].join(" · ");
}

/** «Acta del conteo del sábado 26/09 · 48 de 53 contadas». */
export function resumenDeActa(conteo: Record<string, unknown>): string {
  const fecha = typeof conteo.fecha === "string" ? diaDelConteo(conteo.fecha) : null;
  const trozas = Array.isArray(conteo.trozas) ? (conteo.trozas as unknown[]).filter(esObjeto) : [];
  const lecturas = Array.isArray(conteo.lecturas) ? (conteo.lecturas as unknown[]).filter(esObjeto) : [];
  /* Contadas = esperadas encontradas (`motivo` null), como en el acta. */
  const esperadas = new Set(trozas.filter((t) => t.motivo == null && typeof t.id === "string").map((t) => t.id as string));
  const vistas = new Set(lecturas.map((l) => l.trozaId).filter((id): id is string => typeof id === "string" && esperadas.has(id)));
  return [
    fecha ? `Acta del conteo del ${fecha}` : "Acta del conteo",
    `${vistas.size} de ${esperadas.size} contadas`,
  ].join(" · ");
}

/** Texto corto para la bandeja: qué anotó el operario, sin abrir el JSON. */
export function resumirAnotacion(section: string, p: Record<string, unknown>): string {
  const s = (k: string) => {
    const v = p[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const n = (k: string) => (p[k] == null || p[k] === "" ? null : Number(p[k]));
  // Las anotaciones del patio no tienen especie ni cantidad: son "cuántas
  // piezas" y "de qué guía". Sin esto la bandeja mostraba sólo la palabra
  // "consumo", que no dice cuál de las tres cargas es.
  const piezas = (k: string) => (Array.isArray(p[k]) ? (p[k] as unknown[]).length : null);
  if (section === "consumo") {
    const n = piezas("trozaIds");
    return `Piezas a la sierra: ${n ?? "?"}`;
  }
  if (section === "recepcion") {
    const n = piezas("cambios");
    return `Recepción de ${n ?? "?"} troza${n === 1 ? "" : "s"}`;
  }
  if (section === "medidas") {
    const trozas = Array.isArray(p.trozas) ? (p.trozas as unknown[]).filter(esObjeto) : [];
    if (trozas.length === 1) return resumenDeMedida(null, trozas[0]!);
    return `Medidas de ${trozas.length || "?"} trozas`;
  }
  if (section === "conteo" && esObjeto(p.conteo)) return resumenDeActa(p.conteo);
  if (section === "lote-mixto") {
    const n = piezas("trozaIds");
    const verbo = p.accion === "quitar" ? "Sacar del lote mixto" : "Apartar en el lote mixto";
    return `${verbo}: ${n ?? "?"} troza${n === 1 ? "" : "s"}`;
  }

  const partes = [
    s("speciesCommon") ?? s("speciesCommonName") ?? s("productType") ?? section,
    n("quantity") != null ? `${n("quantity")} ${s("unit") ?? ""}`.trim() : null,
    s("gtfNumber") ?? s("gtfIngreso"),
    s("supplierName") ?? s("originCode"),
    s("destino"),
  ].filter(Boolean);
  return partes.join(" · ") || section;
}

/** La bandeja vive arriba de las pestañas y el formulario adentro: se avisa por evento. */
export const EVENTO_CAMBIO = "patio-cola-cambio";
const avisarCambio = () => {
  try { window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO)); } catch { /* SSR */ }
};

/**
 * «Subí ahora»: lo escucha `usePatioCola`. Se pide al encolar algo DETRÁS de
 * otra anotación con señal — sin esto esperaba hasta el latido de 60 s.
 */
export const EVENTO_SUBIR = "patio-cola-subir";
export const pedirSubida = () => {
  try { window.dispatchEvent(new CustomEvent(EVENTO_SUBIR)); } catch { /* SSR */ }
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const escribir = async (fn: (store: IDBObjectStore) => void): Promise<void> => {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/** Endpoint por defecto: las líneas del libro (producción, despacho). */
export const URL_CTP = "/api/admin/forestal/ctp";
/** Ingreso de materia prima: otro endpoint, misma cola. */
export const URL_INGRESO = "/api/admin/forestal/wood-entries";
/** Qué piezas se comió una corrida (ADR-326). */
export const URL_TROZAS_CONSUMO = "/api/admin/forestal/trozas/patio";
/** Recepción física de las trozas de una guía (ADR-325). Va por PATCH. */
export const URL_TROZAS_RECEPCION = "/api/admin/forestal/trozas";

/**
 * Guarda una anotación del patio. Devuelve la anotación creada. `resumen`
 * pisa el automático cuando quien anota sabe más (el código de la troza, que
 * el payload no trae).
 */
export async function anotar(
  section: string,
  payload: Record<string, unknown>,
  url: string = URL_CTP,
  metodo: "POST" | "PATCH" = "POST",
  resumen?: string,
): Promise<AnotacionPatio> {
  const a: AnotacionPatio = {
    id: `patio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    section,
    url,
    metodo,
    payload,
    resumen: resumen?.trim() || resumirAnotacion(section, payload),
    createdAt: new Date().toISOString(),
    intentos: 0,
    estado: "pendiente",
  };
  await escribir((s) => { s.add(a); });
  avisarCambio();
  return a;
}

export async function listar(): Promise<AnotacionPatio[]> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(((req.result ?? []) as AnotacionPatio[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

export async function borrar(id: string): Promise<void> {
  await escribir((s) => { s.delete(id); });
}

/** Borra varias de una vez (lo que quedó viejo de un dueño) y avisa a la bandeja. */
export async function quitar(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await escribir((s) => { for (const id of ids) s.delete(id); });
  avisarCambio();
}

/** Marca el resultado de un intento sobre una anotación. */
async function marcar(id: string, cambios: Partial<AnotacionPatio>): Promise<void> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const a = get.result as AnotacionPatio | undefined;
      if (a) store.put({ ...a, ...cambios });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Vuelve a poner en cola algo rechazado (después de corregir el libro). */
export async function reintentar(id: string): Promise<void> {
  await marcar(id, { estado: "pendiente", intentos: 0, motivo: undefined });
}

export interface ResumenSync {
  subidas: number;
  rechazadas: number;
  pendientes: number;
}

/**
 * Sube lo que se pueda. No corta al primer error: una anotación rechazada no
 * tiene por qué trabar a las cinco que sí entran. Salvo las del MISMO dueño
 * (la misma troza, la misma acta): si la anterior no subió, la siguiente
 * espera — llegar antes que ella sería pisarla después.
 */
export async function sincronizar(): Promise<ResumenSync> {
  const todas = await listar();
  let subidas = 0;
  let rechazadas = 0;
  /** Dueños con algo que no subió en esta vuelta: lo que sigue de ellos espera. */
  const trabados = new Set<string>();

  let headers: HeadersInit = { "Content-Type": "application/json" };
  try {
    const { csrfHeaders } = await import("@/lib/csrf-client");
    headers = csrfHeaders({ "Content-Type": "application/json" });
  } catch {
    // Sin helper de CSRF el POST va a dar 403 → se reintenta, no se pierde.
  }

  for (const a of todas) {
    if (a.estado === "rechazado") continue;
    const duenos = duenosDeAnotacion(a.section, a.payload);
    if (duenos.some((d) => trabados.has(d))) continue;
    const trabar = () => { for (const d of duenos) trabados.add(d); };
    if (a.intentos >= MAX_REINTENTOS) {
      await marcar(a.id, { estado: "rechazado", motivo: `No se pudo subir después de ${MAX_REINTENTOS} intentos.` });
      rechazadas++;
      continue;
    }
    try {
      const r = await fetch(a.url || URL_CTP, {
        method: a.metodo ?? "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(a.payload),
      });
      const veredicto = clasificarRespuesta(r.status, r.ok);
      if (veredicto === "ok") {
        const cuerpo: unknown = await r.json().catch(() => null);
        const motivo = rechazoDentroDelOk(a.payload, cuerpo, a.section);
        if (motivo) {
          await marcar(a.id, { estado: "rechazado", motivo });
          rechazadas++;
        } else {
          await borrar(a.id);
          subidas++;
        }
        /* Lo rechazado ANTES de este mismo dueño quedó viejo: «Reintentar» en
           la bandeja lo subiría encima de lo que acaba de entrar. Se relee la
           cola: lo rechazado en ESTA vuelta no está en la foto del inicio. */
        if (duenos.length > 0) {
          const viejas = delMismoDueno(await listar(), duenos).rechazadas.filter(
            (x) => x.id !== a.id && x.createdAt <= a.createdAt,
          );
          await quitar(viejas.map((x) => x.id));
        }
      } else if (veredicto === "rechazado") {
        const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        // `error` es un código para máquinas ("validation_error"): si no vino un
        // mensaje humano, se dice qué pasó en criollo y se guarda el código.
        const motivo = j.message?.trim()
          ? j.message
          : `El libro la rechazó (${j.error ?? `HTTP ${r.status}`}). Revisa los datos y reintenta.`;
        await marcar(a.id, { estado: "rechazado", motivo });
        rechazadas++;
      } else {
        await marcar(a.id, { intentos: a.intentos + 1 });
        trabar();
      }
    } catch {
      // Sigue sin señal: se reintenta en la próxima.
      await marcar(a.id, { intentos: a.intentos + 1 });
      trabar();
    }
  }

  const quedan = await listar();
  /* El formulario de «Medir» y el acta del conteo escuchan: lo suyo pudo subir o rechazarse. */
  if (subidas + rechazadas > 0) avisarCambio();
  return { subidas, rechazadas, pendientes: quedan.filter((a) => a.estado === "pendiente").length };
}

export interface ResultadoEscritura {
  /** `"encolada"` = quedó anotada para subir; `"ok"` = ya está en el libro. */
  estado: "ok" | "encolada" | "error";
  /** Sólo cuando el libro la rechazó: el motivo, tal cual, para mostrarlo. */
  mensaje?: string;
  /** Sólo `ok`: lo que respondió el servidor (la troza releída, lo rechazado). */
  cuerpo?: unknown;
  /** Sólo `encolada`: quedó DETRÁS de algo del mismo dueño que todavía no subió. */
  detras?: boolean;
}

/**
 * Escribir algo del patio: mandarlo si se puede, anotarlo si no.
 *
 * Existe para que el consumo y la recepción NO repitan la decisión. Si cada uno
 * escribiera su propio try/catch, uno terminaría encolando un rechazo del libro
 * —el error que `decidirDestino` está para evitar— y nadie lo notaría hasta que
 * un operario se quede mirando un contador que no baja.
 *
 * Con dueño (`duenosDeAnotacion`), lo nuevo no puede quedar debajo de lo viejo:
 * si el dueño tiene algo pendiente, va detrás (o lo reemplaza, según
 * `modoDelDueno`); lo que el libro le rechazó antes se descarta al escribir lo
 * nuevo (es lo que el operario corrigió).
 */
export async function escribirDelPatio(opts: {
  section: string;
  url: string;
  payload: Record<string, unknown>;
  metodo?: "POST" | "PATCH";
  /** Texto para la bandeja si queda anotada (ver `anotar`). */
  resumen?: string;
}): Promise<ResultadoEscritura> {
  const metodo = opts.metodo ?? "POST";
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const duenos = duenosDeAnotacion(opts.section, opts.payload);

  let previas: { pendientes: AnotacionPatio[]; rechazadas: AnotacionPatio[] } = { pendientes: [], rechazadas: [] };
  if (duenos.length > 0) {
    try {
      previas = delMismoDueno(await listar(), duenos);
    } catch {
      // Sin IndexedDB no hay cola: nada viejo que pueda pisar lo nuevo.
    }
  }
  const viejas = (xs: readonly AnotacionPatio[]) => xs.map((a) => a.id);

  if (previas.pendientes.length > 0) {
    if (modoDelDueno(opts.section) === "detras") {
      await anotar(opts.section, opts.payload, opts.url, metodo, opts.resumen);
      await quitar(viejas(previas.rechazadas));
      if (online) pedirSubida();
      return { estado: "encolada", detras: true };
    }
    /* Reemplaza: lo pendiente sobra (si ya viajaba, el servidor no deja que
       un acta vieja pise la nueva). */
    await quitar(viejas([...previas.pendientes, ...previas.rechazadas]));
    previas = { pendientes: [], rechazadas: [] };
  }

  let status: number | null = null;
  let ok = false;
  let mensaje: string | undefined;
  let cuerpo: unknown;

  if (online) {
    try {
      const { csrfHeaders } = await import("@/lib/csrf-client");
      const r = await fetch(opts.url, {
        method: metodo,
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(opts.payload),
      });
      status = r.status;
      ok = r.ok;
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        mensaje = j.message?.trim() || j.error || `El servidor respondió ${r.status}`;
      } else {
        cuerpo = await r.json().catch(() => null);
      }
    } catch {
      // El fetch nunca llegó: `status` queda en null y decide `decidirDestino`.
    }
  }

  const destino = decidirDestino({ online, status, ok });
  if (destino === "mostrar-error") return { estado: "error", mensaje };
  if (destino === "ok") {
    /* Ya está en el libro: si la limpieza falla, lo viejo queda rechazado en la
       bandeja (no se sube solo) — no es motivo para decir que no se guardó. */
    await quitar(viejas(previas.rechazadas)).catch((err) =>
      logger.warn("[patio-cola] no se pudo descartar lo rechazado viejo", { error: String(err) }),
    );
    return { estado: "ok", cuerpo };
  }
  await anotar(opts.section, opts.payload, opts.url, metodo, opts.resumen);
  await quitar(viejas(previas.rechazadas));
  return { estado: "encolada" };
}

export async function contar(): Promise<{ pendientes: number; rechazadas: number }> {
  const todas = await listar();
  return {
    pendientes: todas.filter((a) => a.estado === "pendiente").length,
    rechazadas: todas.filter((a) => a.estado === "rechazado").length,
  };
}
