/**
 * Regression tests para los HOTFIX de aislamiento multi-tenant del 2026-04-29.
 * Cada test valida que un endpoint NO leakea datos cross-tenant ni acepta
 * inputs maliciosos. Si alguno falla, hay riesgo de demanda Ley 29733 PE.
 *
 * Cubre los hotfixes documentados en ADR-082:
 *   C1 — MP webhook secret obligatorio + tenantId scope
 *   C3 — customer-lookup filtra por tenantId
 *   C4 — cart/restore post-validacion store.tenantId
 *   C5 — loyalty read publico no expone PII
 *   M3 — coupons/[id] DELETE pattern updateMany TOCTOU-safe
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

// ── Mocks centralizados de Prisma ────────────────────────────────────────────

const prismaMocks = {
  customerFindFirst: vi.fn(),
  customerFindUnique: vi.fn(),
  abandonedCartFindFirst: vi.fn(),
  storeFindFirst: vi.fn(),
  couponFindFirst: vi.fn(),
  couponDeleteMany: vi.fn(),
  couponUpdateMany: vi.fn(),
  orderUpdateMany: vi.fn(),
  orderFindFirst: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      findFirst: (...a: unknown[]) => prismaMocks.customerFindFirst(...a),
      findUnique: (...a: unknown[]) => prismaMocks.customerFindUnique(...a),
    },
    marketplaceAbandonedCart: {
      findFirst: (...a: unknown[]) => prismaMocks.abandonedCartFindFirst(...a),
    },
    store: {
      findFirst: (...a: unknown[]) => prismaMocks.storeFindFirst(...a),
    },
    coupon: {
      findFirst: (...a: unknown[]) => prismaMocks.couponFindFirst(...a),
      deleteMany: (...a: unknown[]) => prismaMocks.couponDeleteMany(...a),
      updateMany: (...a: unknown[]) => prismaMocks.couponUpdateMany(...a),
    },
    order: {
      updateMany: (...a: unknown[]) => prismaMocks.orderUpdateMany(...a),
      findUnique: vi.fn(async () => null),
    },
    tenant: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

vi.mock("@/lib/mercadopago", () => ({
  getMercadoPagoPayment: vi.fn(),
  verifyMPWebhookSignature: vi.fn(),
}));

vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppQueued: vi.fn() }));
vi.mock("@/lib/push-sender", () => ({ sendPushToPhone: vi.fn() }));
vi.mock("@/lib/create-notification", () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/loyalty.db", () => ({
  LoyaltyDB: {
    getHistory: vi.fn(async () => ({ transactions: [], balance: 0, total: 0 })),
  },
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "tenant-A", username: "qa", role: "admin" })),
}));
vi.mock("@/lib/api-error", () => ({
  newTraceId: () => "trace-test",
  toErrorPayload: (err: unknown) => ({
    payload: { error: String(err) },
    status: 500,
  }),
  ApiError: class ApiError extends Error {
    httpStatus = 500;
    toPayload() { return { error: this.message }; }
  },
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));

// Wave 8 (2026-04-29): coupons/[id] usa CouponsDB.{getById,setActive,delete}.
// Routeamos los mocks a las llamadas equivalentes de prisma.coupon para
// preservar las assertions existentes (toHaveBeenCalledWith en couponFindFirst,
// couponUpdateMany, couponDeleteMany).
vi.mock("@/lib/db/coupons.db", () => ({
  CouponsDB: {
    getById: async (tenantId: string, id: string) => {
      const row = await prismaMocks.couponFindFirst({ where: { id, tenantId } });
      return row ?? null;
    },
    setActive: async (tenantId: string, id: string, active: boolean) => {
      const result = await prismaMocks.couponUpdateMany({
        where: { id, tenantId },
        data: { active },
      });
      return result?.count === 0 ? null : active;
    },
    delete: async (tenantId: string, id: string) => {
      const result = await prismaMocks.couponDeleteMany({ where: { id, tenantId } });
      return (result?.count ?? 0) > 0;
    },
    findByCode: vi.fn(),
    list: vi.fn(),
    listByStore: vi.fn(),
    create: vi.fn(),
    incrementUsage: vi.fn(),
  },
}));

// Wave 8: marketplace endpoints usan MarketplaceStoresDB.getBySlug; routeamos
// al storeFindFirst para preservar las assertions actuales.
vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB: {
    getBySlug: async (slug: string) => prismaMocks.storeFindFirst({ where: { slug } }),
    getByTenantId: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
  },
  MarketplaceStoreProductsDB: {},
  MarketplaceOrdersDB: {},
  MarketplaceReviewsDB: {},
  MarketplaceAbandonedCartsDB: {},
}));

// Wave 8: payment/mp/create-preference usa OrdersDB.getById.
vi.mock("@/lib/db/orders.db", () => ({
  OrdersDB: {
    getById: async (tenantId: string, id: string) => {
      const row = await prismaMocks.orderFindFirst?.({ where: { id, tenantId } });
      return row ?? null;
    },
  },
  DeliverySlotsDB: {},
  ReturnsDB: {},
}));

beforeEach(async () => {
  Object.values(prismaMocks).forEach((m) => m.mockReset());
  // Reset requireAdmin mock — los `mockResolvedValueOnce` de un test pueden
  // sobrevivir y contaminar al siguiente.
  const mod = await import("@/lib/require-admin");
  const fn = mod.requireAdmin as unknown as ReturnType<typeof vi.fn>;
  fn.mockReset();
  fn.mockResolvedValue({ tenantId: "tenant-A", username: "qa", role: "admin" });
});

function buildReq(url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): NextRequest {
  const req = new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return req as unknown as NextRequest;
}

// ── C3: customer-lookup filtra por tenantId ─────────────────────────────────

describe("HOTFIX-C3 — customer-lookup tenantId filter", () => {
  it("retorna null si el customer existe en OTRO tenant", async () => {
    // El mock devuelve null porque findFirst({phone, tenantId}) no encuentra
    // al customer dentro del tenant del request.
    prismaMocks.customerFindFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/auth/customer-lookup/route");
    const req = buildReq(
      "http://localhost/api/auth/customer-lookup?phone=51999000111",
      "GET",
      undefined,
      { "x-tenant-id": "tenant-A" },
    );
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.customer).toBeNull();
    // Critico: la query DEBE incluir tenantId (no findUnique({phone}) global).
    expect(prismaMocks.customerFindFirst).toHaveBeenCalledWith({
      where: { phone: "51999000111", tenantId: "tenant-A" },
      select: { name: true, tipoDocumento: true, documento: true },
    });
  });

  it("retorna customer con datos si pertenece al tenant del request", async () => {
    prismaMocks.customerFindFirst.mockResolvedValue({
      name: "Juan",
      tipoDocumento: "DNI",
      documento: "12345678",
    });

    const { GET } = await import("@/app/api/auth/customer-lookup/route");
    const req = buildReq(
      "http://localhost/api/auth/customer-lookup?phone=51999000111",
      "GET",
      undefined,
      { "x-tenant-id": "tenant-A" },
    );
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.customer).toEqual({ name: "Juan", dni: "12345678" });
  });

  it("retorna null si no hay tenantId en el request", async () => {
    const { GET } = await import("@/app/api/auth/customer-lookup/route");
    const req = buildReq(
      "http://localhost/api/auth/customer-lookup?phone=51999000111",
      "GET",
    );
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.customer).toBeNull();
    // Crucial: NO ejecuta query si no hay tenant — antes hacia findUnique global.
    expect(prismaMocks.customerFindFirst).not.toHaveBeenCalled();
  });
});

// ── C4: cart/restore post-validacion store.tenantId ─────────────────────────

describe("HOTFIX-C4 — marketplace/cart/restore store.tenantId check", () => {
  it("devuelve items vacios si el store del cart pertenece a OTRO tenant", async () => {
    prismaMocks.abandonedCartFindFirst.mockResolvedValue({
      storeSlug: "tienda-victima",
      customerName: "Juan",
      itemsJson: "[]",
      total: 100,
    });
    // store.findFirst({slug, tenantId}) devuelve null → carrito de otro tenant.
    prismaMocks.storeFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/marketplace/cart/restore/route");
    const req = buildReq(
      "http://localhost/api/marketplace/cart/restore",
      "POST",
      { phone: "51999000111" },
      { "x-tenant-id": "tenant-A" },
    );
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.items).toEqual([]);
    expect(json.customerName).toBeUndefined();
    expect(json.storeSlug).toBeUndefined();
  });

  it("devuelve cart si pertenece al tenant del request", async () => {
    prismaMocks.abandonedCartFindFirst.mockResolvedValue({
      storeSlug: "tienda-mia",
      customerName: "Juan",
      itemsJson: '[{"id": 1}]',
      total: 100,
    });
    prismaMocks.storeFindFirst.mockResolvedValue({ id: "store-X" });

    const { POST } = await import("@/app/api/marketplace/cart/restore/route");
    const req = buildReq(
      "http://localhost/api/marketplace/cart/restore",
      "POST",
      { phone: "51999000111" },
      { "x-tenant-id": "tenant-A" },
    );
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.storeSlug).toBe("tienda-mia");
    expect(json.customerName).toBe("Juan");
  });
});

// ── C5: cobertura via customer-lookup ya valida el patrón de filtro.
// El flow completo de loyalty (PII gating en read público vs admin)
// requiere mocks especificos del schema Zod + LoyaltyDB y se cubre en
// el test dedicado __tests__/api-marketplace-loyalty.test.ts.

// ── C1: MP webhook requiere secret ──────────────────────────────────────────

describe("HOTFIX-C1 — MP webhook secret obligatorio", () => {
  it("returns 503 si MERCADOPAGO_WEBHOOK_SECRET no esta seteado", async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;

    const { POST } = await import("@/app/api/marketplace/payment/mercadopago/webhook/route");
    const req = buildReq(
      "http://localhost/api/marketplace/payment/mercadopago/webhook",
      "POST",
      { type: "payment", data: { id: "12345" } },
    );
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect(prismaMocks.orderUpdateMany).not.toHaveBeenCalled();
  });
});

// ── M3: coupons/[id] DELETE updateMany TOCTOU-safe ──────────────────────────

describe("HOTFIX-M3 — coupons/[id] DELETE updateMany pattern", () => {
  it("DELETE retorna 404 si deleteMany count=0 (cross-tenant)", async () => {
    prismaMocks.couponFindFirst.mockResolvedValue({ code: "TEST10" });
    prismaMocks.couponDeleteMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import("@/app/api/marketplace/coupons/[id]/route");
    const req = buildReq(
      "http://localhost/api/marketplace/coupons/cpn-1",
      "DELETE",
    );
    const res = await DELETE(req, { params: Promise.resolve({ id: "cpn-1" }) });
    expect(res.status).toBe(404);
    // Critico: deleteMany debe haberse llamado con tenantId en el where.
    expect(prismaMocks.couponDeleteMany).toHaveBeenCalledWith({
      where: { id: "cpn-1", tenantId: "tenant-A" },
    });
  });

  it("DELETE retorna 200 si deleteMany count>0 (mismo tenant)", async () => {
    prismaMocks.couponFindFirst.mockResolvedValue({ code: "TEST10" });
    prismaMocks.couponDeleteMany.mockResolvedValue({ count: 1 });

    const { DELETE } = await import("@/app/api/marketplace/coupons/[id]/route");
    const req = buildReq(
      "http://localhost/api/marketplace/coupons/cpn-1",
      "DELETE",
    );
    const res = await DELETE(req, { params: Promise.resolve({ id: "cpn-1" }) });
    expect(res.status).toBe(200);
  });
});
