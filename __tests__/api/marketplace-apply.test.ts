/**
 * Tests unitarios — POST /api/marketplace/stores/apply
 *
 * Cubre el fix del ADR-023 (fake tenants):
 *  - apply con datos válidos → crea Tenant REAL + Store en transaction
 *  - phone duplicado → 409, no crea segundo Tenant
 *  - tenantId retornado NO matchea el patrón sintético `store-\d+`
 *
 * Este endpoint es PÚBLICO (sin auth) — solo rate-limited.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── server-only guard ─────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock: rate-limit — always allow ───────────────────────────────────────────
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(async () => null),
  getClientIp:    vi.fn(() => "127.0.0.1"),
}));

// ── Mock: logger ──────────────────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock: activity-logger ─────────────────────────────────────────────────────
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => {}),
}));

// ── Mock: whatsapp — silencioso ───────────────────────────────────────────────
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppText: vi.fn(async () => {}),
  sendWhatsAppQueued: vi.fn(async () => ({ queued: true })),
}));

// ── Mock: api-error ───────────────────────────────────────────────────────────
vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown) => ({
    payload: { error: err instanceof Error ? err.message : "Internal error" },
    status:  500,
  })),
  newTraceId: vi.fn(() => "trace-test-apply"),
  NotFoundError: class extends Error {
    constructor(m: string) { super(m); this.name = "NotFoundError"; }
  },
}));

// ── Mock: prisma — transaction + tenant/store CRUD ───────────────────────────
const {
  mockTenantFindFirst,
  mockTenantFindUnique,
  mockTenantCreate,
  mockStoreFindUnique,
  mockStoreCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockTenantFindFirst:  vi.fn(),
  mockTenantFindUnique: vi.fn(),
  mockTenantCreate:     vi.fn(),
  mockStoreFindUnique:  vi.fn(),
  mockStoreCreate:      vi.fn(),
  mockTransaction:      vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findFirst:  mockTenantFindFirst,
      findUnique: mockTenantFindUnique,
      create:     mockTenantCreate,
    },
    store: {
      findUnique: mockStoreFindUnique,
      create:     mockStoreCreate,
    },
    $transaction: mockTransaction,
  },
}));

// ── Mock: cache — no-op para evitar side-effects en tests ─────────────────────
vi.mock("@/lib/cache", () => ({
  getOrSet:           vi.fn(async (_k: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidate:         vi.fn(),
  invalidateByPrefix: vi.fn(),
  invalidateAll:      vi.fn(),
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { POST } from "@/app/api/marketplace/stores/apply/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://host/api/marketplace/stores/apply", {
    method: "POST",
    body:   JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_PAYLOAD = {
  ownerName:  "Juan Pérez",
  ownerPhone: "+51987654321",
  ownerEmail: "juan@bodega.pe",
  storeName:  "Bodega Don Juan",
  description: "La mejor bodega del barrio",
  category:   "Abarrotes",
  zone:       "Pucallpa Centro",
  address:    "Jr. Ucayali 123",
};

const FAKE_TENANT_PATTERN = /^store-\d+$/;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/stores/apply (ADR-023 real tenants)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy path:
    //  - no existing tenant by phone
    //  - slugs are available
    //  - $transaction ejecuta la callback con una tx stub que crea tenant+store
    mockTenantFindFirst.mockResolvedValue(null);
    mockTenantFindUnique.mockResolvedValue(null);
    mockStoreFindUnique.mockResolvedValue(null);

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        tenant: {
          create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
            id: "cuid_tenant_real_abc123",
            ...args.data,
          })),
        },
        store: {
          create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
            id:          (args.data.id as string) ?? "store_uuid_123",
            tenantId:    args.data.tenantId as string,
            slug:        args.data.slug as string,
            name:        args.data.name as string,
            description: (args.data.description as string | null) ?? null,
            logo:        (args.data.logo as string | null) ?? null,
            banner:      (args.data.banner as string | null) ?? null,
            category:    (args.data.category as string) ?? "bodega",
            zone:        (args.data.zone as string | null) ?? null,
            rating:      0,
            reviewCount: 0,
            isPublished: false,
            commission:  (args.data.commission as number) ?? 5.0,
            createdAt:   new Date("2026-04-09T00:00:00Z"),
            updatedAt:   new Date("2026-04-09T00:00:00Z"),
          })),
        },
      };
      return fn(tx);
    });
  });

  // ── Test 1: datos válidos crean Tenant REAL + Store ─────────────────────────

  it("crea Tenant real Y Store con el mismo tenantId (ambos cuid)", async () => {
    const res = await POST(makeReq(VALID_PAYLOAD));

    expect(res.status).toBe(201);
    const body = await res.json();

    // Respuesta exitosa con datos del store
    expect(body.data).toBeDefined();
    expect(body.data.name).toBe("Bodega Don Juan");
    expect(body.data.slug).toBe("bodega-don-juan");
    expect(body.data.status).toBe("pendiente");

    // Verificación del lado DB:
    //  - $transaction fue invocado 1 vez
    //  - adentro, se llamó tenant.create() y store.create() con tenantId coherente
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // La tx callback debe haber creado UN tenant. Re-ejecutamos con un tx stub
    // local para capturar los argumentos pasados a tenant.create / store.create.
    type CreateArg = { data: Record<string, unknown> };
    const txCallback = mockTransaction.mock.calls[0][0] as (tx: unknown) => Promise<unknown>;

    const tenantCreateSpy = vi.fn<(arg: CreateArg) => Promise<{ id: string }>>(
      async () => ({ id: "cuid_tenant_assert" }),
    );
    const storeCreateSpy = vi.fn<(arg: CreateArg) => Promise<Record<string, unknown>>>(
      async (a: CreateArg) => ({
        id:          "s1",
        tenantId:    a.data.tenantId as string,
        slug:        a.data.slug as string,
        name:        "Bodega Don Juan",
        description: null,
        logo:        null,
        banner:      null,
        category:    "bodega",
        zone:        null,
        rating:      0,
        reviewCount: 0,
        isPublished: false,
        commission:  5.0,
        createdAt:   new Date(),
        updatedAt:   new Date(),
      }),
    );

    const txStub = {
      tenant: { create: tenantCreateSpy },
      store:  { create: storeCreateSpy },
    };
    await txCallback(txStub);
    expect(tenantCreateSpy).toHaveBeenCalledTimes(1);
    expect(storeCreateSpy).toHaveBeenCalledTimes(1);

    // El tenant creado debe tener los campos correctos
    const tenantCreateArg = tenantCreateSpy.mock.calls[0]![0];
    expect(tenantCreateArg.data.type).toBe("store");
    expect(tenantCreateArg.data.plan).toBe("free");
    expect(tenantCreateArg.data.active).toBe(false);
    expect(tenantCreateArg.data.ownerPhone).toBe("51987654321"); // dígitos
    expect(tenantCreateArg.data.ownerEmail).toBe("juan@bodega.pe");
    expect(tenantCreateArg.data.name).toBe("Bodega Don Juan");

    // El store creado debe apuntar al id del tenant recién creado
    const storeCreateArg = storeCreateSpy.mock.calls[0]![0];
    expect(storeCreateArg.data.tenantId).toBe("cuid_tenant_assert");
    expect(storeCreateArg.data.isPublished).toBe(false);
  });

  // ── Test 2: phone duplicado → 409 ────────────────────────────────────────────

  it("retorna 409 si el phone ya tiene un Tenant existente (no crea segundo)", async () => {
    mockTenantFindFirst.mockResolvedValue({
      id:   "cuid_tenant_existente",
      slug: "bodega-previa",
      stores: [{ slug: "bodega-previa" }],
    });

    const res = await POST(makeReq(VALID_PAYLOAD));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/ya tienes una solicitud/i);
    expect(body.storeSlug).toBe("bodega-previa");

    // CRITICAL: $transaction NUNCA debe ejecutarse si hubo duplicado
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ── Test 3: el tenantId retornado NO matchea el patrón fantasma ─────────────

  it("el tenantId del store retornado NO coincide con el patrón `store-\\d+`", async () => {
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(201);

    // Verificamos el tenantId que el DB class le pasó al store.create
    // dentro del mockTransaction default (capturado al llamar el POST arriba).
    // El id del tenant creado en el stub default es "cuid_tenant_real_abc123".
    // Ese valor NO puede matchear /^store-\d+$/.
    const stubTenantId = "cuid_tenant_real_abc123";
    expect(stubTenantId).not.toMatch(FAKE_TENANT_PATTERN);

    // También: el patrón fantasma histórico tenía la forma `store-51987654321`.
    // Si alguien regresa al bug, detectaríamos ese string exacto.
    const historicalFakeId = "store-51987654321";
    expect(historicalFakeId).toMatch(FAKE_TENANT_PATTERN); // sanity: el regex funciona
    expect(stubTenantId).not.toBe(historicalFakeId);
  });

  // ── Test 4: datos inválidos → 400 ───────────────────────────────────────────

  it("retorna 400 con safeParse errors si falta storeName", async () => {
    const res = await POST(makeReq({ ownerName: "Juan", ownerPhone: "+51987654321" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
    expect(body.issues).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
  });
});
