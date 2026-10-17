/**
 * lib/payables/payment-validation.ts — anti sobre-pago de cuentas por pagar.
 *
 * El monto de un pago lo manda el cliente (admin). El tope contra el saldo
 * pendiente debe validarse en backend, no solo con `max` en el input (que se
 * puede saltear). Funciones puras para testear aisladas.
 */

/** Saldo pendiente de una cuenta por pagar (nunca negativo). */
export function remainingBalance(amount: number, paidAmount: number): number {
  return Math.max(0, Number(amount) - Number(paidAmount));
}

/**
 * True si un pago excede el saldo pendiente. Tolerancia de medio centavo para
 * absorber el redondeo de montos a 2 decimales.
 */
export function exceedsRemaining(
  paymentAmount: number,
  amount: number,
  paidAmount: number,
): boolean {
  return Number(paymentAmount) > remainingBalance(amount, paidAmount) + 0.005;
}
