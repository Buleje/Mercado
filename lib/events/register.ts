/**
 * lib/events/register.ts
 *
 * Register all domain event handlers with an EventBus instance.
 *
 * Call once at server boot — typically from instrumentation.ts:
 *
 *   // instrumentation.ts
 *   import { eventBus } from "@/lib/events/bus";
 *   import { registerAllHandlers } from "@/lib/events/register";
 *
 *   export async function register() {
 *     registerAllHandlers(eventBus);
 *   }
 *
 * This function is idempotent only if called once — calling it twice will
 * register duplicate handlers. Guard with a module-level flag if needed.
 */

import type { EventBus } from "./bus";
import { onOrderCreated } from "./handlers/on-order-created";
import { onPaymentSettled } from "./handlers/on-payment-settled";
import { onStockLow } from "./handlers/on-stock-low";

export function registerAllHandlers(bus: EventBus): void {
  bus.subscribe("OrderCreated", onOrderCreated);
  bus.subscribe("PaymentSettled", onPaymentSettled);
  bus.subscribe("StockLow", onStockLow);
}
