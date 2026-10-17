/**
 * FiadosDB.list — multi-tenant isolation regression test (P2-2).
 *
 * Audit 2026-05-17: el lookup de customers (para enriquecer con name) NO
 * incluía tenantId en el where. Hoy funciona porque Customer.phone es
 * @unique global (TD-040 Phase 1), pero cuando Phase 3 contract relaje a
 * @@unique([tenantId, phone]) sin este filtro devolveríamos names de
 * OTROS tenants → bomba de tiempo.
 *
 * Este test bloquea la regresión: si alguien quita `tenantId` del where
 * del findMany de customers, el test falla antes del merge.
 *
 * 16-10 (carril velocidad): fiados, cuotas y clientes van en UNA tanda; las
 * cuotas y los clientes se filtran por la misma condición vía la relación.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFiadoFindMany = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockCuotaFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fiado: { findMany: mockFiadoFindMany },
    customer: { findMany: mockCustomerFindMany },
    fiadoCuota: { findMany: mockCuotaFindMany },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("FiadosDB.list — multi-tenant isolation (P2-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCuotaFindMany.mockResolvedValue([]);
  });

  it("incluye tenantId en el where del findMany de fiados", async () => {
    mockFiadoFindMany.mockResolvedValue([]);
    mockCustomerFindMany.mockResolvedValue([]);

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    await FiadosDB.list("tenant-alpha");

    expect(mockFiadoFindMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: "tenant-alpha" },
    });
  });

  it("incluye tenantId en el where del findMany de customers (anti TD-040 Phase 3)", async () => {
    mockFiadoFindMany.mockResolvedValue([
      {
        id: "f1",
        tenantId: "tenant-alpha",
        customerId: "999111111",
        total: 100,
        saldo: 50,
        status: "ACTIVO",
        cuotas: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockCustomerFindMany.mockResolvedValue([
      { phone: "999111111", name: "Maria Lopez" },
    ]);

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    await FiadosDB.list("tenant-alpha");

    // Guard crítico: el customer lookup DEBE filtrar por tenantId, no solo
    // por phone. Si alguien refactoriza y quita tenantId del where, este
    // assertion lo bloquea.
    const customerCall = mockCustomerFindMany.mock.calls[0][0];
    expect(customerCall.where).toMatchObject({
      tenantId: "tenant-alpha",
      fiados: { some: { tenantId: "tenant-alpha" } },
    });
  });

  it("cuotas y clientes con el MISMO filtro que los fiados (tenant, estado, cliente)", async () => {
    mockFiadoFindMany.mockResolvedValue([]);
    mockCustomerFindMany.mockResolvedValue([]);

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    await FiadosDB.list("tenant-alpha", { status: "ACTIVO", customerId: "999" });

    const filtro = { tenantId: "tenant-alpha", status: "ACTIVO", customerId: "999" };
    expect(mockFiadoFindMany.mock.calls[0][0].where).toEqual(filtro);
    expect(mockCuotaFindMany.mock.calls[0][0].where).toEqual({ fiado: filtro });
    expect(mockCustomerFindMany.mock.calls[0][0].where).toEqual({
      tenantId: "tenant-alpha",
      fiados: { some: filtro },
    });
  });

  it("cada cuota vuelve a su fiado, en orden", async () => {
    const base = { tenantId: "t1", customerId: "999", total: 100, saldo: 50, status: "ACTIVO" };
    mockFiadoFindMany.mockResolvedValue([
      { ...base, id: "f1", createdAt: new Date(), updatedAt: new Date() },
      { ...base, id: "f2", createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockCuotaFindMany.mockResolvedValue([
      { id: "q1", fiadoId: "f2", monto: 10, createdAt: new Date("2026-10-01") },
      { id: "q2", fiadoId: "f1", monto: 20, createdAt: new Date("2026-10-02") },
      { id: "q3", fiadoId: "f2", monto: 30, createdAt: new Date("2026-10-03") },
    ]);
    mockCustomerFindMany.mockResolvedValue([]);

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const [f1, f2] = await FiadosDB.list("t1");

    expect(f1.cuotas?.map((q) => q.id)).toEqual(["q2"]);
    expect(f2.cuotas?.map((q) => q.id)).toEqual(["q1", "q3"]);
  });

  it("mergea name del customer en el output mapped", async () => {
    mockFiadoFindMany.mockResolvedValue([
      {
        id: "f1",
        tenantId: "t1",
        customerId: "999",
        total: 100,
        saldo: 50,
        status: "ACTIVO",
        cuotas: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockCustomerFindMany.mockResolvedValue([{ phone: "999", name: "Carlos Mendoza" }]);

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const result = await FiadosDB.list("t1");

    expect(result[0].customerName).toBe("Carlos Mendoza");
  });
});
