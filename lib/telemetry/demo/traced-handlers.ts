/**
 * lib/telemetry/demo/traced-handlers.ts
 *
 * Ejemplos de uso de withSpan y @traced.
 * NO importar desde produccion — solo referencia educativa.
 *
 * Patrones demostrados:
 *  1. Event handler wrapeado con withSpan
 *  2. Payment charge wrapeado con withSpan
 *  3. Span nested (parent → child)
 *  4. Uso de @traced en clase de servicio
 */

import { withSpan } from "../spans";
import { traced } from "../decorators";
import { ATTR } from "../semantic-attrs";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Event handler
// ─────────────────────────────────────────────────────────────────────────────

interface OrderCreatedEvent {
  orderId: string;
  tenantId: string;
  total: number;
}

export async function handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
  await withSpan(
    "events.order.created.handle",
    async (span) => {
      span.setAttribute(ATTR.TENANT_ID, event.tenantId);
      span.setAttribute(ATTR.ORDER_ID, event.orderId);
      span.setAttribute(ATTR.ORDER_TOTAL, event.total);
      span.setAttribute(ATTR.EVENT_TYPE, "order.created");

      // ... real handler logic here ...
      span.addEvent("order.handler.started", { orderId: event.orderId });

      // Simulate work
      await Promise.resolve();

      span.addEvent("order.handler.completed");
      span.setStatus("ok");
    },
    { attributes: { [ATTR.EVENT_SOURCE]: "event-bus" } },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Payment charge
// ─────────────────────────────────────────────────────────────────────────────

interface ChargePayload {
  tenantId: string;
  orderId: string;
  provider: "yape" | "plin" | "mercadopago";
  amountCents: number;
}

interface ChargeResult {
  transactionId: string;
  status: "approved" | "rejected";
}

export async function chargePayment(payload: ChargePayload): Promise<ChargeResult> {
  return withSpan(
    "payments.charge",
    async (span) => {
      span.setAttribute(ATTR.TENANT_ID, payload.tenantId);
      span.setAttribute(ATTR.ORDER_ID, payload.orderId);
      span.setAttribute(ATTR.PAYMENT_PROVIDER, payload.provider);

      span.addEvent("payment.charge.initiated", {
        amountCents: payload.amountCents,
      });

      // ... call provider SDK ...
      const result: ChargeResult = {
        transactionId: "txn_demo_001",
        status: "approved",
      };

      span.setAttribute(ATTR.PAYMENT_STATUS, result.status);
      span.addEvent("payment.charge.completed", { transactionId: result.transactionId });
      span.setStatus("ok");

      return result;
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Nested spans (parent → child)
// ─────────────────────────────────────────────────────────────────────────────

export async function processOrder(tenantId: string, orderId: string): Promise<void> {
  // Parent span
  await withSpan(
    "orders.process",
    async (parentSpan) => {
      parentSpan.setAttribute(ATTR.TENANT_ID, tenantId);
      parentSpan.setAttribute(ATTR.ORDER_ID, orderId);

      // Child span — OTel context propagation handles parent linkage
      // via the active context stack (trace.getActiveSpan / context.with).
      await withSpan(
        "orders.process.validate",
        async (childSpan) => {
          childSpan.setAttribute(ATTR.ORDER_ID, orderId);
          childSpan.addEvent("validation.started");
          await Promise.resolve(); // ... validation logic ...
          childSpan.addEvent("validation.passed");
          childSpan.setStatus("ok");
        },
      );

      await withSpan(
        "orders.process.notify",
        async (childSpan) => {
          childSpan.setAttribute(ATTR.ORDER_ID, orderId);
          childSpan.addEvent("notification.sent");
          childSpan.setStatus("ok");
        },
      );

      parentSpan.setStatus("ok");
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. @traced decorator on service class
// ─────────────────────────────────────────────────────────────────────────────

export class InventoryService {
  @traced("inventory.service.reserve")
  async reserve(tenantId: string, productId: string, qty: number): Promise<boolean> {
    // The decorator automatically sets ATTR.CLASS_NAME and ATTR.METHOD_NAME.
    // Add domain attrs directly — `this` works normally inside the method.
    void tenantId; void productId; void qty; // demo stub
    return true;
  }

  @traced()
  async release(tenantId: string, productId: string, qty: number): Promise<void> {
    // Span name defaults to "InventoryService.release"
    void tenantId; void productId; void qty; // demo stub
  }
}
