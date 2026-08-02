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
