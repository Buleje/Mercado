/**
 * __tests__/lib/telemetry/spans.test.ts
 *
 * Unit tests for lib/telemetry/spans.ts + lib/telemetry/decorators.ts
 *
 * Coverage:
 *  1.  withSpan ejecuta fn y devuelve resultado
 *  2.  withSpan con error propaga el error y marca span como "error"
 *  3.  setAttribute llega al tracer con el valor correcto
 *  4.  addEvent registra el event en el span
 *  5.  Nested spans: parent e hijo se crean en orden
 *  6.  Spans NO se crean cuando OTEL_DISABLED=1
 *  7.  @traced decorator wrappea method async y devuelve resultado
 *  8.  @traced sin nombre usa "<ClassName>.<methodName>" como span name
 *  9.  opts.attributes se aplican al span antes de ejecutar fn
 * 10.  setStatus("ok") propaga SpanStatusCode.OK al tracer
 *
 * Nota sobre decoradores: Vitest/esbuild no transforma la sintaxis @ de Stage 3.
 * Los tests de @traced llaman `traced()` como HOF directamente — es equivalente
 * porque el decorator es solo azúcar sintáctico sobre esa misma función.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";

// ─────────────────────────────────────────────────────────────────────────────
// Stub tracer setup
// ─────────────────────────────────────────────────────────────────────────────

interface MockSpanState {
  name: string;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; attributes?: Record<string, unknown> }>;
  status: { code: number; message?: string } | null;
  ended: boolean;
}

function createMockSpanImpl(state: MockSpanState) {
  return {
    setAttribute: vi.fn((k: string, v: unknown) => {
      state.attributes[k] = v;
    }),
    addEvent: vi.fn((n: string, attrs?: Record<string, unknown>) => {
      state.events.push({ name: n, attributes: attrs });
    }),
    setStatus: vi.fn((s: { code: number; message?: string }) => {
      state.status = s;
    }),
    end: vi.fn(() => {
      state.ended = true;
    }),
  };
}

// Tracer that records every startSpan call.
const createdSpans: MockSpanState[] = [];

const mockTracer = {
  startSpan: vi.fn((name: string) => {
    const state: MockSpanState = {
      name,
      attributes: {},
      events: [],
      status: null,
      ended: false,
    };
    createdSpans.push(state);
    return createMockSpanImpl(state);
  }),
};

vi.mock("@opentelemetry/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@opentelemetry/api")>();
  return {
    ...original,
    trace: {
      getTracer: vi.fn(() => mockTracer),
    },
    SpanStatusCode: original.SpanStatusCode,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after vi.mock hoisting)
// ─────────────────────────────────────────────────────────────────────────────

import { withSpan } from "@/lib/telemetry/spans";
import { traced } from "@/lib/telemetry/decorators";
import { ATTR } from "@/lib/telemetry/semantic-attrs";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resetSpans() {
  createdSpans.length = 0;
  vi.clearAllMocks();
  delete process.env.OTEL_DISABLED;
}

// ─────────────────────────────────────────────────────────────────────────────
// withSpan — core behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("withSpan", () => {
  beforeEach(resetSpans);
  afterEach(() => { delete process.env.OTEL_DISABLED; });

  // ── Test 1 ────────────────────────────────────────────────────────────────
  it("1. ejecuta fn y devuelve el resultado", async () => {
    const result = await withSpan("test.result", async () => 42);
    expect(result).toBe(42);
    expect(createdSpans[0].ended).toBe(true);
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────
  it("2. propaga errores y marca el span como error", async () => {
    const boom = new Error("payment failed");

    await expect(
      withSpan("test.error", async () => { throw boom; }),
    ).rejects.toThrow("payment failed");

    const span = createdSpans[0];
    expect(span.status?.code).toBe(SpanStatusCode.ERROR);
    expect(span.status?.message).toBe("payment failed");
    expect(span.ended).toBe(true);
  });

  // ── Test 3 ────────────────────────────────────────────────────────────────
  it("3. setAttribute llega al tracer con el valor correcto", async () => {
    await withSpan("test.attrs", async (span) => {
      span.setAttribute(ATTR.TENANT_ID, "tenant-xyz");
      span.setAttribute(ATTR.ORDER_TOTAL, 1500);
    });

    const state = createdSpans[0];
    expect(state.attributes[ATTR.TENANT_ID]).toBe("tenant-xyz");
    expect(state.attributes[ATTR.ORDER_TOTAL]).toBe(1500);
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────
  it("4. addEvent registra los eventos en el span", async () => {
    await withSpan("test.events", async (span) => {
      span.addEvent("payment.initiated", { provider: "yape" });
      span.addEvent("payment.completed");
    });

    const state = createdSpans[0];
    expect(state.events).toHaveLength(2);
    expect(state.events[0].name).toBe("payment.initiated");
    expect(state.events[0].attributes).toEqual({ provider: "yape" });
    expect(state.events[1].name).toBe("payment.completed");
  });

  // ── Test 5 ────────────────────────────────────────────────────────────────
  it("5. nested spans: parent e hijo se crean y finalizan en orden", async () => {
    await withSpan("parent", async () => {
      await withSpan("child", async () => {
        // inner work
      });
    });

    expect(createdSpans).toHaveLength(2);
    expect(createdSpans[0].name).toBe("parent");
    expect(createdSpans[1].name).toBe("child");
    expect(createdSpans[0].ended).toBe(true);
    expect(createdSpans[1].ended).toBe(true);
  });

  // ── Test 6 ────────────────────────────────────────────────────────────────
  it("6. NO crea spans cuando OTEL_DISABLED=1", async () => {
    process.env.OTEL_DISABLED = "1";

    const result = await withSpan("disabled.span", async (span) => {
      span.setAttribute("key", "value"); // no-op stub
      return "resultado";
    });

    expect(result).toBe("resultado");
    // mockTracer must NOT have been called
    expect(mockTracer.startSpan).not.toHaveBeenCalled();
    expect(createdSpans).toHaveLength(0);
  });

  // ── Test 9 ────────────────────────────────────────────────────────────────
  it("9. opts.attributes se aplican al span antes de ejecutar fn", async () => {
    await withSpan(
      "test.opts",
      async () => {},
      { attributes: { [ATTR.ORDER_ID]: "order-001", [ATTR.TENANT_ID]: "t1" } },
    );

    const state = createdSpans[0];
    expect(state.attributes[ATTR.ORDER_ID]).toBe("order-001");
    expect(state.attributes[ATTR.TENANT_ID]).toBe("t1");
  });

  // ── Test 10 ───────────────────────────────────────────────────────────────
  it("10. setStatus('ok') propaga SpanStatusCode.OK al tracer", async () => {
    await withSpan("test.status.ok", async (span) => {
      span.setStatus("ok");
    });

    const state = createdSpans[0];
    expect(state.status?.code).toBe(SpanStatusCode.OK);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @traced decorator — invocado como HOF (equivalente al syntax sugar @)
// ─────────────────────────────────────────────────────────────────────────────

describe("traced() decorator (HOF form)", () => {
  beforeEach(resetSpans);

  // ── Test 7 ────────────────────────────────────────────────────────────────
  it("7. wrappea el metodo async y devuelve su resultado", async () => {
    class PaymentService {
      async charge(amount: number): Promise<string> {
        return `charged-${amount}`;
      }
    }

    // Apply the decorator programmatically — identical to @traced("payments.charge")
    const descriptor = Object.getOwnPropertyDescriptor(PaymentService.prototype, "charge")!;
    const context = {
      kind: "method" as const,
      name: "charge",
      static: false,
      private: false,
      access: { has: () => true, get: () => descriptor.value },
      addInitializer: () => {},
      metadata: {},
    } satisfies ClassMethodDecoratorContext<PaymentService, typeof PaymentService.prototype.charge>;

    const decorated = traced("payments.charge")(descriptor.value, context);
    PaymentService.prototype.charge = decorated as typeof PaymentService.prototype.charge;

    const svc = new PaymentService();
    const result = await svc.charge(100);

    expect(result).toBe("charged-100");
    expect(createdSpans[0].name).toBe("payments.charge");
    expect(createdSpans[0].ended).toBe(true);
  });

  // ── Test 8 ────────────────────────────────────────────────────────────────
  it("8. usa '<ClassName>.<methodName>' como span name cuando no se pasa nombre", async () => {
    class InventoryService {
      async reserve(qty: number): Promise<boolean> {
        void qty;
        return true;
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(InventoryService.prototype, "reserve")!;
    const context = {
      kind: "method" as const,
      name: "reserve",
      static: false,
      private: false,
      access: { has: () => true, get: () => descriptor.value },
      addInitializer: () => {},
      metadata: {},
    } satisfies ClassMethodDecoratorContext<InventoryService, typeof InventoryService.prototype.reserve>;

    const decorated = traced()(descriptor.value, context);
    InventoryService.prototype.reserve = decorated as typeof InventoryService.prototype.reserve;

    const svc = new InventoryService();
    await svc.reserve(5);

    // Class name visible from `this.constructor.name`
    expect(createdSpans[0].name).toBe("InventoryService.reserve");
    expect(createdSpans[0].attributes[ATTR.CLASS_NAME]).toBe("InventoryService");
    expect(createdSpans[0].attributes[ATTR.METHOD_NAME]).toBe("reserve");
  });
});
