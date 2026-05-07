/**
 * mp-hijack-guard.test.ts
 *
 * Cobertura: POST /api/marketplace/payment/mercadopago/create-preference
 * Guard anti-hijack: customerPhone del payload debe coincidir con el de la orden.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown, _traceId?: string) => ({
    payload: { error: String(err) },
    status:  500,
  })),
  newTraceId: vi.fn(() => "trace-test"),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

// ── Mock MercadoPago ──────────────────────────────────────────────────────────

const { mockPreferenceCreate } = vi.hoisted(() => ({
  mockPreferenceCreate: vi.fn(),
}));

vi.mock("mercadopago", () => {
  const PreferenceMock = function PreferenceMock(this: Record<string, unknown>) {
    this.create = mockPreferenceCreate;
  };
  return { Preference: PreferenceMock };
});

vi.mock("@/lib/mercadopago", () => ({
  mpClient: {},
}));

// ── Mocks DB ──────────────────────────────────────────────────────────────────

const { mockGetBySlug } = vi.hoisted(() => ({
  mockGetBySlug: vi.fn(),
}));

vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB: {
    getBySlug: mockGetBySlug,
  },
}));

const { mockOrdersDBGetById } = vi.hoisted(() => ({
  mockOrdersDBGetById: vi.fn(),
}));

vi.mock("@/lib/db/orders.db", () => ({
  OrdersDB: {
    getById: mockOrdersDBGetById,
  },
}));

import { POST } from "@/app/api/marketplace/payment/mercadopago/create-preference/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STORE = {
  id: "store-1", tenantId: "tenant-1", name: "Bodega Test",
  slug: "bodega-test", isPublished: true, commission: 5,
  rating: 4.0, reviewCount: 5,
};

// Orden con teléfono normalizado (últimos 9 dígitos)
const ORDER = {
  id: "order-123",
  tenantId: "tenant-1",
  total: 45.5,
  customer: { phone: "51987654321" }, // prefijo "51" incluido
  items: [
    { name: "Arroz", quantity: 2, price: 15 },
    { name: "Aceite", quantity: 1, price: 15.5 },
  ],
  status: "pendiente",
};

const VALID_BODY = {
  storeSlug:     "bodega-test",
  storeName:     "Bodega Test",
  customerName:  "Luis Torres",
  customerPhone: "987654321",     // sin prefijo — últimos 9 dígitos coinciden
  orderId:       "order-123",
};

function makeReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/marketplace/payment/mercadopago/create-preference", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/payment/mercadopago/create-preference — phone guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBySlug.mockResolvedValue(STORE);
    mockOrdersDBGetById.mockResolvedValue(ORDER);
    mockPreferenceCreate.mockResolvedValue({
      id:                 "pref-abc",
      init_point:         "https://mp.me/pay/abc",
      sandbox_init_point: "https://sandbox.mp.me/pay/abc",
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("phone match (últimos 9 dígitos) → 200 con preferenceId", async () => {
    const res = await POST(makeReq(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferenceId).toBe("pref-abc");
    expect(body.initPoint).toBeDefined();
  });

  it("phone con prefijo 51 en payload también funciona", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, customerPhone: "51987654321" }));

    expect(res.status).toBe(200);
  });

  // ── Anti-hijack ───────────────────────────────────────────────────────────

  it("customerPhone distinto al de la orden → 403 'Datos de orden no coinciden'", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, customerPhone: "911111111" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/coinciden/i);
  });

  it("customerPhone vacío → 403", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, customerPhone: "000000000" }));

    expect(res.status).toBe(403);
  });

  it("OrdersDB.getById recibe tenantId del store (no del payload)", async () => {
    await POST(makeReq(VALID_BODY));

    expect(mockOrdersDBGetById).toHaveBeenCalledWith("tenant-1", "order-123");
  });

  // ── Cross-tenant / not found ──────────────────────────────────────────────

  it("orden de otro tenant → OrdersDB retorna null → 404", async () => {
    mockOrdersDBGetById.mockResolvedValue(null);

    const res = await POST(makeReq(VALID_BODY));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no encontrada/i);
  });

  it("store no encontrado (slug inválido) → 404", async () => {
    mockGetBySlug.mockResolvedValue(null);

    const res = await POST(makeReq(VALID_BODY));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tienda/i);
  });

  // ── Schema Zod ────────────────────────────────────────────────────────────

  it("sin orderId → 400 (Zod safeParse falla)", async () => {
    const { orderId: _, ...noOrder } = VALID_BODY;

    const res = await POST(makeReq(noOrder));

    expect(res.status).toBe(400);
  });

  it("customerPhone demasiado corto (<6) → 400", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, customerPhone: "123" }));

    expect(res.status).toBe(400);
  });

  // ── Items y total desde DB (nunca del cliente) ────────────────────────────

  it("preference.create recibe items de la DB, no del payload", async () => {
    await POST(makeReq(VALID_BODY));

    const callArg = mockPreferenceCreate.mock.calls[0][0].body;
    // Los items deben venir de ORDER.items, no de ningún campo del payload
    expect(callArg.items).toHaveLength(2);
    expect(callArg.items[0].title).toContain("Arroz");
    expect(callArg.items[1].title).toContain("Aceite");
  });

  it("external_reference incluye storeSlug::orderId", async () => {
    await POST(makeReq(VALID_BODY));

    const callArg = mockPreferenceCreate.mock.calls[0][0].body;
    expect(callArg.external_reference).toBe("bodega-test::order-123");
  });
});
