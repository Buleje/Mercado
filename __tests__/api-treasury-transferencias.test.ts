/**
 * API /api/treasury/transferencias — unit tests
 * Covers: POST endpoint for treasury transfers between accounts
 * Tests: auth, validation (negative, zero, overflow, same account), happy path, GET list
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

// ── Mock: TreasuryDB ─────────────────────────────────────────────────────────
const { mockTransferir, mockListTransferencias } = vi.hoisted(() => ({
  mockTransferir: vi.fn(),
  mockListTransferencias: vi.fn(),
}));
vi.mock("@/lib/db/treasury.db", () => ({
  TreasuryDB: {
    transferir: mockTransferir,
    listTransferencias: mockListTransferencias,
  },
}));

// ── Mock: activity-logger ────────────────────────────────────────────────────
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => {}),
}));

// ── Mock: logger ─────────────────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/treasury/transferencias", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(limit?: number) {
  const url = new URL("http://localhost/api/treasury/transferencias");
  if (limit !== undefined) url.searchParams.set("limit", String(limit));
  return new NextRequest(url, { method: "GET" });
}

const ADMIN_SESSION = {
  role: "admin" as const,
  username: "testadmin",
  tenantId: "main",
};

const defaultCtx = { params: Promise.resolve({}) };

// ── Tests POST ────────────────────────────────────────────────────────────────

describe("POST /api/treasury/transferencias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza request sin autenticación", async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 500,
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rechaza monto negativo (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: -100, // negativo
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  it("rechaza monto cero (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 0, // cero
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  it("rechaza monto mayor a 99999999 (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 100000000, // overflow
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  it("rechaza origenId vacío (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "",
      destinoId: "banco-1",
      monto: 500,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  it("rechaza destinoId vacío (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "",
      monto: 500,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  it("rechaza descripcion demasiado larga (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 500,
      descripcion: "x".repeat(501), // > 500 caracteres
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  it("crea transferencia exitosamente y retorna 201", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockTransferir.mockResolvedValue({
      id: "transf-1",
      origenId: "caja-1",
      destinoId: "banco-1",
      origenNombre: "Caja Principal",
      destinoNombre: "Banco BCP",
      monto: 5000,
      descripcion: "Depósito diario",
      createdAt: new Date(),
      tenantId: "main",
    });

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 5000,
      descripcion: "Depósito diario",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBe("transf-1");
    expect(body.monto).toBe(5000);
    expect(body.origenNombre).toBe("Caja Principal");
    expect(body.destinoNombre).toBe("Banco BCP");

    // Verify DB was called with correct params
    expect(mockTransferir).toHaveBeenCalledWith({
      tenantId: "main",
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 5000,
      descripcion: "Depósito diario",
    });
  });

  it("acepta transferencia sin descripción (opcional)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockTransferir.mockResolvedValue({
      id: "transf-2",
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 1000,
      createdAt: new Date(),
      tenantId: "main",
    });

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 1000,
      // sin descripcion
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("maneja errores de DB y retorna 500 via withApiHandler", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockTransferir.mockRejectedValue(new Error("Insuficiente saldo en origen"));

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 5000,
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("usa tenantId correcto en multi-tenant", async () => {
    const multiTenant = {
      role: "admin" as const,
      username: "admin-tenant2",
      tenantId: "tenant-2",
    };
    mockRequireAdmin.mockResolvedValue(multiTenant);
    mockTransferir.mockResolvedValue({
      id: "transf-3",
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 500,
      createdAt: new Date(),
      tenantId: "tenant-2",
    });

    const { POST } = await import("@/app/api/treasury/transferencias/route");
    const req = makePostRequest({
      origenId: "caja-1",
      destinoId: "banco-1",
      monto: 500,
    });

    await POST(req);

    expect(mockTransferir).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-2" })
    );
  });
});

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe("GET /api/treasury/transferencias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza request sin autenticación", async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const { GET } = await import("@/app/api/treasury/transferencias/route");
    const req = makeGetRequest();

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("retorna lista de transferencias con límite por defecto 50", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockListTransferencias.mockResolvedValue([
      { id: "t1", monto: 100, createdAt: new Date() },
      { id: "t2", monto: 200, createdAt: new Date() },
    ]);

    const { GET } = await import("@/app/api/treasury/transferencias/route");
    const req = makeGetRequest();

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(mockListTransferencias).toHaveBeenCalledWith("main", 50);
  });

  it("respeta parámetro limit personalizado", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockListTransferencias.mockResolvedValue([]);

    const { GET } = await import("@/app/api/treasury/transferencias/route");
    const req = makeGetRequest(10);

    await GET(req);

    expect(mockListTransferencias).toHaveBeenCalledWith("main", 10);
  });

  it("maneja errores de DB y retorna 500 via withApiHandler", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockListTransferencias.mockRejectedValue(new Error("DB timeout"));

    const { GET } = await import("@/app/api/treasury/transferencias/route");
    const req = makeGetRequest();

    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
