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
 */

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

/** Guarda una anotación del patio. Devuelve la anotación creada. */
export async function anotar(
  section: string,
  payload: Record<string, unknown>,
  url: string = URL_CTP,
  metodo: "POST" | "PATCH" = "POST",
): Promise<AnotacionPatio> {
  const a: AnotacionPatio = {
    id: `patio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    section,
    url,
    metodo,
    payload,
    resumen: resumirAnotacion(section, payload),
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
 * tiene por qué trabar a las cinco que sí entran.
 */
export async function sincronizar(): Promise<ResumenSync> {
  const todas = await listar();
  let subidas = 0;
  let rechazadas = 0;

  let headers: HeadersInit = { "Content-Type": "application/json" };
  try {
    const { csrfHeaders } = await import("@/lib/csrf-client");
    headers = csrfHeaders({ "Content-Type": "application/json" });
  } catch {
    // Sin helper de CSRF el POST va a dar 403 → se reintenta, no se pierde.
  }

  for (const a of todas) {
    if (a.estado === "rechazado") continue;
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
        await borrar(a.id);
        subidas++;
      } else if (veredicto === "rechazado") {
        const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        // `error` es un código para máquinas ("validation_error"): si no vino un
        // mensaje humano, se dice qué pasó en criollo y se guarda el código.
        const motivo = j.message?.trim()
          ? j.message
          : `El libro la rechazó (${j.error ?? `HTTP ${r.status}`}). Revisá los datos y reintentá.`;
        await marcar(a.id, { estado: "rechazado", motivo });
        rechazadas++;
      } else {
        await marcar(a.id, { intentos: a.intentos + 1 });
      }
    } catch {
      // Sigue sin señal: se reintenta en la próxima.
      await marcar(a.id, { intentos: a.intentos + 1 });
    }
  }

  const quedan = await listar();
  return { subidas, rechazadas, pendientes: quedan.filter((a) => a.estado === "pendiente").length };
}

export interface ResultadoEscritura {
  /** `"encolada"` = quedó anotada para subir; `"ok"` = ya está en el libro. */
  estado: "ok" | "encolada" | "error";
  /** Sólo cuando el libro la rechazó: el motivo, tal cual, para mostrarlo. */
  mensaje?: string;
}

/**
 * Escribir algo del patio: mandarlo si se puede, anotarlo si no.
 *
 * Existe para que el consumo y la recepción NO repitan la decisión. Si cada uno
 * escribiera su propio try/catch, uno terminaría encolando un rechazo del libro
 * —el error que `decidirDestino` está para evitar— y nadie lo notaría hasta que
 * un operario se quede mirando un contador que no baja.
 */
export async function escribirDelPatio(opts: {
  section: string;
  url: string;
  payload: Record<string, unknown>;
  metodo?: "POST" | "PATCH";
}): Promise<ResultadoEscritura> {
  const metodo = opts.metodo ?? "POST";
  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  let status: number | null = null;
  let ok = false;
  let mensaje: string | undefined;

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
      }
    } catch {
      // El fetch nunca llegó: `status` queda en null y decide `decidirDestino`.
    }
  }

  const destino = decidirDestino({ online, status, ok });
  if (destino === "ok") return { estado: "ok" };
  if (destino === "mostrar-error") return { estado: "error", mensaje };
  await anotar(opts.section, opts.payload, opts.url, metodo);
  return { estado: "encolada" };
}

export async function contar(): Promise<{ pendientes: number; rechazadas: number }> {
  const todas = await listar();
  return {
    pendientes: todas.filter((a) => a.estado === "pendiente").length,
    rechazadas: todas.filter((a) => a.estado === "rechazado").length,
  };
}
