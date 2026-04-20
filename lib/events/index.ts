/**
 * lib/events/index.ts
 *
 * Public API for the EventBus system (server-only).
 * Import from here — not from sub-modules directly.
 *
 * Distinct from:
 *   lib/events.ts       — client-side DOM CustomEvents (storefront)
 *   lib/domain-events/  — legacy BullMQ-backed event bus
 */

export { eventBus, EventBus, type DLQEntry } from "./bus";
export {
  createEvent,
  DomainEventSchema,
  OrderCreatedSchema,
  PaymentSettledSchema,
  StockLowSchema,
  type DomainEvent,
  type OrderCreatedEvent,
  type PaymentSettledEvent,
  type StockLowEvent,
} from "./types";
export { type EventTransport, type Unsubscribe, InMemoryTransport, VercelQueuesTransport } from "./adapter";
export { registerAllHandlers } from "./register";
