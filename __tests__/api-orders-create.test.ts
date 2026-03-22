/**
 * API /api/orders – unit tests (TDD)
 * Covers: POST validation (400), POST create (201), GET paginated list (admin)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mock: rate-limit — always allow ─────────────────────────────────────────
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

// ── Mock: resolve-tenant — always return "main" ──────────────────────────────
vi.mock("@/lib/resolve-tenant", () => ({
  resolveTenantSlug: vi.fn(async () => "main"),
}));

// ── Mock: logger — swallow all log output ────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock: sse-emitter — fire-and-forget, no-op ───────────────────────────────
vi.mock("@/lib/sse-emitter", () => ({
  emitAdminSSE: vi.fn(),
}));

// ── Mock: mailer — no-op ─────────────────────────────────────────────────────
vi.mock("@/lib/mailer", () => ({
  sendOrderNotification: vi.fn(async () => {}),
}));

// ── Mock: whatsapp — no-op ───────────────────────────────────────────────────
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppNotification: vi.fn(async () => {}),
  getWhatsAppLink: vi.fn(() => "https://wa.me/fake"),
}));

// ── Mock: push-sender — no-op ────────────────────────────────────────────────
vi.mock("@/lib/push-sender", () => ({
  sendPushToPhone: vi.fn(async () => {}),
}));

// ── Mock: activity-logger — no-op ────────────────────────────────────────────
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => {}),
}));

// ── Mock: plans — free plan with unlimited orders ────────────────────────────
vi.mock("@/lib/plans", () => ({
  getPlanLimits: vi.fn(() => ({ maxOrdersPerMonth: -1 })),
  withinLimit: vi.fn((current: number, max: number) => max === -1 || current < max),
  planLimitPayload: vi.fn(() => ({ error: "Límite del plan alcanzado" })),
}));

// ── Mock: cache — pass-through (execute the fn immediately) ──────────────────
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
}));

// ── Mock: require-admin — default: authenticated ─────────────────────────────
const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

// ── Mock: jsondb (OrdersDB, CouponsDB, PromotionsDB) ─────────────────────────
const { mockOrdersAdd, mockOrdersGetAll, mockOrdersGetPage, mockOrdersGetAllFiltered,
        mockOrdersGetByCustomerPhone, mockCouponsGetByCode, mockCouponsRedeem,
        mockCouponsAdd, mockPromotionsGetAll } = vi.hoisted(() => ({
  mockOrdersAdd:                vi.fn(),
  mockOrdersGetAll:             vi.fn(),
  mockOrdersGetPage:            vi.fn(),
  mockOrdersGetAllFiltered:     vi.fn(),
  mockOrdersGetByCustomerPhone: vi.fn(),
  mockCouponsGetByCode:         vi.fn(),
  mockCouponsRedeem:            vi.fn(async () => {}),
  mockCouponsAdd:               vi.fn(async () => {}),
  mockPromotionsGetAll:         vi.fn(),
}));

vi.mock("@/lib/jsondb", () => ({
  OrdersDB: {
    add:                 mockOrdersAdd,
    getAll:              mockOrdersGetAll,
    getPage:             mockOrdersGetPage,
    getAllFiltered:       mockOrdersGetAllFiltered,
    getByCustomerPhone:  mockOrdersGetByCustomerPhone,
  },
  CouponsDB: {
    getByCode: mockCouponsGetByCode,
    redeem:    mockCouponsRedeem,
    add:       mockCouponsAdd,
  },
  PromotionsDB: {
    getAll: mockPromotionsGetAll,
  },
}));

// ── Mock: prisma ──────────────────────────────────────────────────────────────
const { mockOrderFindFirst, mockTenantFindFirst, mockProductFindMany,
        mockOrderCount, mockCustomerFindUnique, mockCustomerNotifCreate } = vi.hoisted(() => ({
  mockOrderFindFirst:       vi.fn(),
  mockTenantFindFirst:      vi.fn(),
  mockProductFindMany:      vi.fn(),
  mockOrderCount:           vi.fn(),
  mockCustomerFindUnique:   vi.fn(),
  mockCustomerNotifCreate:  vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findFirst: mockOrderFindFirst,
      count:     mockOrderCount,
    },
    tenant: {
      findFirst: mockTenantFindFirst,
    },
    product: {
      findMany: mockProductFindMany,
    },
    customer: {
      findUnique: mockCustomerFindUnique,
    },
    customerNotification: {
      create: mockCustomerNotifCreate,
    },
  },
}));

// ── Import handler AFTER all mocks are set up ─────────────────────────────────
import { POST, GET } from "@/app/api/orders/route";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_AUTH = { tenantId: "main", role: "admin", username: "testadmin" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

function makePostReq(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("https://host/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeGetReq(queryString = ""): NextRequest {
  return new NextRequest(`https://host/api/orders${queryString}`, {
    method: "GET",
  });
}

/** A minimal valid order payload that satisfies OrderPostSchema */
const VALID_ITEM = {
  id: 1,
  name: "Arroz 1kg",
  price: 5.5,
  quantity: 2,
  unit: "kg",
};

const VALID_BODY = {
  customer: {
    name: "Juan Pérez",
    phone: "987654321",
  },
  items: [VALID_ITEM],
  total: 11.0,
};

/** A fake saved order returned by OrdersDB.add() */
const SAVED_ORDER = {
  id: "ord-1234567890-abc",
  customer: {
    name: "Juan Pérez",
    phone: "987654321",
    location: "",
    reference: "",
  },
  items: [{ id: 1, name: "Arroz 1kg", price: 5.5, quantity: 2, unit: "kg", image: "" }],
  total: 11.0,
  totalCogs: 7.7,
  status: "pendiente",
  paymentMethod: "efectivo",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default prisma returns: no idempotency duplicate, free tenant, no products, customer allows notifs
    mockOrderFindFirst.mockResolvedValue(null);
    mockTenantFindFirst.mockResolvedValue({ plan: "free" });
    mockProductFindMany.mockResolvedValue([]);
    mockCustomerFindUnique.mockResolvedValue(null);
    mockCustomerNotifCreate.mockResolvedValue({});
    // Default OrdersDB mocks
    mockOrdersAdd.mockResolvedValue(SAVED_ORDER);
    mockOrdersGetByCustomerPhone.mockResolvedValue([SAVED_ORDER]);
    // Default coupons / promos — nothing applied
    mockCouponsGetByCode.mockResolvedValue(null);
    mockPromotionsGetAll.mockResolvedValue([]);
  });

  // ── 1. Missing required fields ─────────────────────────────────────────────

  describe("400 – missing required fields", () => {
    it("returns 400 when body is an empty object", async () => {
      const res = await POST(makePostReq({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when customer.name is missing", async () => {
      const res = await POST(makePostReq({
        customer: { phone: "987654321" },
        items: [VALID_ITEM],
        total: 11.0,
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when items field is missing entirely", async () => {
      const res = await POST(makePostReq({
        customer: { name: "Ana García" },
        total: 10,
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 when total is missing", async () => {
      const res = await POST(makePostReq({
        customer: { name: "Ana García" },
        items: [VALID_ITEM],
      }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when paymentMethod is invalid", async () => {
      const res = await POST(makePostReq({
        ...VALID_BODY,
        paymentMethod: "tarjeta", // not in enum
      }));
      expect(res.status).toBe(400);
    });
  });

  // ── 2. Empty items array ───────────────────────────────────────────────────

  describe("400 – empty items array", () => {
    it("returns 400 when items array is empty", async () => {
      const res = await POST(makePostReq({
        customer: { name: "Juan Pérez" },
        items: [],
        total: 0,
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });
  });

  // ── 3. Item field validation ───────────────────────────────────────────────

  describe("400 – invalid item fields", () => {
    it("returns 400 when item.name is empty", async () => {
      const res = await POST(makePostReq({
        ...VALID_BODY,
        items: [{ ...VALID_ITEM, name: "" }],
      }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when item.quantity is less than 1", async () => {
      const res = await POST(makePostReq({
        ...VALID_BODY,
        items: [{ ...VALID_ITEM, quantity: 0 }],
      }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when item.price is negative", async () => {
      const res = await POST(makePostReq({
        ...VALID_BODY,
        items: [{ ...VALID_ITEM, price: -1 }],
      }));
      expect(res.status).toBe(400);
    });
  });

  // ── 4. Successful order creation ───────────────────────────────────────────

  describe("201 – successful order creation", () => {
    it("creates an order and returns 201 with the saved order", async () => {
      const res = await POST(makePostReq(VALID_BODY));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.status).toBe("pendiente");
      expect(body.customer.name).toBe("Juan Pérez");
      expect(mockRequireAdmin).not.toHaveBeenCalled();
    });

    it("returns 201 with correct total from items (ignoring client-provided total)", async () => {
      // Server recomputes total = 5.5 * 2 = 11.0
      mockOrdersAdd.mockResolvedValue({ ...SAVED_ORDER, total: 11.0 });
      const res = await POST(makePostReq({ ...VALID_BODY, total: 999 })); // wrong client hint
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.total).toBe(11.0);
      // Verify the handler passed the server-recomputed total to OrdersDB.add, not the client's 999
      const callArg = mockOrdersAdd.mock.calls[0][0]; // first arg = order object
      expect(callArg.total).toBeCloseTo(11.0);
    });

    it("creates order with paymentMethod yape", async () => {
      mockOrdersAdd.mockResolvedValue({ ...SAVED_ORDER, paymentMethod: "yape" });
      const res = await POST(makePostReq({ ...VALID_BODY, paymentMethod: "yape" }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.paymentMethod).toBe("yape");
    });

    it("accepts order with optional notes and deliverySlot", async () => {
      const res = await POST(makePostReq({
        ...VALID_BODY,
        notes: "Sin cebolla por favor",
        deliverySlot: "09:00 - 12:00",
      }));
      expect(res.status).toBe(201);
    });

    it("returns 200 (idempotent) when same idempotency-key is reused", async () => {
      mockOrderFindFirst.mockResolvedValue(SAVED_ORDER); // simulate duplicate
      const res = await POST(makePostReq(VALID_BODY, { "x-idempotency-key": "idem-key-abc" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(SAVED_ORDER.id);
      expect(mockOrdersAdd).not.toHaveBeenCalled();
    });

    it("calls OrdersDB.add once with correct tenant", async () => {
      await POST(makePostReq(VALID_BODY));
      expect(mockOrdersAdd).toHaveBeenCalledTimes(1);
      // Second arg to add() is tenantId
      expect(mockOrdersAdd).toHaveBeenCalledWith(
        expect.objectContaining({ customer: expect.objectContaining({ name: "Juan Pérez" }) }),
        "main",
      );
    });
  });

  // ── 5. Order without customer phone (anonymous) ────────────────────────────

  describe("201 – order without customer phone", () => {
    it("creates order without phone and returns 201", async () => {
      const anonymousOrder = {
        ...SAVED_ORDER,
        customer: { name: "Cliente Anónimo", phone: undefined, location: "", reference: "" },
      };
      mockOrdersAdd.mockResolvedValue(anonymousOrder);
      const res = await POST(makePostReq({
        customer: { name: "Cliente Anónimo" },
        items: [VALID_ITEM],
        total: 11.0,
      }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.customer.name).toBe("Cliente Anónimo");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders — paginated admin list
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN_AUTH);
    mockOrdersGetAllFiltered.mockResolvedValue([SAVED_ORDER]);
    mockOrdersGetPage.mockResolvedValue({ orders: [SAVED_ORDER], nextCursor: null, total: 1 });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });

  it("returns all orders when no query params (legacy path)", async () => {
    mockOrdersGetAllFiltered.mockResolvedValue([SAVED_ORDER, SAVED_ORDER]);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(res.headers.get("X-Total-Count")).toBe("2");
  });

  it("returns paginated orders with X-Total-Count header when limit is set", async () => {
    mockOrdersGetAllFiltered.mockResolvedValue([SAVED_ORDER]);
    const res = await GET(makeGetReq("?limit=10&page=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(res.headers.get("X-Total-Count")).toBeDefined();
    expect(res.headers.get("X-Page")).toBe("1");
    expect(res.headers.get("X-Limit")).toBe("10");
  });

  it("returns cursor-paginated orders when limit is set without page", async () => {
    const res = await GET(makeGetReq("?limit=5"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(res.headers.get("X-Next-Cursor")).toBeDefined();
  });

  it("returns empty array when no orders exist", async () => {
    mockOrdersGetAllFiltered.mockResolvedValue([]);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
    expect(res.headers.get("X-Total-Count")).toBe("0");
  });

  it("returns 503 when DB throws", async () => {
    mockOrdersGetAllFiltered.mockRejectedValue(new Error("DB connection error"));
    const res = await GET(makeGetReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Database error");
  });
});
