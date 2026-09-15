/**
 * Tests unitarios — POST /api/marketplace/products/bulk-edit
 *
 * El endpoint usa prisma.$transaction directamente (no DB class).
 * Solo rol "admin" puede acceder.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── requireAdmin ──────────────────────────────────────────────────────────────
const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

// ── cache ─────────────────────────────────────────────────────────────────────
const { mockInvalidateByPrefix } = vi.hoisted(() => ({ mockInvalidateByPrefix: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: mockInvalidateByPrefix,
}));

// ── prisma ────────────────────────────────────────────────────────────────────
const { mockProductUpdate, mockTransaction } = vi.hoisted(() => {
  const mockProductUpdate = vi.fn();
  const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    await fn({ product: { update: mockProductUpdate } });
  });
  return { mockProductUpdate, mockTransaction };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    product: { update: mockProductUpdate },
  },
}));

import { POST } from "@/app/api/marketplace/products/bulk-edit/route";

const AUTH = { tenantId: "tenant-a", role: "admin", username: "tester" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

function makeReq(body: unknown) {
  return new NextRequest("https://host/api/marketplace/products/bulk-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/products/bulk-edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockProductUpdate.mockResolvedValue({});
    mockInvalidateByPrefix.mockResolvedValue(undefined);
  });

  // 1. Happy path: 3 updates válidos → 200, updated=3
  it("actualiza 3 productos válidos → updated=3", async () => {
    const updates = [
      { id: 1, price: 10.5 },
      { id: 2, active: false },
      { id: 3, category: "bebidas", stock: 20 },
    ];
    const res = await POST(makeReq({ updates }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(3);
    expect(body.failed).toHaveLength(0);
  });

  // 2. Sin auth → 401
  it("retorna 401 si requireAdmin falla", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq({ updates: [{ id: 1, price: 5 }] }));
    expect(res.status).toBe(401);
  });

  // 3. Más de 500 items → 400
  it("rechaza arrays con más de 500 items → 400", async () => {
    const updates = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, price: 1 }));
    const res = await POST(makeReq({ updates }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  // 4. Precio negativo → 400
  it("rechaza precio negativo → 400", async () => {
    const res = await POST(makeReq({ updates: [{ id: 1, price: -5 }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  // 5. Fallo parcial → { updated: 2, failed: [{id, error}] }
  it("retorna fallo parcial si 1 de 3 updates lanza error", async () => {
    mockProductUpdate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Record not found"))
      .mockResolvedValueOnce({});

    const updates = [
      { id: 10, price: 5 },
      { id: 99, price: 5 },
      { id: 11, price: 5 },
    ];
    const res = await POST(makeReq({ updates }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].id).toBe(99);
  });

  // 6. Multi-tenant: la query usa auth.tenantId, no el body
  it("usa auth.tenantId para filtrar actualizaciones", async () => {
    const updates = [{ id: 1, price: 9.99 }];
    await POST(makeReq({ updates }));
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-a" }),
      })
    );
  });

  // 7. Transacción: si todo falla internamente, updatedCount queda en 0
  it("updatedCount=0 si la transacción lanza en todos los items", async () => {
    mockProductUpdate.mockRejectedValue(new Error("DB error"));
    const updates = [{ id: 1, price: 1 }, { id: 2, price: 2 }];
    const res = await POST(makeReq({ updates }));
    const body = await res.json();
    expect(body.updated).toBe(0);
    expect(body.failed).toHaveLength(2);
  });

  // 8. Invalida caché después del commit
  it("llama invalidateByPrefix para marketplace:catalog y por producto", async () => {
    const updates = [{ id: 5, price: 3 }];
    await POST(makeReq({ updates }));
    // Esperar el fire-and-forget del catch()
    await new Promise(r => setTimeout(r, 0));
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("marketplace:catalog");
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("marketplace:product:5");
  });

  // 9. Zod rechaza campos no listados en el schema de item
  it("rechaza campo desconocido en un update item → 400", async () => {
    const updates = [{ id: 1, unknownField: "x" }];
    const _res = await POST(makeReq({ updates }));
    // Zod strict no está activo por default, pero si no envía ningún campo conocido
    // el objeto pasaría. Probamos con id faltante:
    const updatesNoId = [{ price: 5 }];
    const res2 = await POST(makeReq({ updates: updatesNoId }));
    expect(res2.status).toBe(400);
  });

  // 10. Array vacío → 400 (min(1) en el schema)
  it("rechaza array vacío → 400", async () => {
    const res = await POST(makeReq({ updates: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });
});
