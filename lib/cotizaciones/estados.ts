/**
 * estados.ts — a dónde puede pasar una cotización (seguridad 17-10, punto 2).
 * Mismo patrón que las órdenes de compra (`lib/compras/estados-oc.ts`).
 *
 * Antes el PATCH aceptaba cualquier estado: una CONVERTIDA se podía volver a
 * ACEPTADA y convertirse otra vez → dos pedidos de la misma cotización.
 *
 * - CONVERTIDA es final y sólo se llega por «Convertir en pedido»
 *   (`/api/cotizaciones/[id]/convertir`), que crea el pedido en la misma tx.
 * - RECHAZADA y VENCIDA se pueden reabrir (el cliente volvió a preguntar).
 *
 * Sin "use client" ni "server-only": viaja a los dos lados.
 */

export const ESTADOS_COTIZACION = ["BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA", "VENCIDA", "CONVERTIDA"] as const;

export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];

export const TRANSICIONES_COTIZACION: Record<EstadoCotizacion, readonly EstadoCotizacion[]> = {
  BORRADOR: ["ENVIADA", "ACEPTADA", "RECHAZADA", "VENCIDA"],
  ENVIADA: ["BORRADOR", "ACEPTADA", "RECHAZADA", "VENCIDA"],
  ACEPTADA: ["ENVIADA", "RECHAZADA", "VENCIDA"],
  RECHAZADA: ["BORRADOR", "ENVIADA"],
  VENCIDA: ["BORRADOR", "ENVIADA"],
  CONVERTIDA: [],
};

export type ResultadoTransicion =
  | { ok: true }
  /** 409: ya es un pedido. 422: el salto no existe o se pidió CONVERTIDA a mano. */
  | { ok: false; status: 409 | 422; error: string };

/** ¿Se puede pasar de `desde` a `hasta` cambiando el estado a mano? */
export function revisarTransicionCotizacion(desde: string, hasta: string): ResultadoTransicion {
  if (desde === hasta) return { ok: true };
  if (desde === "CONVERTIDA") {
    return { ok: false, status: 409, error: "Esta cotización ya se convirtió en pedido: su estado no cambia." };
  }
  if (hasta === "CONVERTIDA") {
    return { ok: false, status: 422, error: "Para convertirla usa «Convertir en pedido»: así se crea el pedido." };
  }
  const destinos = TRANSICIONES_COTIZACION[desde as EstadoCotizacion] ?? [];
  if (!destinos.includes(hasta as EstadoCotizacion)) {
    return { ok: false, status: 422, error: `No se puede pasar de ${desde} a ${hasta}.` };
  }
  return { ok: true };
}

/** El estado cambió entre la lectura y la escritura (otro clic, o se convirtió). */
export class CotizacionCambioDeEstadoError extends Error {
  constructor(public readonly estado: string) {
    super("COTIZACION_CAMBIO_DE_ESTADO");
    this.name = "CotizacionCambioDeEstadoError";
  }
}
