/**
 * ADR-047 — Unit tests del Metering Event Bus.
 *
 * Cubre:
 * - emit dispara listeners registrados
 * - múltiples listeners reciben el mismo evento
 * - error en listener no crashea el bus
 * - idempotencia vía recordUsageEvent (delegada a metering.ts)
 * - registerMeteringListeners es idempotente (no duplica listeners)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockRecordUsageEvent = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/billing/metering", () => ({
  recordUsageEvent: mockRecordUsageEvent,
  METERED_EVENTS: [
    "order.created",
    "ai.call",
    "ai.recommend",
    "ai.insight",
    "sms.sent",
    "whatsapp.sent",
    "sunat.emitted",
    "storage.blob",
  ],
}));

// Reset singleton between tests
beforeEach(() => {
  vi.resetModules();
  mockRecordUsageEvent.mockReset();
  mockRecordUsageEvent.mockResolvedValue(true);
});

describe("MeteringBus — emitMeteringEvent", () => {
  it("emite un evento y el listener registrado lo recibe", async () => {
    const { getMeteringBus, emitMeteringEvent } = await import(
      "@/lib/billing/wire-up/metering-bus"
    );
    const bus = getMeteringBus();
    const listener = vi.fn();

    bus.on("sale.completed", listener);
    emitMeteringEvent({
      source: "sale.completed",
      tenantId: "tenant_a",
      amount: 1,
      idempotencyKey: "sale_001",
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "sale.completed",
        tenantId: "tenant_a",
        amount: 1,
        idempotencyKey: "sale_001",
      }),
    );
  });

  it("múltiples listeners reciben el mismo evento", async () => {
    const { getMeteringBus, emitMeteringEvent } = await import(
      "@/lib/billing/wire-up/metering-bus"
    );
    const bus = getMeteringBus();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    bus.on("ai.llm.call", listenerA);
    bus.on("ai.llm.call", listenerB);

    emitMeteringEvent({
      source: "ai.llm.call",
      tenantId: "tenant_b",
      amount: 250,
    });

    expect(listenerA).toHaveBeenCalledOnce();
    expect(listenerB).toHaveBeenCalledOnce();
  });

  it("un error en un listener no crashea el bus", async () => {
    const { getMeteringBus, emitMeteringEvent } = await import(
      "@/lib/billing/wire-up/metering-bus"
    );
    const bus = getMeteringBus();
    bus.on("whatsapp.message.sent", () => {
      throw new Error("listener explosion");
    });

    // No debe lanzar
    expect(() =>
      emitMeteringEvent({
        source: "whatsapp.message.sent",
        tenantId: "tenant_c",
        amount: 1,
      }),
    ).not.toThrow();
  });
});

describe("registerMeteringListeners — idempotencia y persistencia", () => {
  it("registra listeners que llaman recordUsageEvent con los campos correctos", async () => {
    const { _resetListenersForTest } = await import(
      "@/lib/billing/wire-up/metering-listeners"
    );
    const { registerMeteringListeners } = await import(
      "@/lib/billing/wire-up/metering-listeners"
    );
    const { emitMeteringEvent } = await import(
      "@/lib/billing/wire-up/metering-bus"
    );

    _resetListenersForTest();
    registerMeteringListeners();

    emitMeteringEvent({
      source: "sale.completed",
      tenantId: "tenant_x",
      amount: 1,
      idempotencyKey: "sale_abc",
    });

    // Esperar micro-tarea del listener async
    await new Promise((r) => setTimeout(r, 10));

    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_x",
        event: "order.created",
        amount: 1,
        idempotencyKey: "sale_abc",
      }),
    );
  });

  it("llamar registerMeteringListeners dos veces no duplica los listeners", async () => {
    const { _resetListenersForTest, registerMeteringListeners } = await import(
      "@/lib/billing/wire-up/metering-listeners"
    );
    const { emitMeteringEvent } = await import(
      "@/lib/billing/wire-up/metering-bus"
    );

    _resetListenersForTest();
    registerMeteringListeners();
    registerMeteringListeners(); // segunda llamada — no-op

    emitMeteringEvent({
      source: "sale.completed",
      tenantId: "tenant_y",
      amount: 1,
    });

    await new Promise((r) => setTimeout(r, 10));

    // Solo una llamada, no dos
    expect(mockRecordUsageEvent).toHaveBeenCalledTimes(1);
  });
});
