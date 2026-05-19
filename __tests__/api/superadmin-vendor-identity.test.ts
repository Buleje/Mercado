/**
 * Tests — POST /api/superadmin/vendor-identity
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockRequirePlatform } = vi.hoisted(() => ({
  mockRequirePlatform: vi.fn(),
}));

vi.mock("@/lib/superadmin-auth", () => ({
  requirePlatformAPI: mockRequirePlatform,
}));

const { mockVerifyDni, mockVerifyRuc, mockNamesMatch, mockIsInvoiceable } = vi.hoisted(() => ({
  mockVerifyDni: vi.fn(),
  mockVerifyRuc: vi.fn(),
  mockNamesMatch: vi.fn(),
  mockIsInvoiceable: vi.fn(),
}));

vi.mock("@/lib/integrations/reniec", () => ({
  verifyDni: mockVerifyDni,
  namesMatch: mockNamesMatch,
}));

vi.mock("@/lib/integrations/sunat-ruc", () => ({
  verifyRuc: mockVerifyRuc,
  isInvoiceable: mockIsInvoiceable,
}));

import { POST } from "@/app/api/superadmin/vendor-identity/route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/superadmin/vendor-identity", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/superadmin/vendor-identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatform.mockResolvedValue({ ok: true, username: "sa-test" });
  });

  it("401 si no hay sesión platform", async () => {
    mockRequirePlatform.mockResolvedValueOnce(
      NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    );
    const res = await POST(makeReq({ dni: "12345678" }));
    expect(res.status).toBe(401);
  });

  it("400 si body no es JSON válido", async () => {
    const req = new NextRequest("https://example.com/api/superadmin/vendor-identity", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 si falta DNI y RUC", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("400 si DNI tiene formato inválido", async () => {
    const res = await POST(makeReq({ dni: "abc" }));
    expect(res.status).toBe(400);
  });

  it("400 si RUC no empieza con 10/15/17/20", async () => {
    const res = await POST(makeReq({ ruc: "30123456789" }));
    expect(res.status).toBe(400);
  });

  it("devuelve resultado DNI verde con name match", async () => {
    mockVerifyDni.mockResolvedValueOnce({
      ok: true,
      source: "apisperu",
      fullName: "Juan Pérez Gómez",
    });
    mockNamesMatch.mockReturnValueOnce(true);
    const res = await POST(
      makeReq({ dni: "12345678", ownerName: "Juan Pérez" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("DNI");
    expect(body.ok).toBe(true);
    expect(body.fullName).toBe("Juan Pérez Gómez");
    expect(body.ownerNameMatches).toBe(true);
  });

  it("devuelve ownerNameMatches=null si no se envía ownerName", async () => {
    mockVerifyDni.mockResolvedValueOnce({
      ok: true,
      source: "apisperu",
      fullName: "Juan Pérez",
    });
    const res = await POST(makeReq({ dni: "12345678" }));
    const body = await res.json();
    expect(body.ownerNameMatches).toBeNull();
  });

  it("devuelve RUC + invoiceable+razonSocial", async () => {
    mockVerifyRuc.mockResolvedValue({
      ok: true,
      source: "apisperu",
      razonSocial: "Bodega SAC",
      estado: "ACTIVO",
      condicion: "HABIDO",
      direccion: "Av. Lima 123",
    });
    mockIsInvoiceable.mockReturnValue(true);
    const res = await POST(makeReq({ ruc: "20123456789" }));
    const body = await res.json();
    expect(body.type).toBe("RUC");
    expect(body.ok).toBe(true);
    expect(body.invoiceable).toBe(true);
    expect(body.razonSocial).toBe("Bodega SAC");
    expect(body.estado).toBe("ACTIVO");
  });

  it("RUC NO HABIDO → invoiceable=false (no rechaza, solo informa)", async () => {
    mockVerifyRuc.mockResolvedValue({
      ok: true,
      source: "apisperu",
      razonSocial: "X",
      estado: "ACTIVO",
      condicion: "NO HABIDO",
    });
    mockIsInvoiceable.mockReturnValue(false);
    const res = await POST(makeReq({ ruc: "20123456789" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.invoiceable).toBe(false);
  });

  it("RUC takes priority cuando ambos DNI y RUC vienen", async () => {
    mockVerifyRuc.mockResolvedValueOnce({
      ok: true,
      source: "apisperu",
      razonSocial: "Z",
      estado: "ACTIVO",
      condicion: "HABIDO",
    });
    mockIsInvoiceable.mockReturnValueOnce(true);
    const res = await POST(
      makeReq({ dni: "12345678", ruc: "20123456789" }),
    );
    const body = await res.json();
    expect(body.type).toBe("RUC");
    expect(mockVerifyDni).not.toHaveBeenCalled();
  });

  it("DNI no encontrado en RENIEC → ok=false con reason", async () => {
    mockVerifyDni.mockResolvedValueOnce({
      ok: false,
      source: "apisperu",
      reason: "not_found",
    });
    const res = await POST(makeReq({ dni: "00000000" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_found");
  });

  it("rate-limit aplica STRICT", async () => {
    const { applyRateLimit } = await import("@/lib/rate-limit");
    (applyRateLimit as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Response(null, { status: 429 }),
    );
    const res = await POST(makeReq({ dni: "12345678" }));
    expect(res.status).toBe(429);
  });
});
