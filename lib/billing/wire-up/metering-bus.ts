/**
 * ADR-047 — Metering Event Bus (singleton).
 *
 * EventEmitter in-process que desacopla los hot paths de negocio de la
 * capa de billing. Los callers emiten un `MeteringBusEvent` y los listeners
 * registrados en `metering-listeners.ts` persisten el uso vía
 * `recordUsageEvent()` de ADR-044.
 *
 * Decisión: EventEmitter in-process es suficiente para v1. Si se necesita
 * durabilidad entre reinicios (crashs, deploys), migrar a BullMQ (ADR futuro).
 */
import { EventEmitter } from "events";
import type { MeteringBusEvent, MeteringEventSource } from "./types";

class MeteringEventBus extends EventEmitter {
  /** Emite un evento de metering al bus. Fire-and-forget seguro — no lanza. */
  emit(event: MeteringEventSource, payload: MeteringBusEvent): boolean {
    try {
      return super.emit(event, payload);
    } catch {
      // El bus no puede tirar errores hacia los callers de hot paths.
      return false;
    }
  }

  /** Suscribe un listener a un tipo de evento de metering. */
  on(
    event: MeteringEventSource,
    listener: (payload: MeteringBusEvent) => void,
  ): this {
    return super.on(event, listener);
  }

  /** Desuscribe un listener previamente registrado. */
  off(
    event: MeteringEventSource,
    listener: (payload: MeteringBusEvent) => void,
  ): this {
    return super.off(event, listener);
  }
}

// Singleton — compartido en todo el proceso Node
let _bus: MeteringEventBus | null = null;

export function getMeteringBus(): MeteringEventBus {
  if (!_bus) {
    _bus = new MeteringEventBus();
    _bus.setMaxListeners(50); // Previene warning con muchos listeners
  }
  return _bus;
}

/**
 * Emite un evento de metering al bus singleton.
 * Seguro para uso en hot paths — nunca lanza, nunca bloquea.
 */
export function emitMeteringEvent(payload: MeteringBusEvent): void {
  getMeteringBus().emit(payload.source, payload);
}
