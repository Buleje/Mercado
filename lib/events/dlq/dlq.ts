/**
 * lib/events/dlq/dlq.ts
 *
 * Interface y tipos Zod para el Dead-Letter Queue persistente.
 *
 * Dos implementaciones disponibles:
 *   - InMemoryDeadLetterQueue  — dev y tests
 *   - PrismaDeadLetterQueue    — produccion (requiere migration 20260420_add_event_dead_letter)
 */

import { z } from "zod";
import type { DomainEvent } from "@/lib/events/types";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const DeadLetterEntrySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  eventType: z.string().min(1),
  /** Evento completo serializado como objeto JSON. */
  eventPayload: z.record(z.string(), z.unknown()),
  /** ISO 8601 — cuándo ocurrió el evento original. */
  occurredAt: z.string().datetime(),
  /** ISO 8601 — cuándo falló el handler. */
  failedAt: z.string().datetime(),
  attemptCount: z.number().int().min(1),
  lastError: z.string().min(1),
  handlerName: z.string().min(1),
  /** ISO 8601 o null si sigue pendiente. */
  resolvedAt: z.string().datetime().nullable(),
});

export type DeadLetterEntry = z.infer<typeof DeadLetterEntrySchema>;

// ─── Input schema (sin id/failedAt — los genera la implementacion) ────────────

export const DeadLetterEnqueueInputSchema = z.object({
  tenantId: z.string().min(1),
  event: z.custom<DomainEvent>(),
  handlerName: z.string().min(1),
  error: z.string().min(1),
});

export type DeadLetterEnqueueInput = z.infer<typeof DeadLetterEnqueueInputSchema>;

// ─── Resultado de reintentos ──────────────────────────────────────────────────

export const RetryResultSchema = z.object({
  retried: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  exhausted: z.number().int().nonnegative(),
});

export type RetryResult = z.infer<typeof RetryResultSchema>;

// ─── Interface principal ──────────────────────────────────────────────────────

export interface DeadLetterQueue {
  /**
   * Persiste una entrada fallida en el DLQ.
   * tenantId viene dentro de `input` (extraido del evento).
   * Nunca lanza — es fire-and-forget-safe.
   */
  enqueue(input: DeadLetterEnqueueInput): Promise<void>;

  /**
   * Lista entradas sin resolver para un tenant.
   * @param tenantId  Primer parametro — aislamiento multi-tenant.
   * @param opts.limit      Max entradas (default 50, max 200).
   * @param opts.eventType  Filtrar por tipo de evento.
   */
  listUnresolved(
    tenantId: string,
    opts?: { limit?: number; eventType?: string },
  ): Promise<DeadLetterEntry[]>;

  /**
   * Marca una entrada como resuelta.
   * @param id  cuid de la entrada.
   */
  markResolved(id: string, reason?: string): Promise<void>;

  /**
   * Reintenta eventos pendientes re-publicando en el bus.
   * La implementacion es responsable de incrementar attemptCount y
   * de marcar como resuelto (con nota) cuando se agota maxAttempts.
   *
   * @param tenantId      Primer parametro — aislamiento.
   * @param opts.maxAttempts  Cap de reintentos antes de marcar "exhausted" (default 5).
   */
  retryPending(
    tenantId: string,
    opts?: { maxAttempts?: number },
  ): Promise<RetryResult>;
}
