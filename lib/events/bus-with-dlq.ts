/**
 * lib/events/bus-with-dlq.ts
 *
 * Wrapper de EventBus que integra un DeadLetterQueue persistente.
 * El EventBus original queda sin modificar — backward compat total.
 *
 * Patron Decorator:
 *   - Implementa la misma interfaz publica que EventBus
 *   - Delega publish/subscribe al bus interno
 *   - Intercepta fallos de handlers y los envia al DLQ inyectado
 *
 * Uso en produccion (instrumentation.ts):
 *
 *   import { EventBus } from "@/lib/events/bus";
 *   import { EventBusWithDLQ } from "@/lib/events/bus-with-dlq";
 *   import { PrismaDeadLetterQueue } from "@/lib/events/dlq/prisma-dlq";
 *
 *   const dlq = new PrismaDeadLetterQueue();
 *   export const eventBus = new EventBusWithDLQ(new EventBus(), dlq);
 *   dlq.setRetryBus(eventBus);
 *
 * Uso en dev/tests (InMemory):
 *
 *   import { InMemoryDeadLetterQueue } from "@/lib/events/dlq/in-memory-dlq";
 *   const dlq = new InMemoryDeadLetterQueue();
 *   const bus = new EventBusWithDLQ(new EventBus(), dlq);
 *   dlq.setRetryBus(bus);
 */

import { logger } from "@/lib/logger";
import { EventBus, type DLQEntry } from "./bus";
import type { DomainEvent } from "./types";
import type { Unsubscribe } from "./adapter";
import type { DeadLetterQueue } from "./dlq/dlq";

// ─── EventBusWithDLQ ──────────────────────────────────────────────────────────

export class EventBusWithDLQ {
  constructor(
    private readonly inner: EventBus,
    private readonly dlq: DeadLetterQueue,
  ) {}

  /**
   * Suscribir un handler con captura persistente de fallos.
   *
   * Cuando el handler lanza:
   *   1. Se llama dlq.enqueue() con la entrada completa
   *   2. Si dlq.enqueue() falla, se loguea — nunca tumba publish
   *   3. Re-lanza para que Promise.allSettled en InMemoryTransport lo capture
   *
   * @returns Unsubscribe — identica al EventBus interno.
   */
  subscribe<T extends DomainEvent["type"]>(
    type: T,
    handler: (evt: Extract<DomainEvent, { type: T }>) => Promise<void>,
  ): Unsubscribe {
    const name = handler.name || "(anonymous)";

    const wrappedHandler = async (evt: Extract<DomainEvent, { type: T }>) => {
      try {
        await handler(evt);
      } catch (err) {
        // Persistir en DLQ — fire-and-forget safe
        this.dlq
          .enqueue({
            tenantId: evt.tenantId,
            event: evt,
            handlerName: name,
            error: String(err),
          })
          .catch((dlqErr: unknown) => {
            // El DLQ fallo — logueamos pero NO interrumpimos el flujo
            logger.error("[bus-with-dlq] dlq.enqueue failed — continuing", {
              type: evt.type,
              tenantId: evt.tenantId,
              handler: name,
              dlqError: String(dlqErr),
            });
          });

        throw err; // Re-lanzar para que el inner bus lo capture en allSettled
      }
    };

    // Asignar nombre de funcion para trazabilidad en logs
    Object.defineProperty(wrappedHandler, "name", {
      value: `dlq-wrapped:${name}`,
    });

    return this.inner.subscribe(type, wrappedHandler);
  }

  /**
   * Publicar un evento — delega directamente al bus interno.
   * Nunca lanza.
   */
  async publish(event: DomainEvent): Promise<void> {
    return this.inner.publish(event);
  }

  // ─── Backward compat — exponer DLQ in-memory del bus interno ────────────────

  /** DLQ in-memory del EventBus interno (bounded 100). */
  getDLQ(): readonly DLQEntry[] {
    return this.inner.getDLQ();
  }

  /** Drain la DLQ in-memory del bus interno. */
  drainDLQ(): DLQEntry[] {
    return this.inner.drainDLQ();
  }

  /** Acceso al DLQ persistente inyectado. */
  getPersistentDLQ(): DeadLetterQueue {
    return this.dlq;
  }
}
