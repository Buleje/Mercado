"use client";

/**
 * ctp-fetch.ts — pedir datos del libro y, si falla, decir QUÉ falló.
 *
 * Las vistas del libro arman su pantalla con seis o siete pedidos en paralelo.
 * Cuando uno devolvía 403, el mensaje era «El servidor respondió 403»: no decía
 * cuál de los siete, ni por qué, ni qué hacer. Una auditoría externa se topó
 * justamente con eso en Cuadros SERFOR y lo único que pudo reportar fue el
 * número — que es exactamente lo que este helper viene a evitar.
 *
 * El servidor ya manda el motivo (`{ error, message }`); acá se lee y se
 * traduce al idioma del operador, con el nombre de lo que se estaba pidiendo.
 */

import { logger } from "@/lib/logger";

/* ── Un solo pedido por dato (ADR-347) ──────────────────────────────────────
 *
 * El Libro CTP monta varias vistas y tiras a la vez —la cabina, el semáforo de
 * pendientes, la tira de lotes, la vista activa— y cada una pedía lo suyo por
 * su cuenta. Medido en el navegador, UNA carga de la pestaña Consumos disparó
 * **12 pedidos a `/forestal/ctp`, 6 a `lotes-aserrio` y 6 a `wood-entries`**:
 * la misma respuesta, varias veces, mientras el operador mira un spinner.
 *
 * Dos cosas lo arreglan sin tocar cada vista: compartir la promesa de lo que ya
 * está EN VUELO (que además neutraliza el doble montaje de React en dev) y
 * reusar unos segundos lo recién traído. El TTL es corto a propósito: es para
 * el montaje simultáneo de varias vistas, no para ahorrarle trabajo al servidor
 * durante la sesión.
 */

const TTL_MS = 8_000;

interface EnCache {
  /** Cuándo se resolvió; 0 mientras está en vuelo. */
  t: number;
  p: Promise<unknown>;
}

const enVuelo = new Map<string, EnCache>();

/**
 * Descarta lo cacheado. Sin argumento, todo; con uno, lo que lo contenga.
 *
 * **Después de escribir hay que llamarla.** Un caché que sobrevive a un consumo
 * muestra madera que ya entró a la sierra.
 */
export function invalidarCtp(fragmento?: string): void {
  if (!fragmento) {
    enVuelo.clear();
    return;
  }
  for (const url of [...enVuelo.keys()]) {
    if (url.includes(fragmento)) enVuelo.delete(url);
  }
}

/**
 * GET deduplicado. Devuelve la MISMA promesa a quien pida la misma url.
 *
 * Un error **no se cachea**: la entrada se borra al fallar, si no un 500
 * pasajero se pega ocho segundos a toda la pantalla.
 */
export function ctpGet<T>(url: string, opciones: { ttlMs?: number } = {}): Promise<T> {
  const ttl = opciones.ttlMs ?? TTL_MS;
  const previa = enVuelo.get(url);
  if (previa && (previa.t === 0 || Date.now() - previa.t < ttl)) return previa.p as Promise<T>;

  const entrada: EnCache = {
    t: 0,
    p: (async () => {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
      return (await r.json()) as T;
    })()
      .then((datos) => {
        const viva = enVuelo.get(url);
        if (viva === entrada) viva.t = Date.now();
        return datos;
      })
      .catch((e) => {
        if (enVuelo.get(url) === entrada) enVuelo.delete(url);
        throw e;
      }),
  };
  enVuelo.set(url, entrada);
  return entrada.p as Promise<T>;
}

/** Qué se le dice al operador según lo que respondió el servidor. */
function motivo(status: number, quePedia: string, mensajeServidor?: string): string {
  if (status === 401) return `Tu sesión venció mientras se cargaban ${quePedia}. Volvé a entrar.`;
  if (status === 403) {
    // El servidor distingue los dos casos y el mensaje es específico: se
    // muestra tal cual, que dice más que cualquier texto genérico.
    return mensajeServidor
      ? `No se pudieron leer ${quePedia}: ${mensajeServidor}`
      : `Tu usuario no tiene permiso para ver ${quePedia}.`;
  }
  if (status === 404) return `No se encontró de dónde leer ${quePedia}.`;
  if (status === 429) return `Demasiados pedidos seguidos: esperá unos segundos y recargá ${quePedia}.`;
  if (status >= 500) return `El servidor falló al armar ${quePedia} (error ${status}).`;
  return `No se pudieron leer ${quePedia} (respuesta ${status}).`;
}

/**
 * GET de un JSON del libro. `quePedia` es el sujeto de la frase de error —
 * "los ingresos", "las corridas de producción"— así el aviso nombra la parte
 * que falló y no el endpoint.
 */
export async function pedirJsonCtp<T>(url: string, quePedia: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { credentials: "include" });
  } catch (err) {
    // Sin red el `fetch` tira antes de tener status: el operador necesita saber
    // que es la conexión y no un permiso.
    logger.warn("[ctp-fetch] sin respuesta", { url, error: String(err) });
    throw new Error(`Sin conexión al pedir ${quePedia}.`);
  }
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
    const detalle = cuerpo?.message ?? (cuerpo?.error && cuerpo.error !== "forbidden" ? cuerpo.error : undefined);
    throw new Error(motivo(r.status, quePedia, detalle));
  }
  return (await r.json()) as T;
}

/**
 * Igual, pero para lo que NO es imprescindible: devuelve `null` y el motivo en
 * vez de tirar. Un cuadro regulatorio con una parte faltante —dicha— sirve
 * más que una pantalla en blanco; lo que no puede pasar es que falte en
 * silencio.
 */
export async function pedirOpcionalCtp<T>(
  url: string,
  quePedia: string,
): Promise<{ datos: T | null; falta: string | null }> {
  try {
    return { datos: await pedirJsonCtp<T>(url, quePedia), falta: null };
  } catch (err) {
    return { datos: null, falta: err instanceof Error ? err.message : String(err) };
  }
}
