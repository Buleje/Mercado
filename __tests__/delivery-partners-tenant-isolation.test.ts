/**
 * T3 — delivery-partners-tenant-isolation.test.ts
 *
 * Verifica que GET /api/delivery/partners scope tenantId en el findMany.
 * Asserción clave: prisma.deliveryPartner.findMany recibe where: { tenantId: "tenant-a" }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({
    tenantId: "tenant-a",
    username: "qa",
    role: "admin",
  })),
}));

const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deliveryPartner: {
      findMany: mockFindMany,
    },
  },
}));

const { GET } = await import("@/app/api/delivery/partners/route");

describe("GET /api/delivery/partners — tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  it("scope: findMany recibe where.tenantId === 'tenant-a'", async () => {
    const req = new NextRequest("http://localhost/api/delivery/partners");
    await GET(req);

    expect(mockFindMany).toHaveBeenCalledOnce();
    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ tenantId: "tenant-a" });
  });

  it("no filtra partners de otros tenants (solo tenant-a en where)", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "p1", name: "Repartidor A", tenantId: "tenant-a" },
    ]);
    const req = new NextRequest("http://localhost/api/delivery/partners");
    const res = await GET(req);
    const data = await res.json();

    // El route retorna lo que Prisma devuelve — scope está en el where
    expect(data).toHaveLength(1);
    expect(data[0].tenantId).toBe("tenant-a");

    // Confirmar que el where usado no incluye otros tenants
    const whereUsed = mockFindMany.mock.calls[0][0].where;
    expect(whereUsed.tenantId).toBe("tenant-a");
    expect(whereUsed.tenantId).not.toBe("tenant-b");
  });
});
