/**
 * El estado de un adelanto se DERIVA de su saldo (ADR-413 §6).
 *
 * Vivía escrito adentro de `registrarEntrega`. Con la liquidación de cuentas
 * lo necesitan dos caminos más —la entrega dentro de otra transacción y la
 * anulación de una liquidación— y tres copias de `> 0.009` son tres lugares
 * donde una se queda con otro umbral.
 *
 * El umbral es de un céntimo, no de un epsilon de punto flotante: la plata se
 * cuenta en céntimos (rule `verificacion-de-verdad` §4).
 *
 * PURO: sin Prisma.
 */

export type EstadoDeSaldo = "ABIERTO" | "LIQUIDADO" | "EXCEDIDO";

/** `saldo = monto − entregado`, redondeado a céntimos, y el estado que le toca. */
export function estadoDelSaldo(montoAdelantado: number, entregado: number): { saldo: number; status: EstadoDeSaldo } {
  const saldo = Math.round((montoAdelantado - entregado) * 100) / 100;
  return { saldo, status: saldo > 0.009 ? "ABIERTO" : saldo < -0.009 ? "EXCEDIDO" : "LIQUIDADO" };
}
