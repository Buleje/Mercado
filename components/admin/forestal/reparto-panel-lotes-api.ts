/**
 * Las llamadas del panel «Lotes» de la Distribución que no tenía nadie:
 * leer lo que propone el patio y crear varios de esos lotes de una vez. Es la
 * MISMA ruta de «Lotes que puedes armar» (`/lotes-aserrio/propuestas`): el
 * servidor vuelve a leer el patio y los ids sólo acotan a «lo que vi».
 * Sin React: el panel maneja su propio «cargando».
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { PedidoDeLote, PropuestasDelPatio, ResultadoCrearLotes } from "@/lib/forestal/propuesta-de-lotes";

const URL_PROPUESTAS = "/api/admin/forestal/lotes-aserrio/propuestas";

function mensajeDe(r: Response, json: { message?: string; error?: string } | null): string {
  if (json?.error === "specialization_disabled") return "El Libro CTP no está habilitado en este negocio.";
  return json?.message ?? json?.error ?? `El servidor respondió ${r.status}`;
}

/** Lo que el patio propone hoy. Sin caché: recibir una guía lo cambia al toque. */
export async function leerPropuestasDelPatio(): Promise<PropuestasDelPatio> {
  const r = await fetch(URL_PROPUESTAS, { credentials: "include", cache: "no-store" });
  const json = (await r.json().catch(() => null)) as (PropuestasDelPatio & { message?: string; error?: string }) | null;
  if (!r.ok || !json) throw new Error(mensajeDe(r, json));
  return json;
}

/**
 * Crea los lotes elegidos. Cada uno es independiente: el que no se puede vuelve
 * en `noCreados` con su motivo. Si no se crea ninguno, el servidor responde 422
 * con el primer motivo y acá se lanza con ese texto.
 */
export async function crearLotesDelPatio(pedidos: PedidoDeLote[]): Promise<ResultadoCrearLotes> {
  const r = await fetch(URL_PROPUESTAS, {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ propuestas: pedidos }),
  });
  const json = (await r.json().catch(() => null)) as (ResultadoCrearLotes & { message?: string; error?: string }) | null;
  if (!r.ok || !json) throw new Error(mensajeDe(r, json));
  if ((json.creados ?? []).length > 0) invalidarCtp("/forestal/");
  return { creados: json.creados ?? [], noCreados: json.noCreados ?? [] };
}
