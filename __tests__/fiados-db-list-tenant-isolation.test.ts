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
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFiadoFindMany = vi.fn();
const mockCustomerFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fiado: { findMany: mockFiadoFindMany },
    customer: { findMany: mockCustomerFindMany },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("FiadosDB.list — multi-tenant isolation (P2-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      phone: { in: ["999111111"] },
    });
  });

  it("NO ejecuta customer findMany si la lista de fiados está vacía", async () => {
    mockFiadoFindMany.mockResolvedValue([]);

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    await FiadosDB.list("tenant-alpha");

    expect(mockCustomerFindMany).not.toHaveBeenCalled();
  });

  it("deduplica customerIds antes del lookup (optimización)", async () => {
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
      {
        id: "f2",
        tenantId: "t1",
        customerId: "999", // mismo customer
        total: 50,
        saldo: 25,
        status: "ACTIVO",
        cuotas: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockCustomerFindMany.mockResolvedValue([]);

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    await FiadosDB.list("t1");

    const customerCall = mockCustomerFindMany.mock.calls[0][0];
    expect(customerCall.where.phone.in).toEqual(["999"]); // sin duplicados
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
