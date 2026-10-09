/**
 * Cuánto se le devuelve al cliente en una devolución del POS.
 *
 * `SaleItem.price` guarda el precio con el descuento POR ÍTEM, pero no el
 * descuento GLOBAL de la venta (`Sale.descuentoMonto`, donde también va el
 * trueque). Devolver `price × cantidad` paga plata que nunca entró: una venta
 * de S/ 24,90 con S/ 24,80 de trueque cobró S/ 0,10 y su devolución salía de
 * S/ 24,90 (09-10, venta de QA `bc19cbe5`).
 *
 * Regla: cada línea se devuelve en la proporción que de verdad se cobró
 * (`Sale.total ÷ Σ price × cantidad`) y lo devuelto en todas las devoluciones
 * de la venta nunca pasa de `Sale.total`.
 *
 * Sin `"use client"`: lo usan la ruta de devolución y la vista previa del POS.
 */

function aCentimos(soles: number): number {
  return Number.isFinite(soles) && soles > 0 ? Math.round(soles * 100) : 0;
}

/**
 * Fracción de la suma de las líneas que se cobró: 1 sin descuento global,
 * 0 si el trueque cubrió todo. Nunca más de 1 ni menos de 0.
 */
export function factorCobrado(totalVenta: number, sumaLineas: number): number {
  if (!Number.isFinite(sumaLineas) || sumaLineas <= 0) return 0;
  if (!Number.isFinite(totalVenta) || totalVenta <= 0) return 0;
  return Math.min(1, totalVenta / sumaLineas);
}

/**
 * Tope del reembolso: lo que queda por devolver de lo cobrado
 * (`Sale.total − lo ya devuelto`), redondeado al céntimo.
 */
export function topeReembolso(bruto: number, totalVenta: number, yaReembolsado: number): number {
  const queda = Math.max(0, aCentimos(totalVenta) - aCentimos(yaReembolsado));
  return Math.min(aCentimos(bruto), queda) / 100;
}

export interface LineaVenta {
  /** `SaleItem.price` (ya con el descuento por ítem). */
  price: number;
  quantity: number;
}

export interface CalculoReembolso {
  factor: number;
  /** Precio por unidad que se devuelve de cada línea (`price × factor`). */
  precioDevuelto: (price: number) => number;
  /** Lo que se devuelve en total, con el tope de lo cobrado. */
  total: number;
}

/** La cuenta entera, para la ruta y para el test. */
export function calcularReembolso(params: {
  totalVenta: number;
  lineasVenta: readonly LineaVenta[];
  devolver: readonly LineaVenta[];
  yaReembolsado?: number;
}): CalculoReembolso {
  const sumaLineas = params.lineasVenta.reduce((s, l) => s + l.price * l.quantity, 0);
  const factor = factorCobrado(params.totalVenta, sumaLineas);
  const bruto = params.devolver.reduce((s, l) => s + l.price * factor * l.quantity, 0);
  return {
    factor,
    precioDevuelto: (price) => price * factor,
    total: topeReembolso(bruto, params.totalVenta, params.yaReembolsado ?? 0),
  };
}
