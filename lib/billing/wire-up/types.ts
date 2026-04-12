/**
 * ADR-047 — Metering Wire-Up: tipos del event bus.
 *
 * Este módulo define el contrato de eventos que circulan por el
 * `MeteringBus`. Cada evento tiene un `source` tipado, un `tenantId`
 * de aislamiento multi-tenant y un `amount` numérico.
 */

export const METERED_EVENT_SOURCES = [
  "sale.completed",        // → recordUsageEvent("order.created", 1)
  "ai.llm.call",           // → recordUsageEvent("ai.call", tokens)
  "ai.recommend.call",     // → recordUsageEvent("ai.recommend", 1)
  "ai.insight.call",       // → recordUsageEvent("ai.insight", 1)
  "whatsapp.message.sent", // → recordUsageEvent("whatsapp.sent", 1)
  "sunat.invoice.emitted", // → recordUsageEvent("sunat.emitted", 1)
  "export.triggered",      // → recordUsageEvent("storage.blob", sizeKb)
  "sms.sent",              // → recordUsageEvent("sms.sent", 1)
] as const;

export type MeteringEventSource = (typeof METERED_EVENT_SOURCES)[number];

export interface MeteringBusEvent {
  /** El tipo de acción que ocurrió en el hot path. */
  source: MeteringEventSource;
  /** Tenant al que pertenece el evento. Nunca viene del body — siempre del server. */
  tenantId: string;
  /** Cantidad a acreditar: 1 para eventos unitarios, tokens para LLM, KB para storage. */
  amount: number;
  /** Clave de idempotency para deduplication de 60 min (saleId, messageId, invoiceId…). */
  idempotencyKey?: string;
  /** Metadatos opcionales para debug / audit trail. */
  metadata?: Record<string, unknown>;
}

/** Mapa de fuente de evento a evento de billing facturable. */
export const SOURCE_TO_METERED_EVENT: Record<
  MeteringEventSource,
  | "order.created"
  | "ai.call"
  | "ai.recommend"
  | "ai.insight"
  | "sms.sent"
  | "whatsapp.sent"
  | "sunat.emitted"
  | "storage.blob"
> = {
  "sale.completed":        "order.created",
  "ai.llm.call":           "ai.call",
  "ai.recommend.call":     "ai.recommend",
  "ai.insight.call":       "ai.insight",
  "whatsapp.message.sent": "whatsapp.sent",
  "sunat.invoice.emitted": "sunat.emitted",
  "export.triggered":      "storage.blob",
  "sms.sent":              "sms.sent",
};
