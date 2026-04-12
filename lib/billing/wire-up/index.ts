import "server-only";
/**
 * ADR-047 — Metering Wire-Up barrel.
 *
 * Exporta todas las utilidades del event bus y expone `initMeteringBus()`
 * que debe llamarse UNA SOLA VEZ en el startup del servidor.
 *
 * En Next.js 15+, llamar desde un Server Component raíz o desde el
 * middleware de startup si existe. En ambiente de pruebas, llamar
 * explícitamente en el `beforeAll` de cada suite.
 */
export { emitMeteringEvent, getMeteringBus } from "./metering-bus";
export { registerMeteringListeners } from "./metering-listeners";
export { withAIMetering, reportAICall } from "./ai-metering-middleware";
export { USAGE_TIERS, normalizeTier, getQuota } from "./usage-tiers";
export type { MeteringBusEvent, MeteringEventSource } from "./types";
export { METERED_EVENT_SOURCES, SOURCE_TO_METERED_EVENT } from "./types";

/**
 * Inicializa el bus de metering: registra todos los listeners.
 * Idempotente — llamadas múltiples no duplican listeners.
 */
export function initMeteringBus(): void {
  const { registerMeteringListeners: register } = require("./metering-listeners") as {
    registerMeteringListeners: () => void;
  };
  register();
}
