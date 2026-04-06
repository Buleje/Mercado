/**
 * Tests para GET /api/cron/batch-expiry-alerts
 *
 * Cron diario (08:00) que revisa lotes por vencer en 3 días por tenant activo
 * y crea un registro de notificación por cada tenant alertado.
 *
 * Deps:
 *  - Bearer CRON_SECRET (timingSafeCompare)
 *  - prisma.tenant.findMany → tenants activos
 *  - BatchesDB.getExpiring(tenantId, 3) → lotes próximos a vencer
 *  - NotificationLogsDB.add({ type, recipient, message, status }) → crea notif
 *  - withCronRetry (lib/cron-retry) → reintentos automáticos (mockeado inline)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// ── Mock BatchesDB + NotificationLogsDB ───────────────────────────────────────

const { mockGetExpiring, mockNotificationAdd } = vi.hoisted(() => ({
  mockGetExpiring: vi.fn(),
  mockNotificationAdd: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  BatchesDB: {
    getExpiring: mockGetExpiring,
  },
  NotificationLogsDB: {
    add: mockNotificationAdd,
  },
}));

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const { mockTenantFindMany } = vi.hoisted(() => ({
  mockTenantFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findMany: mockTenantFindMany,
    },
  },
}));

import { GET } from "@/app/api/cron/batch-expiry-alerts/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CRON_SECRET = "test-cron-secret-expiry-42";

const TENANTS_MOCK = [
  { id: "tenant-main", slug: "main" },
  { id: "tenant-secundario", slug: "secundario" },
];

const BATCHES_EXPIRING_MOCK = [
  {
    id: "batch-001",
    tenantId: "tenant-main",
    lote: "L-2026-01",
    productName: "Leche Gloria 1L",
    productId: 5,
    quantity: 20,
    unit: "und",
    expiryDate: "2026-03-25",
    costUnit: 3.5,
    notes: "",
    supplierName: "Gloria S.A.",
    productCategory: "Lácteos",
    entryDate: "2026-01-10",
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
  },
];

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest("https://localhost/api/cron/batch-expiry-alerts", {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/cron/batch-expiry-alerts", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    // Por defecto: sin tenants activos, sin lotes, notificaciones OK
    mockTenantFindMany.mockResolvedValue([]);
    mockGetExpiring.mockResolvedValue([]);
    mockNotificationAdd.mockResolvedValue({ id: "notif-001" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  // 1. Sin header de autorización → 401
  it("returns 401 when no authorization header is provided", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  // 2. Token incorrecto → 401
  it("returns 401 when bearer token does not match CRON_SECRET", async () => {
    const res = await GET(makeRequest("Bearer token-incorrecto-xyz"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  // 3. CRON_SECRET vacío en env → 401
  it("returns 401 when CRON_SECRET env var is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(401);
  });

  // 4. Token válido, sin tenants → 200 con ok:true y tenantsChecked:0
  it("returns 200 with ok:true when no active tenants exist", async () => {
    mockTenantFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tenantsChecked).toBe(0);
    expect(body.totalNotifications).toBe(0);
  });

  // 5. Tenants activos pero sin lotes por vencer → totalNotifications: 0
  it("returns totalNotifications:0 and does not create notifications when no batches are expiring", async () => {
    mockTenantFindMany.mockResolvedValue(TENANTS_MOCK);
    mockGetExpiring.mockResolvedValue([]); // todos los tenants sin lotes
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.totalNotifications).toBe(0);
    expect(body.tenantsAlerted).toBe(0);
    expect(mockNotificationAdd).not.toHaveBeenCalled();
  });

  // 6. Con lotes por vencer → crea una notificación por tenant alertado
  it("creates one notification per tenant with expiring batches", async () => {
    mockTenantFindMany.mockResolvedValue(TENANTS_MOCK);
    // Primer tenant tiene lotes, segundo no
    mockGetExpiring
      .mockResolvedValueOnce(BATCHES_EXPIRING_MOCK) // tenant-main
      .mockResolvedValueOnce([]);                   // tenant-secundario
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.totalNotifications).toBe(1);
    expect(body.tenantsAlerted).toBe(1);
    expect(mockNotificationAdd).toHaveBeenCalledTimes(1);
  });

  // 7. getExpiring es llamado con el tenantId correcto y days = 3
  it("calls BatchesDB.getExpiring with tenantId and days=3 for each tenant", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "tenant-main", slug: "main" }]);
    mockGetExpiring.mockResolvedValue([]);
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(mockGetExpiring).toHaveBeenCalledWith("tenant-main", 3);
    expect(mockGetExpiring).toHaveBeenCalledTimes(1);
  });

  // 8. NotificationLogsDB.add recibe type correcto
  it("calls NotificationLogsDB.add with type batch_expiry_alert", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "tenant-main", slug: "main" }]);
    mockGetExpiring.mockResolvedValue(BATCHES_EXPIRING_MOCK);
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(mockNotificationAdd).toHaveBeenCalledTimes(1);
    const call = mockNotificationAdd.mock.calls[0][0];
    expect(call.type).toBe("batch_expiry_alert");
    expect(call.recipient).toBe("tenant-main");
    expect(typeof call.message).toBe("string");
    expect(call.status).toBe("pending");
  });

  // 9. Error en prisma.tenant.findMany → 500 con ok: false
  it("returns 500 with ok:false when tenant query throws", async () => {
    mockTenantFindMany.mockRejectedValue(new Error("Prisma connection timeout"));
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
  });

  // 10. Error en BatchesDB.getExpiring → 500 con ok: false
  it("returns 500 with ok:false when BatchesDB.getExpiring throws", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "tenant-main", slug: "main" }]);
    mockGetExpiring.mockRejectedValue(new Error("Batch query failed"));
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
  });
});
