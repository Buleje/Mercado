/**
 * B-P0-4 · Paginación in-memory → Prisma skip/take.
 *
 * Audit 2026-05-17: route handlers cargaban TODA la tabla en RAM y luego
 * cortaban con slice() → OOM en Vercel Fluid 512MB con tenants >50k órdenes.
 * Ahora skip/take Prisma-side: memoria O(limit) en vez de O(total).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOrderFindMany = vi.fn();
const mockOrderCount = vi.fn();
const mockSaleFindMany = vi.fn();
const mockSaleCount = vi.fn();
const mockTransaction = vi.fn();

// TD-116 (2026-06-10): bajo withRlsTx el $transaction es interactivo
// (callback con tx). El shim ejecuta el callback contra el MISMO objeto de
// mocks, así los asserts sobre mockSaleFindMany/mockOrderFindMany siguen
// valiendo. mockTransaction registra la llamada (los tests cuentan veces).
const mockClient: Record<string, unknown> = {
  order: { findMany: mockOrderFindMany, count: mockOrderCount },
  sale: { findMany: mockSaleFindMany, count: mockSaleCount },
  $executeRawUnsafe: vi.fn(),
};
mockClient.$transaction = async (arg: unknown) => {
  const recorded = mockTransaction(arg);
  // batch legacy (array de promises): respeta el valor stubeado en mockTransaction
  if (Array.isArray(arg)) return recorded ?? Promise.all(arg);
  // interactivo (withRlsTx): ejecuta el callback para que los asserts sobre
  // mockSaleFindMany/mockOrderFindMany registren la llamada real
  return (arg as (tx: unknown) => unknown)(mockClient);
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/decimal-utils", () => ({
  toNumOrZero: (v: unknown) => (v == null ? 0 : Number(v)),
}));

describe("B-P0-4 · OrdersPaginatedDB.listFiltered", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usa skip/take Prisma-side (no carga todo en memoria)", async () => {
    mockTransaction.mockResolvedValue([[], 0]);

    const { OrdersPaginatedDB } = await import("@/lib/db/orders-paginated.db");
    await OrdersPaginatedDB.listFiltered({
      tenantId: "tenant-1",
      page: 3,
      limit: 50,
    });

    // El $transaction se llamó con un array de 2 promises (findMany + count)
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // findMany debe tener skip=(page-1)*limit y take=limit
    expect(mockOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100, // (3-1)*50
        take: 50,
        where: expect.objectContaining({ tenantId: "tenant-1" }),
      })
    );
  });

  it("filtros (status, since, phone) se pushean a Prisma where", async () => {
    mockTransaction.mockResolvedValue([[], 0]);

    const { OrdersPaginatedDB } = await import("@/lib/db/orders-paginated.db");
    await OrdersPaginatedDB.listFiltered({
      tenantId: "tenant-1",
      page: 1,
      limit: 25,
      status: "pendiente,confirmado",
      since: "2026-05-01T00:00:00Z",
      phone: "98 7654321",
    });

    const call = mockOrderFindMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      tenantId: "tenant-1",
      status: { in: ["pendiente", "confirmado"] },
      createdAt: { gte: expect.any(Date) },
      customerPhone: "987654321", // normalizado (sin espacios)
    });
  });

  it("page=0 o negativo no causa skip negativo (clamp a 0)", async () => {
    mockTransaction.mockResolvedValue([[], 0]);

    const { OrdersPaginatedDB } = await import("@/lib/db/orders-paginated.db");
    await OrdersPaginatedDB.listFiltered({
      tenantId: "tenant-1",
      page: 0,
      limit: 50,
    });

    const call = mockOrderFindMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
  });
});

describe("B-P0-4 · SalesDB.getAllFilteredPaginated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("today=true setea createdAt.gte a inicio del día", async () => {
    // TD-116: sales usa tx interactiva — se stubean las fns subyacentes
    mockSaleFindMany.mockResolvedValue([]);
    mockSaleCount.mockResolvedValue(0);

    const { SalesDB } = await import("@/lib/db/sales.db");
    await SalesDB.getAllFilteredPaginated({
      tenantId: "tenant-1",
      page: 1,
      limit: 100,
      today: true,
    });

    const call = mockSaleFindMany.mock.calls[0][0];
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    const gte = call.where.createdAt.gte as Date;
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
  });

  it("cashierId filtra Prisma-side (no JS)", async () => {
    mockSaleFindMany.mockResolvedValue([]);
    mockSaleCount.mockResolvedValue(0);

    const { SalesDB } = await import("@/lib/db/sales.db");
    await SalesDB.getAllFilteredPaginated({
      tenantId: "tenant-1",
      page: 1,
      limit: 50,
      cashierId: "qaadmin",
    });

    const call = mockSaleFindMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      tenantId: "tenant-1",
      cashierId: "qaadmin",
    });
  });

  it("from + to definen rango en where (no array.filter post)", async () => {
    mockSaleFindMany.mockResolvedValue([]);
    mockSaleCount.mockResolvedValue(0);

    const from = new Date("2026-05-01");
    const to = new Date("2026-05-31");

    const { SalesDB } = await import("@/lib/db/sales.db");
    await SalesDB.getAllFilteredPaginated({
      tenantId: "tenant-1",
      page: 1,
      limit: 50,
      from,
      to,
    });

    const call = mockSaleFindMany.mock.calls[0][0];
    expect(call.where.createdAt).toMatchObject({ gte: from, lte: to });
  });

  it("retorna { items, total } shape (compat con route handler)", async () => {
    mockSaleFindMany.mockResolvedValue([{
      id: "s1", total: 50, totalCogs: 30, payment: "efectivo",
      amountPaid: 50, change: 0, customerPhone: null, cashierId: "qaadmin",
      createdAt: new Date(), tenantId: "tenant-1",
      comprobanteTipo: "ticket", comprobanteRuc: null, comprobanteNumero: null,
      descuentoMonto: null, descuentoPorcentaje: null, paymentDetails: null,
      items: [],
    }]);
    mockSaleCount.mockResolvedValue(1);

    const { SalesDB } = await import("@/lib/db/sales.db");
    const result = await SalesDB.getAllFilteredPaginated({
      tenantId: "tenant-1",
      page: 1,
      limit: 50,
    });

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });
});
