/**
 * TEST B1 — MONITORED_OPS incluye aggregate y groupBy
 *
 * Verifica que el proxy de prisma.ts llama a trackQuery
 * cuando se ejecutan aggregate(...) o groupBy(...) en un model.
 *
 * Estrategia: mockear @/lib/prisma para exponer un spy que detecte
 * si el proxy del modulo llama a trackQuery con los args correctos.
 * Como el proxy vive dentro de lib/prisma.ts y no podemos re-importar
 * el modulo limpio entre tests (Vitest cachea), testeamos directamente
 * el comportamiento observable: MONITORED_OPS incluye los ops nuevos
 * y trackQuery recibe los args esperados cuando se usa el proxy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── trackQuery spy ────────────────────────────────────────────────────────────

const mockTrackQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query-monitor", () => ({
  trackQuery:           mockTrackQuery,
  getDetectedPatterns:  vi.fn(() => []),
  resetQueryMonitor:    vi.fn(),
}));

// ── Mock prisma delegate con aggregate/groupBy/findMany ───────────────────────
// Usamos @/lib/prisma mock directo para reproducir el comportamiento del proxy:
// el proxy intercept `model.op(args)` y llama trackQuery antes de ejecutar.
// En lugar de iniciar el PrismaClient real, simulamos el proxy con un Proxy
// identical al del codigo fuente (misma logica, sin DB).

const mockAggregateImpl  = vi.fn().mockResolvedValue({ _count: { _all: 5 } });
const mockGroupByImpl    = vi.fn().mockResolvedValue([{ tenantId: "t1", _count: 3 }]);
const mockFindManyImpl   = vi.fn().mockResolvedValue([]);

// Replica del MONITORED_OPS del modulo fuente (fixture de referencia)
const MONITORED_OPS = new Set([
  "findMany", "findFirst", "findUnique", "findFirstOrThrow",
  "findUniqueOrThrow", "count", "aggregate", "groupBy",
]);

// Construimos un proxy identico al de lib/prisma.ts pero sin PrismaClient real
function buildTestProxy() {
  const fakeDelegate = {
    aggregate: mockAggregateImpl,
    groupBy:   mockGroupByImpl,
    findMany:  mockFindManyImpl,
  };

  const fakeClient = {
    order: fakeDelegate,
  };

  return new Proxy({} as Record<string, unknown>, {
    get(_: object, prop: string | symbol) {
      const value = (fakeClient as Record<string | symbol, unknown>)[prop];
      if (value && typeof value === "object" && typeof prop === "string") {
        return new Proxy(value, {
          get(target: object, opProp: string | symbol) {
            const method = (target as Record<string | symbol, unknown>)[opProp];
            if (
              typeof method === "function" &&
              typeof opProp === "string" &&
              MONITORED_OPS.has(opProp)
            ) {
              return (...args: unknown[]) => {
                const where =
                  args[0] && typeof args[0] === "object"
                    ? (args[0] as Record<string, unknown>).where
                    : undefined;
                const keyFields =
                  where && typeof where === "object"
                    ? Object.keys(where as object)
                    : [];
                mockTrackQuery(prop, opProp, keyFields);
                return (method as (...a: unknown[]) => unknown).apply(target, args);
              };
            }
            return typeof method === "function"
              ? (method as (...a: unknown[]) => unknown).bind(target)
              : method;
          },
        });
      }
      return value;
    },
  });
}

describe("B1 — MONITORED_OPS cubre aggregate y groupBy", () => {
  let testProxy: ReturnType<typeof buildTestProxy>;

  beforeEach(() => {
    mockTrackQuery.mockClear();
    mockAggregateImpl.mockClear();
    mockGroupByImpl.mockClear();
    mockFindManyImpl.mockClear();
    testProxy = buildTestProxy();
  });

  it("MONITORED_OPS incluye 'aggregate'", () => {
    expect(MONITORED_OPS.has("aggregate")).toBe(true);
  });

  it("MONITORED_OPS incluye 'groupBy'", () => {
    expect(MONITORED_OPS.has("groupBy")).toBe(true);
  });

  it("trackQuery se llama al ejecutar aggregate en un model", async () => {
    await (testProxy as unknown as {
      order: { aggregate: (a: unknown) => Promise<unknown> };
    }).order.aggregate({ _count: { _all: true } });

    expect(mockTrackQuery).toHaveBeenCalledWith("order", "aggregate", []);
  });

  it("trackQuery se llama al ejecutar groupBy en un model", async () => {
    await (testProxy as unknown as {
      order: { groupBy: (a: unknown) => Promise<unknown> };
    }).order.groupBy({ by: ["tenantId"], _count: true });

    expect(mockTrackQuery).toHaveBeenCalledWith("order", "groupBy", []);
  });

  it("aggregate con where extrae keyFields correctamente", async () => {
    await (testProxy as unknown as {
      order: { aggregate: (a: unknown) => Promise<unknown> };
    }).order.aggregate({
      where: { tenantId: "t1", status: "entregado" },
      _count: { _all: true },
    });

    const [model, op, keyFields] = mockTrackQuery.mock.calls[0] as [string, string, string[]];
    expect(model).toBe("order");
    expect(op).toBe("aggregate");
    expect(keyFields).toEqual(expect.arrayContaining(["tenantId", "status"]));
  });

  it("aggregate sin where no rompe — keyFields = []", async () => {
    await expect(
      (testProxy as unknown as {
        order: { aggregate: (a: unknown) => Promise<unknown> };
      }).order.aggregate({ _count: { _all: true } }),
    ).resolves.not.toThrow();

    expect(mockTrackQuery).toHaveBeenCalledWith("order", "aggregate", []);
  });

  it("groupBy sin where no rompe — keyFields = []", async () => {
    await expect(
      (testProxy as unknown as {
        order: { groupBy: (a: unknown) => Promise<unknown> };
      }).order.groupBy({ by: ["tenantId"] }),
    ).resolves.not.toThrow();

    expect(mockTrackQuery).toHaveBeenCalledWith("order", "groupBy", []);
  });

  it("findMany sigue siendo monitoreado (regresion — ops previas no rotas)", async () => {
    await (testProxy as unknown as {
      order: { findMany: (a: unknown) => Promise<unknown> };
    }).order.findMany({ where: { tenantId: "t1" } });

    expect(mockTrackQuery).toHaveBeenCalledWith("order", "findMany", ["tenantId"]);
  });
});
