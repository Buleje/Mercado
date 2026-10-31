/**
 * lib/pricing/total-pedido.ts
 *
 * Fórmula ÚNICA del total de un pedido de la tienda (Regla 6: el servidor
 * decide, el cliente solo muestra).
 *
 * La usan los dos lados con el mismo código:
 *  - `POST /api/orders` calcula el total que se cobra y lo compara con el que
 *    mandó el cliente (anti-fraude, tolerancia de 1 céntimo).
 *  - La vista previa del checkout arma el mismo total con los mismos
 *    descuentos, así lo que el cliente ve es lo que el servidor va a cobrar.
 *
 * Antes cada lado tenía su cuenta: el servidor restaba un 5 % de primera
 * compra que la pantalla no conocía, y TODO teléfono nuevo recibía un 422
 * «El total no coincide» al confirmar (2026-10-08).
 *
 * Archivo puro (sin DB ni `server-only`): lo importa el navegador.
 */

import { PTS_PER_SOL } from "@/lib/loyalty-constants";

/**
 * Canje de puntos en el checkout (2026-10-08): 100 puntos = S/ 1
 * (`PTS_PER_SOL`, la misma regla del marketplace y de los premios), o sea 1
 * punto = 1 céntimo: cualquier cantidad entera de puntos cae justo en céntimos.
 * Tope: los puntos pagan como mucho este % del total ya descontado (cupón,
 * promoción y descuento automático); el resto se paga con plata.
 */
export const TOPE_CANJE_PCT = 50;

/** Redondea a céntimos (2 decimales). */
export function redondearCentimos(monto: number): number {
  return Math.round(monto * 100) / 100;
}

/**
 * `pct` % de `monto`, redondeado al céntimo: 5 % de S/ 11,90 = S/ 0,60.
 * El monto se redondea antes para que el servidor (precios de la DB) y la
 * vista previa (precios del carrito) partan del mismo número.
 */
export function porcentajeDe(monto: number, pct: number): number {
  return Math.round(redondearCentimos(monto) * pct) / 100;
}

/**
 * Descuento automático (primera compra, volumen o cliente frecuente) tal como
 * lo ve el cliente. Sin `motivo` ni tramo de compras (Ley 29733): el texto
 * largo se queda en el servidor (`lib/pricing/descuento-automatico.ts`).
 */
export interface DescuentoAutomaticoVista {
  /** Monto en soles, ya redondeado al céntimo. */
  monto: number;
  /** Porcentaje aplicado (5 = 5 %); 0 si no se muestra. */
  porcentaje: number;
  /** Rótulo corto para la línea del resumen: «Descuento por volumen». */
  etiqueta: string;
}

/**
 * Total que se cobra: subtotal menos cupón, promoción y descuento automático,
 * nunca negativo y redondeado al céntimo. La propina NO entra: el pedido no la
 * guarda (va aparte, para quien entrega).
 */
export function calcularTotalPedido(p: {
  subtotal: number;
  descuentoCupon?: number;
  descuentoPromo?: number;
  descuentoAutomatico?: number;
  /** Soles que pagan los puntos canjeados (`solesPorPuntos`), ya topados. */
  descuentoPuntos?: number;
}): number {
  return Math.max(
    0,
    redondearCentimos(
      p.subtotal -
        (p.descuentoCupon ?? 0) -
        (p.descuentoPromo ?? 0) -
        (p.descuentoAutomatico ?? 0) -
        (p.descuentoPuntos ?? 0),
    ),
  );
}

/** Soles que valen `puntos` (100 pts = S/ 1), al céntimo. */
export function solesPorPuntos(puntos: number): number {
  if (!Number.isFinite(puntos) || puntos <= 0) return 0;
  return redondearCentimos(Math.floor(puntos) / PTS_PER_SOL);
}

/**
 * Cuántos puntos se pueden canjear en este pedido: lo que tiene el cliente,
 * sin pasar del `TOPE_CANJE_PCT` % del total sin puntos. Entero; 0 si no hay
 * saldo o total. Servidor y vista previa usan esta misma cuenta.
 */
export function maxPuntosCanjeables(saldo: number, totalSinPuntos: number): number {
  if (!Number.isFinite(saldo) || saldo <= 0) return 0;
  const topeSoles = porcentajeDe(Math.max(0, totalSinPuntos), TOPE_CANJE_PCT);
  // `topeSoles` ya está en céntimos: ×100 da puntos enteros (1 pt = 1 céntimo).
  const topePuntos = Math.floor(Math.round(topeSoles * 100) * (PTS_PER_SOL / 100));
  return Math.max(0, Math.min(Math.floor(saldo), topePuntos));
}
