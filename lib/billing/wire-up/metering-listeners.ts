import "server-only";
/**
 * ADR-047 — Metering Listeners.
 *
 * Registra todos los listeners del MeteringBus. Cada listener traduce
 * un `MeteringBusEvent` en un `recordUsageEvent()` de ADR-044.
 * Los listeners son idempotentes porque `recordUsageEvent` maneja
 * la ventana de 60min via idempotencyKey.
 *
 * Llamar `registerMeteringListeners()` UNA SOLA VEZ al startup
 * (desde `initMeteringBus()` en index.ts).
 */
import { getMeteringBus } from "./metering-bus";
import { SOURCE_TO_METERED_EVENT, METERED_EVENT_SOURCES } from "./types";
import type { MeteringBusEvent } from "./types";
import { recordUsageEvent } from "@/lib/billing/metering";
import { logger } from "@/lib/logger";

let _registered = false;

/**
 * Registra los listeners en el bus. Idempotente — múltiples llamadas
 * no duplican los listeners.
 */
export function registerMeteringListeners(): void {
  if (_registered) return;
  _registered = true;

  const bus = getMeteringBus();

  for (const source of METERED_EVENT_SOURCES) {
    bus.on(source, (payload: MeteringBusEvent) => {
      const meteredEvent = SOURCE_TO_METERED_EVENT[source];
      recordUsageEvent({
        tenantId: payload.tenantId,
        event: meteredEvent,
        amount: payload.amount,
        idempotencyKey: payload.idempotencyKey,
        metadata: payload.metadata,
      }).catch((err: unknown) => {
        logger.error("[metering-listeners] persist failed", {
          source,
          tenantId: payload.tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }

  logger.info("[metering-listeners] registered", {
    sources: METERED_EVENT_SOURCES.length,
  });
}

/** Para tests: resetea el estado interno de registro. */
export function _resetListenersForTest(): void {
  _registered = false;
}
