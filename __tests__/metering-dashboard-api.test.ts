/**
 * ADR-047 — Tests del endpoint GET /api/billing/metering/dashboard
 *
 * Cubre:
 * - 401 si no autenticado
 * - 200 con estructura correcta para tenant autenticado
 * - quotas incluye todos los METERED_EVENTS
 * - tenantId isolation (tenant A no ve datos de tenant B)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock requireAdmin
const mockRequireAdmin = vi.fn();
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

// Mock getMeteredUsage
const mockGetMeteredUsage = vi.fn();
vi.mock("@/lib/billing/metering", () => ({
  getMeteredUsage: mockGetMeteredUsage,
  currentBillingMonth: () => ({
    from: new Date("2026-04-01T00:00:00Z"),
    to: new Date("2026-05-01T00:00:00Z"),
  }),
  METERED_EVENTS: [
    "order.created",
    "ai.call",
    "ai.recommend",
    "ai.insight",
    "sms.sent",
    "whatsapp.sent",
    "sunat.emitted",
    "storage.blob",
  ],
}));

// Mock SettingsDB
vi.mock("@/lib/db/settings.db", () => ({
  SettingsDB: {
    get: vi.fn().mockResolvedValue({
      planName: "starter",
      businessName: "Test Bodega",
      mode: "checkout",
      adminBypassLogin: false,
    }),
  },
}));

// Mock USAGE_TIERS (usa el real desde usage-tiers.ts)
vi.mock("@/lib/billing/wire-up/usage-tiers", async () => {
  const actual = await vi.importActual("@/lib/billing/wire-up/usage-tiers");
  return actual;
});

import { NextResponse } from "next/server";

// Base usage response
const BASE_USAGE = {
  "order.created": 150,
  "ai.call": 30,
  "ai.recommend": 200,
  "ai.insight": 10,
  "sms.sent": 5,
  "whatsapp.sent": 80,
  "sunat.emitted": 20,
  "storage.blob": 512,
};

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockGetMeteredUsage.mockReset();
  mockGetMeteredUsage.mockResolvedValue(BASE_USAGE);
});

describe("GET /api/billing/metering/dashboard", () => {
  it("retorna 401 si requireAdmin devuelve NextResponse", async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );

    const { GET } = await import("@/app/api/billing/metering/dashboard/route");
    const req = new NextRequest("http://localhost/api/billing/metering/dashboard");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("retorna 200 con estructura correcta para tenant autenticado", async () => {
    mockRequireAdmin.mockResolvedValue({
      tenantId: "tenant_a",
      role: "admin",
      username: "admin",
    });

    const { GET } = await import("@/app/api/billing/metering/dashboard/route");
    const req = new NextRequest("http://localhost/api/billing/metering/dashboard");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json() as {
      tenantId: string;
      plan: string;
      tier: string;
      quotas: Record<string, unknown>;
      usage: Record<string, number>;
      history: unknown[];
      period: { from: string; to: string };
    };

    expect(body.tenantId).toBe("tenant_a");
    expect(body.plan).toBe("starter");
    expect(body.tier).toBe("starter");
    expect(body.period.from).toBe("2026-04-01T00:00:00.000Z");
    expect(body.usage["order.created"]).toBe(150);
    expect(body.history).toHaveLength(1);
  });

  it("quotas incluye todos los METERED_EVENTS", async () => {
    mockRequireAdmin.mockResolvedValue({
      tenantId: "tenant_b",
      role: "admin",
      username: "admin",
    });

    const { GET } = await import("@/app/api/billing/metering/dashboard/route");
    const req = new NextRequest("http://localhost/api/billing/metering/dashboard");
    const res = await GET(req);
    const body = await res.json() as { quotas: Record<string, unknown> };

    const expectedEvents = [
      "order.created",
      "ai.call",
      "ai.recommend",
      "ai.insight",
      "sms.sent",
      "whatsapp.sent",
      "sunat.emitted",
      "storage.blob",
    ];
    for (const event of expectedEvents) {
      expect(body.quotas).toHaveProperty(event);
    }
  });

  it("tenantId isolation: tenant A no ve datos de tenant B", async () => {
    // Tenant A
    mockRequireAdmin.mockResolvedValueOnce({
      tenantId: "tenant_a",
      role: "admin",
      username: "admin",
    });
    mockGetMeteredUsage.mockResolvedValueOnce({ ...BASE_USAGE, "order.created": 50 });

    // Tenant B
    mockRequireAdmin.mockResolvedValueOnce({
      tenantId: "tenant_b",
      role: "admin",
      username: "admin",
    });
    mockGetMeteredUsage.mockResolvedValueOnce({ ...BASE_USAGE, "order.created": 999 });

    const { GET } = await import("@/app/api/billing/metering/dashboard/route");

    const reqA = new NextRequest("http://localhost/api/billing/metering/dashboard");
    const resA = await GET(reqA);
    const bodyA = await resA.json() as { tenantId: string; usage: Record<string, number> };

    const reqB = new NextRequest("http://localhost/api/billing/metering/dashboard");
    const resB = await GET(reqB);
    const bodyB = await resB.json() as { tenantId: string; usage: Record<string, number> };

    expect(bodyA.tenantId).toBe("tenant_a");
    expect(bodyA.usage["order.created"]).toBe(50);
    expect(bodyB.tenantId).toBe("tenant_b");
    expect(bodyB.usage["order.created"]).toBe(999);

    // Verificar que getMeteredUsage se llamó con el tenantId correcto
    expect(mockGetMeteredUsage).toHaveBeenCalledWith(
      "tenant_a",
      expect.any(Object),
    );
    expect(mockGetMeteredUsage).toHaveBeenCalledWith(
      "tenant_b",
      expect.any(Object),
    );
  });

  it("quotas.sunat_emitted.status = 'blocked' en plan free", async () => {
    const { SettingsDB } = await import("@/lib/db/settings.db");
    vi.mocked(SettingsDB.get).mockResolvedValueOnce({
      planName: "free",
      businessName: "Bodega Free",
      mode: "checkout" as const,
      adminBypassLogin: false,
    });
    mockRequireAdmin.mockResolvedValue({
      tenantId: "tenant_free",
      role: "admin",
      username: "admin",
    });

    const { GET } = await import("@/app/api/billing/metering/dashboard/route");
    const req = new NextRequest("http://localhost/api/billing/metering/dashboard");
    const res = await GET(req);
    const body = await res.json() as {
      quotas: Record<string, { status: string; limit: number | null }>;
    };

    expect(body.quotas["sunat.emitted"].status).toBe("blocked");
    expect(body.quotas["sunat.emitted"].limit).toBe(0);
  });
});
