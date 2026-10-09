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
}): number {
  return Math.max(
    0,
    redondearCentimos(
      p.subtotal -
        (p.descuentoCupon ?? 0) -
        (p.descuentoPromo ?? 0) -
        (p.descuentoAutomatico ?? 0),
    ),
  );
}
