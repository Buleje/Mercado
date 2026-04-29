/**
 * E2E cross-tenant isolation suite — escenarios "atacante real".
 *
 * Setup: dos tenants ficticios A y B con un cliente que tiene EL MISMO phone
 * en ambos (`51999000111`). Cada test simula un atacante que pertenece al
 * tenant A intentando leer/mutar datos del tenant B usando endpoints públicos.
 *
 * Pasa = los handlers filtran correctamente y NO leakean. Si alguno falla,
 * hay regresion de los HOTFIX 2026-04-29 — riesgo Ley 29733 PE.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 100 })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

// ── Dual-tenant fixture ──────────────────────────────────────────────────────

const TENANT_A = "tenant-A-cuid";
const TENANT_B = "tenant-B-cuid";
const SHARED_PHONE = "51999000111";

// El customer existe en AMBOS tenants (modelo `Customer.phone @id` global
// permite hoy un solo registro — pero la query simulada distingue por tenantId).
const customerInTenantA = {
  phone: SHARED_PHONE,
  tenantId: TENANT_A,
  name: "Juan-A",
  tipoDocumento: "DNI",
  documento: "11111111",
  totalSpent: 100,
};
const customerInTenantB = {
  phone: SHARED_PHONE,
  tenantId: TENANT_B,
  name: "Juan-B",
  tipoDocumento: "DNI",
  documento: "22222222",
  totalSpent: 9999, // dato sensible que NO debe leakear al tenant A
};

const cartInTenantB = {
  storeSlug: "tienda-de-tenant-B",
  customerName: "Juan-B",
  customerPhone: SHARED_PHONE,
  itemsJson: '[{"id":1,"name":"item-secreto"}]',
  total: 500,
};

// Mocks de Prisma que SIMULAN el filtro tenantId. La intencion es que los
// tests fallen si el handler NO pasa tenantId al where.
const prismaMocks = {
  customerFindFirst: vi.fn(async ({ where }: { where: { phone?: string; tenantId?: string } }) => {
    if (where.phone === SHARED_PHONE && where.tenantId === TENANT_A) return customerInTenantA;
    if (where.phone === SHARED_PHONE && where.tenantId === TENANT_B) return customerInTenantB;
    return null;
  }),
  customerFindUnique: vi.fn(async ({ where }: { where: { phone?: string } }) => {
    // findUnique sin tenantId — esto seria EL BUG (devuelve cualquier match).
    // En produccion devolveria al primero por orden de inserción.
    if (where.phone === SHARED_PHONE) return customerInTenantB; // simula leak
    return null;
  }),
  abandonedCartFindFirst: vi.fn(async ({ where }: { where: { customerPhone?: string } }) => {
    if (where.customerPhone === SHARED_PHONE) return cartInTenantB;
    return null;
  }),
  storeFindFirst: vi.fn(async ({ where }: { where: { slug?: string; tenantId?: string } }) => {
    // Solo valida si el store es del tenant especificado.
    if (where.slug === "tienda-de-tenant-B" && where.tenantId === TENANT_B) {
      return { id: "store-B" };
    }
    return null;
  }),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      findFirst: (...a: unknown[]) => prismaMocks.customerFindFirst(...(a as [Parameters<typeof prismaMocks.customerFindFirst>[0]])),
      findUnique: (...a: unknown[]) => prismaMocks.customerFindUnique(...(a as [Parameters<typeof prismaMocks.customerFindUnique>[0]])),
    },
    marketplaceAbandonedCart: {
      findFirst: (...a: unknown[]) => prismaMocks.abandonedCartFindFirst(...(a as [Parameters<typeof prismaMocks.abandonedCartFindFirst>[0]])),
    },
    store: {
      findFirst: (...a: unknown[]) => prismaMocks.storeFindFirst(...(a as [Parameters<typeof prismaMocks.storeFindFirst>[0]])),
    },
    order: { findUnique: vi.fn(async () => null), updateMany: vi.fn() },
    tenant: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock("@/lib/db/loyalty.db", () => ({
  LoyaltyDB: { getHistory: vi.fn(async () => ({ transactions: [], balance: 0, total: 0 })) },
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => {
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ error: "no admin" }, { status: 401 });
  }),
}));
vi.mock("@/lib/api-error", () => ({
  newTraceId: () => "trace-test",
  toErrorPayload: (err: unknown) => ({ payload: { error: String(err) }, status: 500 }),
  ApiError: class ApiError extends Error {
    httpStatus = 500;
    toPayload() { return { error: this.message }; }
  },
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn() }));

beforeEach(() => {
  Object.values(prismaMocks).forEach((m) => m.mockClear());
});

function buildReq(url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escenario 1: atacante en tenant A consulta phone que existe en ambos tenants
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E cross-tenant — customer-lookup", () => {
  it("atacante con header tenant-A NO ve datos del cliente del tenant B", async () => {
    const { GET } = await import("@/app/api/auth/customer-lookup/route");
    const req = buildReq(
      `http://localhost/api/auth/customer-lookup?phone=${SHARED_PHONE}`,
      "GET",
      undefined,
      { "x-tenant-id": TENANT_A },
    );
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    // CRITICO: debe ver "Juan-A" del tenant A, no "Juan-B" del tenant B.
    expect(json.customer?.name).toBe("Juan-A");
    expect(json.customer?.dni).toBe("11111111");
    // Verifica que la query usa findFirst con tenantId, NO findUnique global.
    expect(prismaMocks.customerFindFirst).toHaveBeenCalledWith({
      where: { phone: SHARED_PHONE, tenantId: TENANT_A },
      select: { name: true, tipoDocumento: true, documento: true },
    });
    // findUnique global (el bug viejo) NO debe ser invocado.
    expect(prismaMocks.customerFindUnique).not.toHaveBeenCalled();
  });

  it("atacante en tenant-B no ve datos del cliente del tenant A", async () => {
    const { GET } = await import("@/app/api/auth/customer-lookup/route");
    const req = buildReq(
      `http://localhost/api/auth/customer-lookup?phone=${SHARED_PHONE}`,
      "GET",
      undefined,
      { "x-tenant-id": TENANT_B },
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.customer?.name).toBe("Juan-B"); // su propio data
    expect(json.customer?.dni).toBe("22222222");
  });

  it("sin header x-tenant-id (request sin proxy) → null (no leakea nada)", async () => {
    const { GET } = await import("@/app/api/auth/customer-lookup/route");
    const req = buildReq(
      `http://localhost/api/auth/customer-lookup?phone=${SHARED_PHONE}`,
      "GET",
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.customer).toBeNull();
    expect(prismaMocks.customerFindFirst).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escenario 2: atacante en A intenta restaurar carrito de cliente del tenant B
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E cross-tenant — marketplace/cart/restore", () => {
  it("atacante tenant-A con phone de cliente del tenant B → items vacios", async () => {
    const { POST } = await import("@/app/api/marketplace/cart/restore/route");
    const req = buildReq(
      "http://localhost/api/marketplace/cart/restore",
      "POST",
      { phone: SHARED_PHONE },
      { "x-tenant-id": TENANT_A },
    );
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    // CRITICO: el cart pertenece a tenant-B (storeSlug: "tienda-de-tenant-B"),
    // y el atacante esta en tenant-A → store.findFirst({slug, tenantId:A}) returna null
    // → handler retorna items vacios (no leak del item secreto).
    expect(json.items).toEqual([]);
    expect(json.customerName).toBeUndefined();
    expect(json.storeSlug).toBeUndefined();
    // Verifica que el handler hace post-validation con tenantId.
    expect(prismaMocks.storeFindFirst).toHaveBeenCalledWith({
      where: { slug: "tienda-de-tenant-B", tenantId: TENANT_A },
      select: { id: true },
    });
  });

  it("cliente legitimo en tenant-B SI ve su cart", async () => {
    const { POST } = await import("@/app/api/marketplace/cart/restore/route");
    const req = buildReq(
      "http://localhost/api/marketplace/cart/restore",
      "POST",
      { phone: SHARED_PHONE },
      { "x-tenant-id": TENANT_B },
    );
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.storeSlug).toBe("tienda-de-tenant-B");
    expect(json.customerName).toBe("Juan-B");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escenario 3: invariante — todos los handlers usan filtro tenantId
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E invariante — ningún handler invoca findUnique({phone}) global", () => {
  it("customer-lookup nunca llama findUnique({phone}) sin tenantId", async () => {
    const { GET } = await import("@/app/api/auth/customer-lookup/route");
    const req = buildReq(
      `http://localhost/api/auth/customer-lookup?phone=${SHARED_PHONE}`,
      "GET",
      undefined,
      { "x-tenant-id": TENANT_A },
    );
    await GET(req);
    // Garantia estructural: el handler usa findFirst({phone, tenantId}).
    expect(prismaMocks.customerFindUnique).not.toHaveBeenCalled();
  });
});
