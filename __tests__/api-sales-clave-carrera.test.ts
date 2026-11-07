/**
 * POST /api/sales — carrera por la clave de idempotencia (revisión 17-10).
 *
 * La revisión de la clave corre ANTES de la transacción e `idempotencyKey` es
 * @unique: dos POST con la misma clave a la vez pasan los dos la revisión y el
 * segundo choca (P2002) cuando el primero ya guardó. Antes: 500 y el POS dejaba
 * esa venta (que existe) en «No pasó». Ahora: se relee por clave + negocio y
 * se devuelve 200 `_deduplicated`. También: GET `?clave=` para que el POS
 * revise si una venta se guardó antes de decir «vuelve a anotarla».
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockRequireAdmin, mockTransaction, mockSaleFindFirst } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockTransaction: vi.fn(),
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
  revalidateTenantTag: vi.fn(),
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
vi.mock("@/lib/db/customers.db", () => ({ CustomersDB: { getByPhone: vi.fn(), upsert: vi.fn() } }));
vi.mock("@/lib/db/fiados.db", () => ({ FiadosDB: { validateForNewFiado: vi.fn(), createInTransaction: vi.fn() } }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({
  invalidarVentasOverview: vi.fn(),
  tagVentasOverview: (t: string) => `ventas-overview-${t}`,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
    sale: { findFirst: mockSaleFindFirst, update: vi.fn() },
    product: { findMany: vi.fn().mockResolvedValue([{ id: 1, price: 25, costPrice: 15 }]) },
    $transaction: mockTransaction,
  },
}));

const ADMIN = { role: "admin" as const, username: "testadmin", tenantId: "tenant-1" };
const ITEMS = [{ productId: 1, price: 25, quantity: 2, name: "Coca Cola", unit: "und" }];

const GUARDADA = {
  id: "sale-ya",
  tenantId: "tenant-1",
  total: 50,
  payment: "efectivo",
  amountPaid: 50,
  change: 0,
  createdAt: new Date("2026-10-17T15:00:00Z"),
  items: [{ productId: 1, name: "Coca Cola", price: 25, quantity: 2, unit: "und" }],
};

/** El error que tira Prisma cuando el @unique de idempotencyKey choca. */
function choqueP2002() {
  return Object.assign(new Error("Unique constraint failed on the fields: (`idempotencyKey`)"), {
    code: "P2002",
    meta: { target: ["idempotencyKey"] },
  });
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/sales", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sales — dos POST con la misma clave a la vez", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN);
  });

  it("el segundo choca con el @unique (P2002): devuelve la venta guardada como deduplicada, no 500", async () => {
    // 1.ª lectura (antes de la tx): todavía no está; la relectura tras el choque: ya la guardó el otro POST.
    mockSaleFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(GUARDADA);
    mockTransaction.mockRejectedValueOnce(choqueP2002());

    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post({ items: ITEMS, payment: "efectivo", amountPaid: 50, idempotencyKey: "k-carrera" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "sale-ya", total: 50, _deduplicated: true });
    // La relectura va por clave Y negocio (nunca la venta de otro tenant).
    expect(mockSaleFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-1", idempotencyKey: "k-carrera" } }),
    );
  });

  it("P2002 sin venta con esa clave (otro índice) → sigue siendo 500", async () => {
    mockSaleFindFirst.mockResolvedValue(null);
    mockTransaction.mockRejectedValueOnce(choqueP2002());
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post({ items: ITEMS, payment: "efectivo", amountPaid: 50, idempotencyKey: "k-otro" }));
    expect(res.status).toBe(500);
  });

  it("sin clave no relee nada: el error es el de siempre", async () => {
    mockSaleFindFirst.mockResolvedValue(null);
    mockTransaction.mockRejectedValueOnce(choqueP2002());
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post({ items: ITEMS, payment: "efectivo", amountPaid: 50 }));
    expect(res.status).toBe(500);
    expect(mockSaleFindFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/sales?clave= — ¿ya se guardó?", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ ...ADMIN, role: "cajero" });
  });

  it("encontrada: monto y hora; buscada por clave + negocio de la sesión", async () => {
    mockSaleFindFirst.mockResolvedValueOnce(GUARDADA);
    const { GET } = await import("@/app/api/sales/route");
    const res = await GET(new NextRequest("http://localhost/api/sales?clave=k-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      guardada: true,
      venta: { id: "sale-ya", total: 50, payment: "efectivo", createdAt: "2026-10-17T15:00:00.000Z" },
    });
    expect(mockSaleFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-1", idempotencyKey: "k-1" } }));
  });

  it("no está: guardada false", async () => {
    mockSaleFindFirst.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/sales/route");
    const res = await GET(new NextRequest("http://localhost/api/sales?clave=k-2"));
    expect(await res.json()).toEqual({ guardada: false, venta: null });
  });

  it("clave vacía → 400; sin sesión → la respuesta de requireAdmin (401)", async () => {
    const { GET } = await import("@/app/api/sales/route");
    expect((await GET(new NextRequest("http://localhost/api/sales?clave=%20"))).status).toBe(400);
    const { NextResponse } = await import("next/server");
    mockRequireAdmin.mockResolvedValueOnce(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    expect((await GET(new NextRequest("http://localhost/api/sales?clave=k-1"))).status).toBe(401);
    expect(mockSaleFindFirst).not.toHaveBeenCalled();
  });
});
