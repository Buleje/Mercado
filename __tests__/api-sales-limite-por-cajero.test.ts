/**
 * POST /api/sales — el límite de ventas va DESPUÉS del login y por cajero (17-10).
 *
 * Antes: `applyRateLimit(req, "STRICT", "sales-post")` ANTES de `requireAdmin`
 * = 10 ventas cada 15 min por IP. En una bodega el dueño y los cajeros comparten
 * la IP: la venta 11 de la hora punta daba 429. Ahora: GENEROUS (100/min) con
 * clave `sales-post:<negocio>:<usuario>`, y sin sesión no se toca el cupo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockRequireAdmin, mockTransaction, mockRl } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockTransaction: vi.fn(),
  mockRl: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({
  requireActiveSubscription: vi.fn(() => null),
}));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: mockRl,
  rateLimit: () => null,
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/db-retry", () => ({ withDbRetry: <T,>(fn: () => Promise<T>) => fn() }));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: <T,>(_k: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: <T,>(_req: unknown, _user: unknown, fn: () => Promise<T>) => fn(),
  getAuditContext: () => null,
}));
vi.mock("@/lib/inventory/fefo-deduct", () => ({
  deductStockFEFO: vi.fn(),
  hasBatchesWithStock: vi.fn(() => Promise.resolve(false)),
}));
vi.mock("@/lib/jsondb", () => ({
  SalesDB: { getAll: vi.fn() },
  InventoryMovementsDB: { record: vi.fn(() => Promise.resolve()) },
  CashRegistersDB: { getOpen: vi.fn(() => Promise.resolve(null)) },
  LoyaltyDB: { accruePoints: vi.fn(() => Promise.resolve()) },
}));
vi.mock("@/lib/decimal-utils", () => ({ toNumOrZero: (n: unknown) => Number(n) || 0 }));
vi.mock("@/app/api/inventory/conteo/route", () => ({ conteoLockKey: vi.fn() }));
vi.mock("@/lib/db/customers.db", () => ({ CustomersDB: { getByPhone: vi.fn(), upsert: vi.fn() } }));
vi.mock("@/lib/db/fiados.db", () => ({ FiadosDB: { validateForNewFiado: vi.fn(), createInTransaction: vi.fn() } }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({
  invalidarVentasOverview: vi.fn(),
  tagVentasOverview: (t: string) => `ventas-overview-${t}`,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
    sale: { findFirst: vi.fn(), update: vi.fn() },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: mockTransaction,
  },
}));

const LLENO = () =>
  new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });

function post() {
  return new NextRequest("http://localhost/api/sales", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "190.1.2.3" },
    body: JSON.stringify({
      items: [{ productId: 1, price: 25, quantity: 1, name: "Coca Cola", unit: "und" }],
      payment: "efectivo",
      amountPaid: 25,
    }),
  });
}

describe("POST /api/sales — límite por negocio + cajero, después del login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRl.mockImplementation(LLENO);
  });

  it("sin sesión: 401 y el cupo de ventas no se toca", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    const { POST } = await import("@/app/api/sales/route");

    const res = await POST(post());

    expect(res.status).toBe(401);
    expect(mockRl).not.toHaveBeenCalled();
  });

  it("con sesión: GENEROUS con clave sales-post:<negocio>:<usuario>; si se llena, 429 sin abrir la venta", async () => {
    mockRequireAdmin.mockResolvedValue({ role: "cajero", username: "cajero1", tenantId: "tenant-1" });
    const { POST } = await import("@/app/api/sales/route");

    const res = await POST(post());

    expect(res.status).toBe(429);
    expect(mockRl).toHaveBeenCalledTimes(1);
    expect(mockRl).toHaveBeenCalledWith(expect.anything(), "GENEROUS", "sales-post:tenant-1:cajero1");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("dos cajeros de la misma bodega (misma IP) no comparten el cupo", async () => {
    const { POST } = await import("@/app/api/sales/route");
    mockRequireAdmin.mockResolvedValueOnce({ role: "admin", username: "dueno", tenantId: "tenant-1" });
    await POST(post());
    mockRequireAdmin.mockResolvedValueOnce({ role: "cajero", username: "cajero1", tenantId: "tenant-1" });
    await POST(post());

    const claves = mockRl.mock.calls.map((c) => c[2]);
    expect(claves).toEqual(["sales-post:tenant-1:dueno", "sales-post:tenant-1:cajero1"]);
  });
});
