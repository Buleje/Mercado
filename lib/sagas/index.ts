/**
 * lib/sagas/index.ts
 *
 * Barrel de exportaciones del módulo de Sagas.
 */

export type { SagaStep, SagaResult } from "./types";
export { SagaRunner } from "./saga-runner";

// Demo — no importar en código productivo
export { createCheckoutSaga, decrementStock } from "./demo/checkout-saga";
export type { CheckoutContext } from "./demo/checkout-saga";
