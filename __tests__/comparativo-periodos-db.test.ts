/**
 * ComparativoPeriodosDB (11-10): qué filas entran en cada cifra.
 *  - «Fiado dado» deja afuera los CANCELADO (20 de 30 fiados de la base lo
 *    están: perdonados o anulados, no crédito que se espera cobrar).
 *  - Clientes únicos = teléfonos distintos entre ventas del POS y pedidos que
 *    entran (el mismo teléfono en los dos lados cuenta una vez).
 *  - Todo con `tenantId` en el WHERE.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  saleAggregate: vi.fn(),
  saleFindMany: vi.fn(),
  orderAggregate: vi.fn(),
  orderFindMany: vi.fn(),
  customerCount: vi.fn(),
  fiadoAggregate: vi.fn(),
  returnAggregate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sale: { aggregate: h.saleAggregate, findMany: h.saleFindMany },
    order: { aggregate: h.orderAggregate, findMany: h.orderFindMany },
    customer: { count: h.customerCount },
    fiado: { aggregate: h.fiadoAggregate },
    return: { aggregate: h.returnAggregate },
  },
}));
vi.mock("@/lib/db-retry", () => ({ withDbRetry: (fn: () => unknown) => fn() }));

import { ComparativoPeriodosDB } from "@/lib/db/comparativo-periodos.db";

const rango = { start: new Date("2026-10-01T05:00:00Z"), end: new Date("2026-11-01T05:00:00Z") };

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.saleAggregate.mockResolvedValue({ _sum: { total: 10, totalCogs: 4 }, _count: { id: 2 } });
  h.orderAggregate.mockResolvedValue({ _sum: { total: 5, totalCogs: null }, _count: { id: 1 } });
  h.customerCount.mockResolvedValue(1);
  h.fiadoAggregate.mockResolvedValue({ _sum: { total: 50 }, _count: { id: 1 } });
  h.returnAggregate.mockResolvedValue({ _sum: { total: 24.9 }, _count: { id: 1 } });
  h.saleFindMany.mockResolvedValue([
    { customerPhone: "999111222" },
    { customerPhone: "999333444" },
  ]);
  h.orderFindMany.mockResolvedValue([{ customerPhone: "999111222" }]);
});

describe("ComparativoPeriodosDB", () => {
  it("el fiado dado no cuenta los CANCELADO y va por tenant", async () => {
    await ComparativoPeriodosDB.delRango("t-1", rango);
    expect(h.fiadoAggregate).toHaveBeenCalledTimes(1);
    expect(h.fiadoAggregate.mock.calls[0][0].where).toEqual({
      tenantId: "t-1",
      createdAt: { gte: rango.start, lt: rango.end },
      status: { not: "CANCELADO" },
    });
  });

  it("clientes únicos: el mismo teléfono en venta y pedido cuenta una vez; devoluciones del rango", async () => {
    const a = await ComparativoPeriodosDB.delRangoCompleto("t-1", rango);
    expect(a.clientesUnicos).toBe(2);
    expect(a.devoluciones).toEqual({ total: 24.9, cuantas: 1 });
    expect(a.ventasPos.total).toBe(10);
    for (const f of [h.saleFindMany, h.orderFindMany, h.returnAggregate]) {
      expect(f.mock.calls[0][0].where.tenantId).toBe("t-1");
    }
    expect(h.orderFindMany.mock.calls[0][0].where.status).toEqual({
      in: ["confirmado", "en_camino", "entregado"],
    });
    expect(h.orderFindMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });
});
