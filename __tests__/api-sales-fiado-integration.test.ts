/**
 * POST /api/sales — integración POS ↔ Fiado.
 *
 * Audit 2026-05-17: cuando una venta POS se cobra al fiado, el registro de
 * deuda en tabla `Fiado` debe nacer ATÓMICO junto con la `Sale`. Antes el
 * cliente (POSView) hacía 2 POSTs separados → si el segundo fallaba la
 * venta quedaba con payment=fiado pero sin fila en Fiado (deuda fantasma).
 *
 * Cubre el contrato del endpoint, NO el rollback transaccional real (eso
 * es de Prisma).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const {
  mockRequireAdmin,
  mockGetByPhone,
  mockUpsertCustomer,
  mockValidateForNewFiado,
  mockCreateInTransaction,
  mockTransaction,
  mockCustomerFindFirst,
  mockSaleFindFirst,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetByPhone: vi.fn(),
  mockUpsertCustomer: vi.fn(),
  mockValidateForNewFiado: vi.fn(),
  mockCreateInTransaction: vi.fn(),
  mockTransaction: vi.fn(),
  mockCustomerFindFirst: vi.fn(),
  mockSaleFindFirst: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({
  requireActiveSubscription: vi.fn(() => null),
}));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => null,
  rateLimit: () => null,
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/db-retry", () => ({ withDbRetry: <T,>(fn: () => Promise<T>) => fn() }));
vi.mock("@/lib/cache", () => ({
  // Firma real: getOrSet(key, ttl, fn)
  getOrSet: <T,>(_k: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/audit/audit-context", () => ({
  // Firma real: runWithAuditContext(req, username, fn)
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

vi.mock("@/lib/db/customers.db", () => ({
  CustomersDB: {
    getByPhone: mockGetByPhone,
    upsert: mockUpsertCustomer,
  },
}));

vi.mock("@/lib/db/fiados.db", () => ({
  FiadosDB: {
    validateForNewFiado: mockValidateForNewFiado,
    createInTransaction: mockCreateInTransaction,
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findFirst: mockCustomerFindFirst },
    sale: { findFirst: mockSaleFindFirst, update: vi.fn() },
    product: {
      findMany: vi.fn().mockResolvedValue([{ id: 1, price: 25, costPrice: 15 }]),
    },
    $transaction: mockTransaction,
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/sales", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ADMIN = { role: "admin" as const, username: "testadmin", tenantId: "tenant-1" };

const VALID_ITEMS = [{ productId: 1, price: 25, quantity: 2, name: "Coca Cola", unit: "und" }];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/sales — POS↔Fiado integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockCustomerFindFirst.mockResolvedValue({ phone: "987654321" });
    mockSaleFindFirst.mockResolvedValue(null); // no duplicado por idempotencyKey

    // Stub default de tx — devuelve una Sale básica al ejecutar el callback
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        product: {
          findMany: vi.fn().mockResolvedValue([{ id: 1, stock: 100, name: "Coca Cola" }]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sale: {
          create: vi.fn().mockResolvedValue({
            id: "sale-abc",
            tenantId: "tenant-1",
            total: 50,
            payment: "fiado",
            amountPaid: 0,
            change: 0,
            customerPhone: "987654321",
            cashierId: "testadmin",
            createdAt: new Date(),
            items: [],
            comprobanteTipo: "ticket",
          }),
        },
        fiado: {},
      };
      return await cb(fakeTx);
    });
  });

  it("payment=fiado SIN customerPhone → 400 sin crear Sale", async () => {
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(makeRequest({ items: VALID_ITEMS, payment: "fiado" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cliente.*teléfono/i);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockCreateInTransaction).not.toHaveBeenCalled();
  });

  it("payment=fiado con scoring blocked → 400 sin crear Sale", async () => {
    mockGetByPhone.mockResolvedValue({ phone: "987654321", creditLimit: 100 });
    mockValidateForNewFiado.mockResolvedValue({
      error: "Cliente bloqueado: tiene 3 fiados vencidos sin pagar",
      status: 400,
    });

    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(
      makeRequest({ items: VALID_ITEMS, payment: "fiado", customerPhone: "987654321" }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("fiados vencidos");
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockCreateInTransaction).not.toHaveBeenCalled();
  });

  it("payment=fiado happy path → Sale + Fiado en la misma tx, response.fiadoId presente", async () => {
    mockGetByPhone.mockResolvedValue({ phone: "987654321", creditLimit: 0 });
    mockValidateForNewFiado.mockResolvedValue(null);
    mockCreateInTransaction.mockResolvedValue({
      id: "fiado-xyz",
      tenantId: "tenant-1",
      customerId: "987654321",
      total: 50,
      saldo: 50,
      status: "ACTIVO",
      cuotas: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(
      makeRequest({
        items: VALID_ITEMS,
        payment: "fiado",
        customerPhone: "987654321",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fiadoId).toBe("fiado-xyz");
    expect(mockCreateInTransaction).toHaveBeenCalledTimes(1);

    // El segundo arg es el data — verificar que se pase tenantId, customerId y
    // descripcion derivada de items.
    const [, data] = mockCreateInTransaction.mock.calls[0];
    expect(data).toMatchObject({
      tenantId: "tenant-1",
      customerId: "987654321",
      total: 50,
    });
    expect(data.descripcion).toContain("Coca Cola");
  });

  it("payment=efectivo NO crea Fiado y NO valida scoring", async () => {
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(
      makeRequest({
        items: VALID_ITEMS,
        payment: "efectivo",
        amountPaid: 50,
        customerPhone: "987654321",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fiadoId).toBeUndefined();
    expect(mockValidateForNewFiado).not.toHaveBeenCalled();
    expect(mockCreateInTransaction).not.toHaveBeenCalled();
  });

  it("cliente nuevo en fiado → se crea via CustomersDB.upsert antes de la tx", async () => {
    mockGetByPhone.mockResolvedValueOnce(null); // no existe primera vez
    mockGetByPhone.mockResolvedValueOnce({ phone: "999000111", creditLimit: 0 }); // post-upsert
    mockValidateForNewFiado.mockResolvedValue(null);
    mockCreateInTransaction.mockResolvedValue({
      id: "fiado-new",
      tenantId: "tenant-1",
      customerId: "999000111",
      total: 50,
      saldo: 50,
      status: "ACTIVO",
      cuotas: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(
      makeRequest({
        items: VALID_ITEMS,
        payment: "fiado",
        customerPhone: "999000111",
      }),
    );

    expect(res.status).toBe(201);
    expect(mockUpsertCustomer).toHaveBeenCalledTimes(1);
    expect(mockUpsertCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "999000111", name: expect.stringContaining("0111") }),
      "tenant-1",
    );
  });
});
