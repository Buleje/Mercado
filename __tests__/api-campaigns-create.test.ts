/**
 * API /api/campaigns — unit tests (POST handler)
 * Covers: POST endpoint for creating marketing campaigns
 * Tests: auth (admin only), validation, audience estimation, happy path
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mock: require-admin ──────────────────────────────────────────────────────
const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

// ── Mock: prismaForTenant ────────────────────────────────────────────────────
const { mockCampaignCreate, mockCustomerCount } = vi.hoisted(() => ({
  mockCampaignCreate: vi.fn(),
  mockCustomerCount: vi.fn(),
}));
vi.mock("@/lib/tenant", () => ({
  prismaForTenant: vi.fn(() => ({
    campaign: {
      create: mockCampaignCreate,
      findMany: vi.fn(async () => []),
    },
    customer: {
      count: mockCustomerCount,
    },
  })),
}));

// ── Mock: enqueueActivityLog ─────────────────────────────────────────────────
vi.mock("@/lib/queue", () => ({
  enqueueActivityLog: vi.fn(async () => {}),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/campaigns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ADMIN_SESSION = {
  role: "admin" as const,
  username: "testadmin",
  tenantId: "main",
};

const NON_ADMIN_SESSION = {
  role: "cajero" as const,
  username: "testcajero",
  tenantId: "main",
};

const defaultCtx = { params: Promise.resolve({}) };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza request sin autenticación", async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Campaña test",
      message: "Mensaje test",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rechaza roles que no sean admin", async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Campaña test",
      message: "Mensaje test",
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("rechaza JSON inválido (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/campaigns/route");
    const req = new NextRequest("http://localhost/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "invalid json{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("rechaza nombre vacío (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "",
      message: "Mensaje válido",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("rechaza mensaje vacío (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Campaña válida",
      message: "",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rechaza nombre demasiado largo (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "x".repeat(201), // > 200 caracteres
      message: "Mensaje válido",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rechaza mensaje demasiado largo (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Campaña válida",
      message: "x".repeat(1001), // > 1000 caracteres
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rechaza segment inválido (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Campaña test",
      message: "Mensaje test",
      segment: "invalido", // no es uno de los permitidos
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rechaza channel inválido (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Campaña test",
      message: "Mensaje test",
      channel: "email", // no soportado
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rechaza status que no sea borrador o programada (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Campaña test",
      message: "Mensaje test",
      status: "activa", // POST solo permite borrador/programada
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("crea campaña básica con defaults (201)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCustomerCount.mockResolvedValue(150); // estimación de audiencia
    mockCampaignCreate.mockResolvedValue({
      id: "camp-1",
      tenantId: "main",
      name: "Promoción Navidad",
      message: "¡Descuentos del 20%!",
      segment: "todos",
      channel: "whatsapp",
      status: "borrador",
      scheduledAt: null,
      totalAudience: 150,
      delivered: 0,
      opened: 0,
      conversions: 0,
      revenue: 0,
      createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Promoción Navidad",
      message: "¡Descuentos del 20%!",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBe("camp-1");
    expect(body.name).toBe("Promoción Navidad");
    expect(body.segment).toBe("todos"); // default
    expect(body.channel).toBe("whatsapp"); // default
    expect(body.status).toBe("borrador"); // default
    expect(body.totalAudience).toBe(150);

    // Verify audience estimation was called
    expect(mockCustomerCount).toHaveBeenCalledWith({ where: { tenantId: "main" } });
  });

  it("crea campaña programada con scheduledAt (201)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCustomerCount.mockResolvedValue(80);
    const scheduledDate = new Date("2026-12-25T10:00:00Z");
    mockCampaignCreate.mockResolvedValue({
      id: "camp-2",
      tenantId: "main",
      name: "Campaña Navidad",
      message: "Feliz Navidad",
      segment: "vip",
      channel: "ambos",
      status: "programada",
      scheduledAt: scheduledDate,
      totalAudience: 80,
      createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Campaña Navidad",
      message: "Feliz Navidad",
      segment: "vip",
      channel: "ambos",
      status: "programada",
      scheduledAt: scheduledDate.toISOString(),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.status).toBe("programada");
    expect(body.segment).toBe("vip");
    expect(body.channel).toBe("ambos");
  });

  it("estima audiencia correcta para segment 'vip'", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCustomerCount.mockResolvedValue(25); // clientes VIP
    mockCampaignCreate.mockResolvedValue({
      id: "camp-3",
      tenantId: "main",
      name: "Campaña VIP",
      message: "Exclusivo para VIP",
      segment: "vip",
      channel: "whatsapp",
      status: "borrador",
      totalAudience: 25,
      createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Campaña VIP",
      message: "Exclusivo para VIP",
      segment: "vip",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.totalAudience).toBe(25);

    // Verify correct WHERE clause for VIP
    expect(mockCustomerCount).toHaveBeenCalledWith({
      where: {
        tenantId: "main",
        loyaltyTier: { in: ["oro", "diamante"] },
      },
    });
  });

  it("usa tenantId correcto en multi-tenant", async () => {
    const multiTenantAdmin = {
      role: "admin" as const,
      username: "admin-tenant2",
      tenantId: "tenant-2",
    };
    mockRequireAdmin.mockResolvedValue(multiTenantAdmin);
    mockCustomerCount.mockResolvedValue(50);
    mockCampaignCreate.mockResolvedValue({
      id: "camp-4",
      tenantId: "tenant-2",
      name: "Test",
      message: "Test",
      segment: "todos",
      channel: "whatsapp",
      status: "borrador",
      totalAudience: 50,
      createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Test",
      message: "Test",
    });

    await POST(req);

    // Verify campaign was created with correct tenantId
    expect(mockCampaignCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "tenant-2" }),
    });

    // Verify audience count used correct tenantId
    expect(mockCustomerCount).toHaveBeenCalledWith({
      where: { tenantId: "tenant-2" },
    });
  });

  it("maneja errores de estimación de audiencia gracefully", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCustomerCount.mockRejectedValue(new Error("DB timeout"));
    // Should still create campaign with totalAudience = 0
    mockCampaignCreate.mockResolvedValue({
      id: "camp-5",
      tenantId: "main",
      name: "Test",
      message: "Test",
      segment: "todos",
      channel: "whatsapp",
      status: "borrador",
      totalAudience: 0, // fallback
      createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = makePostRequest({
      name: "Test",
      message: "Test",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.totalAudience).toBe(0); // graceful degradation
  });
});
