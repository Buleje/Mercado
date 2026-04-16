/**
 * API /api/fiados/cobrar — unit tests
 * Covers: POST endpoint for collecting fiado payments
 * Tests: auth, validation (negative, zero, overflow), happy path, no active fiados
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

// ── Mock: FiadosDB ───────────────────────────────────────────────────────────
const { mockCobrarPorCliente } = vi.hoisted(() => ({
  mockCobrarPorCliente: vi.fn(),
}));
vi.mock("@/lib/db/fiados.db", () => ({
  FiadosDB: {
    cobrarPorCliente: mockCobrarPorCliente,
  },
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

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/fiados/cobrar", {
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

const CAJERO_SESSION = {
  role: "cajero" as const,
  username: "testcajero",
  tenantId: "tenant-1",
};

const defaultCtx = { params: Promise.resolve({}) };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/fiados/cobrar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza request sin autenticación", async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "987654321",
      monto: 50,
    });

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(401);
  });

  it("permite acceso a admin y cajero", async () => {
    mockRequireAdmin.mockResolvedValue(CAJERO_SESSION);
    mockCobrarPorCliente.mockResolvedValue({
      totalCobrado: 50,
      payments: [{ id: "pago-1", monto: 50 }],
      remaining: 0,
    });

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "987654321",
      monto: 50,
    });

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(200);
  });

  it("rechaza monto negativo (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "987654321",
      monto: -50, // negativo
    });

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos invalidos");
  });

  it("rechaza monto cero (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "987654321",
      monto: 0, // cero
    });

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos invalidos");
  });

  it("rechaza customerPhone vacio (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "",
      monto: 50,
    });

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos invalidos");
  });

  it("rechaza notas demasiado largas (400)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "987654321",
      monto: 50,
      notas: "x".repeat(501), // > 500 caracteres
    });

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos invalidos");
  });

  it("retorna 404 cuando no hay fiados activos para el cliente", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCobrarPorCliente.mockResolvedValue({
      totalCobrado: 0,
      payments: [], // sin pagos
      remaining: 0,
    });

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "987654321",
      monto: 50,
    });

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("No hay fiados activos para este cliente");
  });

  it("cobra fiado exitosamente y retorna resultado completo (200)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCobrarPorCliente.mockResolvedValue({
      totalCobrado: 100,
      payments: [
        { id: "pago-1", fiadoId: "fiado-1", monto: 60 },
        { id: "pago-2", fiadoId: "fiado-2", monto: 40 },
      ],
      remaining: 20, // quedaban 20 más por pagar
    });

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "987654321",
      monto: 100,
      notas: "Pago parcial",
    });

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.totalCobrado).toBe(100);
    expect(body.payments).toHaveLength(2);
    expect(body.remaining).toBe(20);

    // Verify DB was called with correct params
    expect(mockCobrarPorCliente).toHaveBeenCalledWith(
      "main",
      "987654321",
      100,
      "Pago parcial"
    );
  });

  it("maneja errores internos de DB (500)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockCobrarPorCliente.mockRejectedValue(new Error("DB connection failed"));

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "987654321",
      monto: 50,
    });

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("usa tenantId del cajero en multi-tenant", async () => {
    mockRequireAdmin.mockResolvedValue(CAJERO_SESSION);
    mockCobrarPorCliente.mockResolvedValue({
      totalCobrado: 75,
      payments: [{ id: "pago-1", monto: 75 }],
      remaining: 0,
    });

    const { POST } = await import("@/app/api/fiados/cobrar/route");
    const req = makeRequest({
      customerPhone: "987654321",
      monto: 75,
    });

    await POST(req, defaultCtx);

    // Verify correct tenantId was passed
    expect(mockCobrarPorCliente).toHaveBeenCalledWith(
      "tenant-1",
      "987654321",
      75,
      undefined
    );
  });
});
