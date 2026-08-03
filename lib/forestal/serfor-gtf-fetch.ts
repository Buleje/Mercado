import "server-only";
import { logger } from "@/lib/logger";
import {
  intentosConsulta,
  parsearConsultaGtf,
  urlConsultaGtf,
  SERFOR_GTF_FORM,
  type ModoConsultaGtf,
  type ResultadoConsultaGtf,
} from "./serfor-gtf";

/**
 * El único lugar del sistema que sale a la red de SERFOR.
 *
 * Vive del lado del servidor por dos razones que no son la misma: el sitio de
 * ellos no manda CORS (un fetch del navegador moriría) y, sobre todo, **la
 * ficha que registra el libro tiene que venir del servicio, no del navegador**
 * (ADR-312). Aceptar la ficha que manda el cliente sería aceptar cualquier
 * ficha: un POST a mano metería al libro una guía inexistente con el sello de
 * "verificado en SERFOR" puesto por nosotros.
 */

/** El servicio es lento y ajeno: se corta a los 20s en vez de colgar el request. */
const TIMEOUT_MS = 20_000;

/** Caché en memoria: la misma guía consultada dos veces seguidas no vuelve a salir. */
const CACHE = new Map<string, { at: number; resultado: ResultadoConsultaGtf }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export type ConsultaSerfor =
  | { ok: true; resultado: ResultadoConsultaGtf; cache: boolean }
  | { ok: false; estado: "sin_respuesta"; mensaje: string };

/**
 * Consulta la guía por su N° de registro probando las escrituras y los modos que
 * ofrece el propio formulario. Corta en el primer resultado con datos.
 *
 * No es adivinar números: son vistas distintas del mismo dato que tipeó el
 * operador. Escanear el rango de N° de registro para "encontrar" una guía sería
 * enumeración contra un sistema del Estado y no se hace.
 */
export async function consultarGtfEnSerfor(numero: string): Promise<ConsultaSerfor> {
  const cacheado = CACHE.get(numero);
  if (cacheado && Date.now() - cacheado.at < CACHE_TTL_MS) {
    return { ok: true, resultado: cacheado.resultado, cache: true };
  }

  const intentos = intentosConsulta(numero);
  let ultimoMensaje = "No se pudo consultar el servicio de SERFOR.";
  let ultimaRespuesta: ResultadoConsultaGtf | null = null;

  for (const intento of intentos) {
    const parcial = await consultarUno(intento.numero, intento.modo);
    if (!parcial.ok) { ultimoMensaje = parcial.mensaje; continue; }
    if (parcial.resultado.estado === "encontrada") {
      CACHE.set(numero, { at: Date.now(), resultado: parcial.resultado });
      return { ok: true, resultado: parcial.resultado, cache: false };
    }
    // "No encontrada" es una respuesta válida del servicio, pero se sigue
    // probando por si otra escritura del número sí la ubica. Sólo si ninguna lo
    // hace vale como veredicto.
    ultimaRespuesta = parcial.resultado;
  }

  if (ultimaRespuesta) {
    if (ultimaRespuesta.estado !== "sin_respuesta") {
      CACHE.set(numero, { at: Date.now(), resultado: ultimaRespuesta });
    }
    return { ok: true, resultado: ultimaRespuesta, cache: false };
  }
  return { ok: false, estado: "sin_respuesta", mensaje: ultimoMensaje };
}

/** Una consulta: devuelve el resultado parseado o por qué no se pudo. */
async function consultarUno(
  numero: string,
  modo: ModoConsultaGtf,
): Promise<{ ok: true; resultado: ResultadoConsultaGtf } | { ok: false; mensaje: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(urlConsultaGtf(numero, modo), {
      signal: ctrl.signal,
      headers: {
        // El servlet responde distinto sin un UA de navegador.
        "User-Agent": "Mozilla/5.0 (compatible; BulejeCTP/1.0; +libro-de-operaciones)",
        Referer: SERFOR_GTF_FORM,
        "Accept-Language": "es-PE,es;q=0.9",
      },
      cache: "no-store",
    });
    if (!r.ok) {
      logger.warn("[gtf.serfor] respuesta no OK", { numero, modo, status: r.status });
      return { ok: false, mensaje: `El servicio de SERFOR respondió ${r.status}. Probá de nuevo en un rato.` };
    }
    return { ok: true, resultado: parsearConsultaGtf(await r.text(), numero) };
  } catch (e) {
    const abortado = e instanceof Error && e.name === "AbortError";
    logger.warn("[gtf.serfor] falló la consulta", { numero, err: String(e).slice(0, 200) });
    return {
      ok: false,
      mensaje: abortado
        ? "SERFOR no respondió en 20 segundos. Podés cargar la guía a mano y consultarla después."
        : "No se pudo conectar con SERFOR.",
    };
  } finally {
    clearTimeout(t);
  }
}
