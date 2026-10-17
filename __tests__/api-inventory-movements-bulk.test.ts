/**
 * API /api/inventory-movements – bulk-adjust tests
 * Covers: auth, Zod validation, succeededIds, partial failure, all-fail
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
// Los casos b-9 hacen más de 10 pedidos seguidos: el límite real devolvía 429.
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(async () => null) }));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockAdjust, mockRecord, mockList } = vi.hoisted(() => ({
  mockAdjust: vi.fn(),
  mockRecord: vi.fn(),
  mockList: vi.fn(),
}));
vi.mock("@/lib/jsondb", () => ({
  InventoryMovementsDB: {
    adjust: mockAdjust,
    record: mockRecord,
    list: mockList,
  },
}));

import { POST } from "@/app/api/inventory-movements/route";

const AUTH = { tenantId: "main", role: "admin", username: "test" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://host/api/inventory-movements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BULK_BODY = {
  action: "bulk-adjust",
  /** b-9 (17-10): la fila sin motivo propio usa el del lote. */
  motivo: "Conteo físico",
  items: [
    { productId: 1, newStock: 10, notes: "conteo 1" },
    { productId: 2, newStock: 20, notes: "conteo 2" },
    { productId: 3, newStock: 5 },
  ],
};

// ── Auth ─────────────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – auth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq(BULK_BODY));
    expect(res.status).toBe(401);
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns 400 when items array is empty", async () => {
    const res = await POST(makeReq({ action: "bulk-adjust", items: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when items is missing", async () => {
    const res = await POST(makeReq({ action: "bulk-adjust" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when productId is not a positive integer", async () => {
    const res = await POST(makeReq({ action: "bulk-adjust", items: [{ productId: -1, newStock: 10 }] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when newStock is negative", async () => {
    const res = await POST(makeReq({ action: "bulk-adjust", items: [{ productId: 1, newStock: -5 }] }));
    expect(res.status).toBe(400);
  });
});

// ── Success cases ─────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – all succeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns 201 with correct succeeded/failed counts", async () => {
    mockAdjust.mockResolvedValue(undefined);
    const res = await POST(makeReq(BULK_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.succeeded).toBe(3);
    expect(body.failed).toBe(0);
  });

  it("returns succeededIds containing all productIds when all pass", async () => {
    mockAdjust.mockResolvedValue(undefined);
    const res = await POST(makeReq(BULK_BODY));
    const body = await res.json();
    expect(body.succeededIds).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(body.succeededIds).toHaveLength(3);
  });

  it("calls adjust once per item with correct args", async () => {
    mockAdjust.mockResolvedValue(undefined);
    await POST(makeReq(BULK_BODY));
    expect(mockAdjust).toHaveBeenCalledTimes(3);
    expect(mockAdjust).toHaveBeenCalledWith(1, 10, "main", undefined, "conteo 1", "test");
    expect(mockAdjust).toHaveBeenCalledWith(2, 20, "main", undefined, "conteo 2", "test");
    expect(mockAdjust).toHaveBeenCalledWith(3, 5, "main", undefined, "Conteo físico", "test");
  });
});

// ── Partial failure ────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – partial failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns succeeded=2 failed=1 when middle item throws", async () => {
    mockAdjust
      .mockResolvedValueOnce(undefined)         // productId 1 – OK
      .mockRejectedValueOnce(new Error("DB error")) // productId 2 – FAIL
      .mockResolvedValueOnce(undefined);         // productId 3 – OK
    const res = await POST(makeReq(BULK_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(1);
  });

  it("succeededIds excludes the failed productId", async () => {
    mockAdjust
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce(undefined);
    const res = await POST(makeReq(BULK_BODY));
    const body = await res.json();
    expect(body.succeededIds).toContain(1);
    expect(body.succeededIds).not.toContain(2);
    expect(body.succeededIds).toContain(3);
  });
});

// ── All fail ──────────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – all fail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns succeeded=0 failed=3 with empty succeededIds", async () => {
    mockAdjust.mockRejectedValue(new Error("DB down"));
    const res = await POST(makeReq(BULK_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(3);
    expect(body.succeededIds).toEqual([]);
  });
});

// ── b-9 (Brandon 17-10, «Motivo siempre»): ajustar stock a mano exige el porqué ──

describe("POST /api/inventory-movements – b-9 motivo obligatorio al ajustar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockAdjust.mockResolvedValue({ id: "mv1" });
    mockRecord.mockResolvedValue({ id: "mv2" });
  });

  it("adjust sin motivo, vacío o sin 3 letras/números → 400 con su mensaje y sin tocar el stock", async () => {
    for (const notes of [undefined, "", "  ", "--", "a b"]) {
      const res = await POST(makeReq({ action: "adjust", productId: 1, newStock: 4, ...(notes === undefined ? {} : { notes }) }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/motivo/i);
    }
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it("adjust con motivo → 201 y el motivo en una línea", async () => {
    const res = await POST(makeReq({ action: "adjust", productId: 1, newStock: 4, notes: " se rompió\n una botella " }));
    expect(res.status).toBe(201);
    expect(mockAdjust).toHaveBeenCalledWith(1, 4, "main", undefined, "se rompió una botella", "test");
  });

  it("bulk-adjust sin motivo del lote ni de la fila → 400; ninguna fila se ajusta", async () => {
    const res = await POST(makeReq({ action: "bulk-adjust", items: [{ productId: 1, newStock: 2, notes: "conteo" }, { productId: 2, newStock: 3 }] }));
    expect(res.status).toBe(400);
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it("movimiento ajuste_positivo / ajuste_negativo sin motivo → 400; con motivo → 201", async () => {
    for (const type of ["ajuste_positivo", "ajuste_negativo"]) {
      const sin = await POST(makeReq({ productId: 1, type, quantity: 2, reference: "F001-12" }));
      expect(sin.status).toBe(400);
      expect((await sin.json()).error).toMatch(/motivo/i);
    }
    expect(mockRecord).not.toHaveBeenCalled();
    const con = await POST(makeReq({ productId: 1, type: "ajuste_negativo", quantity: 2, notes: "se vencieron" }));
    expect(con.status).toBe(201);
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ type: "ajuste_negativo", notes: "se vencieron", tenantId: "main" }));
  });

  it("compra o pérdida no piden motivo (la compra trae su referencia; la pérdida, su causa)", async () => {
    expect((await POST(makeReq({ productId: 1, type: "compra", quantity: 5, reference: "F001-9" }))).status).toBe(201);
    expect((await POST(makeReq({ productId: 1, type: "merma", lossType: "damage", quantity: 1 }))).status).toBe(201);
  });
});
