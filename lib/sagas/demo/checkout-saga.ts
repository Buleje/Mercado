/**
 * lib/sagas/demo/checkout-saga.ts
 *
 * DEMO — no productivo. No llama a ningún servicio real.
 *
 * Muestra cómo armar un checkout con 4 pasos usando SagaRunner.
 * El paso DecrementStock simula fallo aleatorio (30%) para tests.
 *
 * Pasos:
 *   1. CreateOrder       → crea la orden (stub)
 *   2. ChargePayment     → cobra al cliente (stub)
 *   3. DecrementStock    → descuenta inventario (stub, falla 30%)
 *   4. SendNotification  → notifica al cliente (stub, sin compensate)
 */

import { logger } from "@/lib/logger";
import { SagaRunner } from "../saga-runner";
import type { SagaStep } from "../types";

// ── Contexto del Saga ────────────────────────────────────────────────────────

export interface CheckoutContext {
  tenantId: string;
  customerId: string;
  cartItems: { productId: string; qty: number; price: number }[];

  // Estos campos los llenan los pasos durante la ejecución:
  orderId?: string;
  chargeId?: string;
  stockDecrementedAt?: string;
}

// ── Steps ────────────────────────────────────────────────────────────────────

const createOrder: SagaStep<CheckoutContext> = {
  name: "CreateOrder",

  async execute(ctx) {
    // STUB: en producción llamaría a OrdersDB.create(...)
    ctx.orderId = `order_demo_${Date.now()}`;
    logger.info("[demo] CreateOrder: orden creada", { orderId: ctx.orderId });
  },

  async compensate(ctx, error) {
    // STUB: en producción haría OrdersDB.cancel(ctx.tenantId, ctx.orderId)
    logger.info("[demo] CreateOrder compensate: orden cancelada", {
      orderId: ctx.orderId,
      reason: error.message,
    });
    ctx.orderId = undefined;
  },
};

const chargePayment: SagaStep<CheckoutContext> = {
  name: "ChargePayment",

  async execute(ctx) {
    // STUB: en producción llamaría al gateway de pagos
    ctx.chargeId = `charge_demo_${Date.now()}`;
    logger.info("[demo] ChargePayment: cobro realizado", {
      chargeId: ctx.chargeId,
      orderId: ctx.orderId,
    });
  },

  async compensate(ctx, error) {
    // STUB: en producción haría un refund al gateway
    logger.info("[demo] ChargePayment compensate: reembolso emitido", {
      chargeId: ctx.chargeId,
      reason: error.message,
    });
    ctx.chargeId = undefined;
  },
};

/**
 * Este step falla intencionalmente el 30% de las veces.
 * Inyectar `_forceFailInTest = true` desde tests para control determinista.
 */
export const decrementStock: SagaStep<CheckoutContext> & {
  _forceFailInTest?: boolean;
} = {
  name: "DecrementStock",

  async execute(ctx) {
    // Control determinista para tests — sin esto sería aleatorio
    const shouldFail =
      (decrementStock as { _forceFailInTest?: boolean })._forceFailInTest ??
      Math.random() < 0.3;

    if (shouldFail) {
      throw new Error("Stock insuficiente para uno o más productos");
    }

    ctx.stockDecrementedAt = new Date().toISOString();
    logger.info("[demo] DecrementStock: stock decrementado", {
      orderId: ctx.orderId,
      items: ctx.cartItems.length,
    });
  },

  async compensate(ctx, error) {
    // STUB: en producción restauraría el stock
    logger.info("[demo] DecrementStock compensate: stock restaurado", {
      orderId: ctx.orderId,
      reason: error.message,
    });
    ctx.stockDecrementedAt = undefined;
  },
};

const sendNotification: SagaStep<CheckoutContext> = {
  name: "SendNotification",

  async execute(ctx) {
    // STUB: en producción enviaría email/WhatsApp al cliente
    logger.info("[demo] SendNotification: notificación enviada", {
      customerId: ctx.customerId,
      orderId: ctx.orderId,
    });
  },

  // Sin compensate intencional: las notificaciones no se "deshacen"
};

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Crea un SagaRunner listo para ejecutar el checkout demo.
 *
 * Uso:
 *   const saga = createCheckoutSaga();
 *   const result = await saga.run({ tenantId, customerId, cartItems });
 *   if (!result.ok) { ... result.error, result.compensated ... }
 */
export function createCheckoutSaga(): SagaRunner<CheckoutContext> {
  return new SagaRunner<CheckoutContext>()
    .addStep(createOrder)
    .addStep(chargePayment)
    .addStep(decrementStock)
    .addStep(sendNotification);
}
