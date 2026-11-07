import { z } from "zod";

/**
 * Lógica pura de retiros (cash-out) del repartidor a Yape.
 *
 * Sin acceso a DB — todo lo testeable del cálculo de saldo y validación
 * vive acá para poder probarlo sin Prisma. La db class
 * (`lib/db/partner-payouts.db.ts`) importa estos helpers y los aplica
 * dentro de una transacción serializable (anti-fraude: el monto disponible
 * SIEMPRE se recalcula en backend, nunca se confía en el cliente).
 */

/** Monto mínimo de un retiro, en soles. */
export const MIN_PAYOUT_SOLES = 20;

/** Estados posibles de un retiro. `pending` y `paid` comprometen saldo. */
export type PayoutStatus = "pending" | "paid" | "rejected";

/** Redondeo a 2 decimales evitando errores de coma flotante. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Saldo disponible para retirar.
 *
 * @param lifetimeEarnings  Σ(fee + propina) de TODAS las entregas completadas.
 * @param committedWithdrawals  Σ(monto) de retiros en estado `pending` o `paid`
 *   (un retiro pendiente ya "aparta" el dinero para no permitir doble retiro;
 *    los `rejected` lo liberan y no cuentan acá).
 * @returns saldo disponible, nunca negativo, redondeado a 2 decimales.
 */
export function computeAvailable(
  lifetimeEarnings: number,
  committedWithdrawals: number,
): number {
  return Math.max(0, round2(lifetimeEarnings - committedWithdrawals));
}

/** Schema de entrada del POST de retiro. Celular Yape peruano = 9 dígitos. */
export const payoutRequestSchema = z.object({
  amount: z.number().finite().positive(),
  yapeNumber: z
    .string()
    .trim()
    .regex(/^9\d{8}$/, "Número de Yape inválido (9 dígitos, empieza con 9)"),
});

export type PayoutRequestInput = z.infer<typeof payoutRequestSchema>;

export type PayoutValidation =
  | { ok: true; amount: number }
  | { ok: false; error: string };

/**
 * Valida que un monto solicitado sea retirable dado el saldo disponible.
 * Se ejecuta en backend con `available` recalculado dentro de la transacción.
 */
export function validatePayoutAmount(
  amount: number,
  available: number,
): PayoutValidation {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "El monto debe ser mayor a cero." };
  }
  const rounded = round2(amount);
  if (rounded < MIN_PAYOUT_SOLES) {
    return {
      ok: false,
      error: `El retiro mínimo es S/ ${MIN_PAYOUT_SOLES}.`,
    };
  }
  if (rounded > round2(available)) {
    return {
      ok: false,
      error: `Solo tienes S/ ${round2(available).toFixed(2)} disponibles.`,
    };
  }
  return { ok: true, amount: rounded };
}
