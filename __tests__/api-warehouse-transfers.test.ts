/**
 * API /api/admin/warehouse-transfers – unit tests
 * Covers: auth, GET list, POST create, PATCH status update
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn() }));

const {
  mockTransferFindMany, mockTransferCreate, mockTransferUpdate, mockTransferCount,
  mockTransferFindUnique, mockWhFindUnique, mockLocationAggregate, mockLocationFindFirst,
  mockLocationUpdate, mockLocationCreate, mockProductUpdate, mockTransaction,
} = vi.hoisted(() => ({
  mockTransferFindMany: vi.fn(),
  mockTransferCreate: vi.fn(),
  mockTransferUpdate: vi.fn(),
  mockTransferCount: vi.fn(),
  mockTransferFindUnique: vi.fn(),
  mockWhFindUnique: vi.fn(),
  mockLocationAggregate: vi.fn(),
  mockLocationFindFirst: vi.fn(),
  mockLocationUpdate: vi.fn(),
  mockLocationCreate: vi.fn(),
  mockProductUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transfer: {
      findMany: mockTransferFindMany,
      create: mockTransferCreate,
      update: mockTransferUpdate,
      count: mockTransferCount,
      findUnique: mockTransferFindUnique,
    },
    warehouse: {
      findUnique: mockWhFindUnique,
    },
    location: {
      aggregate: mockLocationAggregate,
      findFirst: mockLocationFindFirst,
      update: mockLocationUpdate,
      create: mockLocationCreate,
    },
    product: {
      update: mockProductUpdate,
    },
    $transaction: mockTransaction,
  },
}));

import { GET, POST, PATCH } from "@/app/api/admin/warehouse-transfers/route";

const AUTH = { tenantId: "main", role: "admin", username: "test" };
const AUTH_ALMACENERO = { tenantId: "main", role: "almacenero", username: "test" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

const NOW = new Date("2026-01-01T00:00:00Z");
const FROM_WH = { id: "wh-1", name: "Almacén Principal" };
const TO_WH = { id: "wh-2", name: "Depósito Norte" };
const BASE_TRANSFER = {
  id: "tr-1",
  code: "TRF-0001",
  fromWarehouseId: "wh-1",
  toWarehouseId: "wh-2",
  fromWarehouse: FROM_WH,
  toWarehouse: TO_WH,
  product: { name: "Arroz" },
  productId: 10,
  quantity: 50,
  unit: "kg",
  status: "pendiente",
  notes: "",
  requestedBy: "admin",
  tenantId: "main",
  requestDate: NOW,
  deliveredDate: null,
  createdAt: NOW,
  updatedAt: NOW,
};

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/admin/warehouse-transfers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeReq("GET", "https://host/api/admin/warehouse-transfers"));
    expect(res.status).toBe(401);
  });

  it("returns empty list", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockTransferFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("GET", "https://host/api/admin/warehouse-transfers"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it("returns list mapped correctly", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockTransferFindMany.mockResolvedValue([BASE_TRANSFER]);
    const res = await GET(makeReq("GET", "https://host/api/admin/warehouse-transfers"));
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].fromName).toBe("Almacén Principal");
    expect(body.items[0].toName).toBe("Depósito Norte");
    expect(body.items[0].productName).toBe("Arroz");
  });

  it("almacenero role can list transfers", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ALMACENERO);
    mockTransferFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("GET", "https://host/api/admin/warehouse-transfers"));
    expect(res.status).toBe(200);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/admin/warehouse-transfers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouse-transfers", {
      fromWarehouseId: "wh-1", toWarehouseId: "wh-2", productId: 10, quantity: 50,
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing productId", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouse-transfers", {
      fromWarehouseId: "wh-1", toWarehouseId: "wh-2", quantity: 50,
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when same origin and destination", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouse-transfers", {
      fromWarehouseId: "wh-1", toWarehouseId: "wh-1", productId: 10, quantity: 50,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/mismo/);
  });

  it("returns 404 when origin warehouse not found", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockWhFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(TO_WH);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouse-transfers", {
      fromWarehouseId: "wh-999", toWarehouseId: "wh-2", productId: 10, quantity: 50,
    }));
    expect(res.status).toBe(404);
  });

  it("creates transfer successfully", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockWhFindUnique
      .mockResolvedValueOnce(FROM_WH)
      .mockResolvedValueOnce(TO_WH);
    mockLocationAggregate.mockResolvedValue({ _sum: { qty: 0 } }); // no location records → skip check
    mockTransferCount.mockResolvedValue(0);
    mockTransferCreate.mockResolvedValue(BASE_TRANSFER);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouse-transfers", {
      fromWarehouseId: "wh-1", toWarehouseId: "wh-2", productId: 10, quantity: 50, unit: "kg",
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toBe("TRF-0001");
    expect(body.status).toBe("pendiente");
    expect(body.productName).toBe("Arroz");
  });

  it("returns 409 when insufficient stock in origin warehouse", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockWhFindUnique
      .mockResolvedValueOnce(FROM_WH)
      .mockResolvedValueOnce(TO_WH);
    mockLocationAggregate.mockResolvedValue({ _sum: { qty: 10 } }); // only 10 in stock
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouse-transfers", {
      fromWarehouseId: "wh-1", toWarehouseId: "wh-2", productId: 10, quantity: 50,
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/insuficiente/i);
  });

  it("returns 400 for zero quantity", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouse-transfers", {
      fromWarehouseId: "wh-1", toWarehouseId: "wh-2", productId: 10, quantity: 0,
    }));
    expect(res.status).toBe(400);
  });});

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/warehouse-transfers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "completado" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { status: "completado" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("id requerido");
  });

  it("returns 400 for invalid status", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "invalido" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Estado inválido");
  });

  it("updates status to completado", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockTransferUpdate.mockResolvedValue({ ...BASE_TRANSFER, status: "completado", deliveredDate: NOW });
    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "completado" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("completado");
  });

  it("updates status to cancelado", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockTransferUpdate.mockResolvedValue({ ...BASE_TRANSFER, status: "cancelado" });
    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "cancelado" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("cancelado");
  });

  it("adjusts location stock when completing transfer (both locations exist)", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const completedTransfer = { ...BASE_TRANSFER, status: "completado", deliveredDate: NOW };
    mockTransferFindUnique.mockResolvedValue(BASE_TRANSFER);
    mockTransferUpdate.mockResolvedValue(completedTransfer);

    const fromLoc = { id: "loc-1", qty: 100, warehouseId: "wh-1", productId: 10, tenantId: "main" };
    const toLoc   = { id: "loc-2", qty: 20,  warehouseId: "wh-2", productId: 10, tenantId: "main" };
    // 3 calls: (1) stock-check origin, (2) fromLoc adjustment, (3) toLoc adjustment
    mockLocationFindFirst
      .mockResolvedValueOnce(fromLoc)  // stock check — qty 100 >= quantity 50, passes
      .mockResolvedValueOnce(fromLoc)  // fromLoc
      .mockResolvedValueOnce(toLoc);   // toLoc
    mockTransaction.mockResolvedValue([]);
    mockLocationAggregate.mockResolvedValue({ _sum: { qty: 120 } });
    mockProductUpdate.mockResolvedValue({});

    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "completado" }));
    expect(res.status).toBe(200);

    expect(mockTransaction).toHaveBeenCalledOnce();
    const ops = mockTransaction.mock.calls[0][0] as unknown[];
    // Two ops: update fromLoc (decrement) + update toLoc (increment)
    expect(ops).toHaveLength(2);
  });

  it("creates destination location when it does not exist", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const completedTransfer = { ...BASE_TRANSFER, status: "completado", deliveredDate: NOW };
    mockTransferFindUnique.mockResolvedValue(BASE_TRANSFER);
    mockTransferUpdate.mockResolvedValue(completedTransfer);

    const fromLoc = { id: "loc-1", qty: 100, warehouseId: "wh-1", productId: 10, tenantId: "main" };
    // 3 calls: (1) stock-check origin (sufficient), (2) fromLoc, (3) toLoc (not found)
    mockLocationFindFirst
      .mockResolvedValueOnce(fromLoc)  // stock check passes
      .mockResolvedValueOnce(fromLoc)  // fromLoc
      .mockResolvedValueOnce(null);    // toLoc — not found, will be created
    mockTransaction.mockResolvedValue([]);
    mockLocationAggregate.mockResolvedValue({ _sum: { qty: 50 } });
    mockProductUpdate.mockResolvedValue({});

    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "completado" }));
    expect(res.status).toBe(200);

    expect(mockTransaction).toHaveBeenCalledOnce();
    const ops = mockTransaction.mock.calls[0][0] as unknown[];
    // Two ops: update fromLoc + create toLoc
    expect(ops).toHaveLength(2);
  });

  it("succeeds even when no location records exist (best-effort)", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockTransferFindUnique.mockResolvedValue(BASE_TRANSFER);
    mockTransferUpdate.mockResolvedValue({ ...BASE_TRANSFER, status: "completado", deliveredDate: NOW });
    // All findFirst calls return null: stock check skipped (no record = untracked), fromLoc unset, toLoc created
    mockLocationFindFirst.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([]);
    mockLocationAggregate.mockResolvedValue({ _sum: { qty: 0 } });
    mockProductUpdate.mockResolvedValue({});

    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "completado" }));
    expect(res.status).toBe(200);

    // Transaction called with only the create op (no fromLoc to update)
    expect(mockTransaction).toHaveBeenCalledOnce();
    const ops = mockTransaction.mock.calls[0][0] as unknown[];
    expect(ops).toHaveLength(1); // only destination create
  });

  it("skips stock adjustment entirely when transaction throws (best-effort)", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockTransferFindUnique.mockResolvedValue(BASE_TRANSFER);
    mockTransferUpdate.mockResolvedValue({ ...BASE_TRANSFER, status: "completado", deliveredDate: NOW });
    mockLocationFindFirst.mockResolvedValue(null); // stock check skipped; fromLoc=null; toLoc=null
    mockTransaction.mockRejectedValue(new Error("DB error"));
    mockProductUpdate.mockResolvedValue({});

    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "completado" }));
    // Should still return 200 — transfer status was already saved
    expect(res.status).toBe(200);
  });

  it("returns 409 when origin has insufficient stock", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    // BASE_TRANSFER.quantity = 50; origin only has 10
    mockTransferFindUnique.mockResolvedValue(BASE_TRANSFER);
    mockLocationFindFirst.mockResolvedValueOnce({ id: "loc-1", qty: 10, warehouseId: "wh-1", productId: 10, tenantId: "main" });

    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "completado" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/insuficiente/i);
    // transfer.update must NOT have been called
    expect(mockTransferUpdate).not.toHaveBeenCalled();
  });

  it("recalculates Product.stock as sum of all Location.qty after completion", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const completedTransfer = { ...BASE_TRANSFER, status: "completado", deliveredDate: NOW };
    mockTransferFindUnique.mockResolvedValue(BASE_TRANSFER);
    mockTransferUpdate.mockResolvedValue(completedTransfer);

    const fromLoc = { id: "loc-1", qty: 100, warehouseId: "wh-1", productId: 10, tenantId: "main" };
    const toLoc   = { id: "loc-2", qty: 20,  warehouseId: "wh-2", productId: 10, tenantId: "main" };
    mockLocationFindFirst
      .mockResolvedValueOnce(fromLoc)
      .mockResolvedValueOnce(fromLoc)
      .mockResolvedValueOnce(toLoc);
    mockTransaction.mockResolvedValue([]);
    // After transaction, all Location.qty for product 10 sums to 170
    mockLocationAggregate.mockResolvedValue({ _sum: { qty: 170 } });
    mockProductUpdate.mockResolvedValue({});

    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouse-transfers", { id: "tr-1", status: "completado" }));
    expect(res.status).toBe(200);

    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { stock: 170 },
    });
  });
});
