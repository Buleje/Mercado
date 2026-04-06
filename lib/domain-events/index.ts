/**
 * lib/domain-events/index.ts
 *
 * Public API for domain events (server-only, BullMQ-backed).
 * No confundir con lib/events.ts (client-side DOM CustomEvents).
 */

export {
  emitDomainEvent,
  onDomainEvent,
  DomainEvents,
  DOMAIN_EVENTS_QUEUE,
  type DomainEvent,
  type DomainEventPayload,
  type VentaCompletadaEvent,
  type StockBajoEvent,
  type FacturaEmitidaEvent,
} from "./domain-events";
