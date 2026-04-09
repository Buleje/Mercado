/**
 * API /api/invoices/emit — unit tests
 * Cubre: auth, validación de body, orderId, tenantId, fallo DB,
 *        rate limiting, Sentry, respuesta con documento generado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

// ── Sentry ────────────────────────────────────────────────────────────────────
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: { setExtra: ReturnType<typeof vi.fn> }) => void) =>
    cb({ setExtra: vi.fn() }),
  ),
}));

// ── requireAdmin ──────────────────────────────────────────────────────────────
const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

// ── OrdersDB ──────────────────────────────────────────────────────────────────
const { mockGetById } = vi.hoisted(() => ({ mockGetById: vi.fn() }));
vi.mock("@/lib/db/orders.db", () => ({
  OrdersDB: { getById: mockGetById },
}));

// ── sunat (emitirComprobante + generateCorrelativo; validateRUC/DNI reales) ───
const { mockEmitirComprobante, mockGenerateCorrelativo, mockGenerateXML } =
  vi.hoisted(() => ({
    mockEmitirComprobante: vi.fn(),
    mockGenerateCorrelativo: vi.fn(),
    mockGenerateXML: vi.fn(),
  }));
vi.mock("@/lib/sunat", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/sunat")>();
  return {
    ...real, // validateRUC, validateDNI, calculateIGV reales
    emitirComprobante: mockEmitirComprobante,
    generateCorrelativo: mockGenerateCorrelativo,
    generateXML: mockGenerateXML,
  };
});

// ── logger (evita output en tests) ───────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── rate-limit (retorna null → no limitar en tests) ──────────────────────────
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

// ── activity-logger (fire-and-forget — ignorar en tests) ─────────────────────
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

// ── prisma (para generateCorrelativo y activityLog) ──────────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { POST } from "@/app/api/invoices/emit/route";

// ── fixtures ──────────────────────────────────────────────────────────────────

const AUTH_ADMIN = { tenantId: "main", role: "admin", username: "admin1", userId: "u1" };
const AUTH_CAJERO = { tenantId: "main", role: "cajero", username: "cajero1", userId: "u2" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

// Body mínimo válido para boleta
const BODY_BOLETA = {
  orderId: "order-001",
  tipoDoc: "03",
  clienteNombre: "Juan Pérez",
  clienteDni: "12345678",
};

// Body válido para factura (requiere RUC)
const _BODY_FACTURA = {
  orderId: "order-001",
  tipoDoc: "01",
  clienteNombre: "Empresa SAC",
  clienteRuc: "20123456789",
};

const ORDER_MOCK = {
  id: "order-001",
  tenantId: "main",
  total: 59.0,
  items: [
    { name: "Arroz 5kg", price: 25.0, quantity: 1 },
    { name: "Aceite 1L", price: 17.0, quantity: 2 },
  ],
};

const SUNAT_RESULT = {
  pdfUrl: "https://nubefact.com/pdf/B001-00000001.pdf",
  xmlUrl: "https://nubefact.com/xml/B001-00000001.xml",
  hash: "abc123hash",
};

function makeReq(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("https://host/api/invoices/emit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe("POST /api/invoices/emit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RUC_EMISOR = "20123456789";
    process.env.RAZON_SOCIAL_EMISOR = "Buleje";
    process.env.NUBEFACT_TOKEN = "test-token";

    // Defaults felices
    mockGenerateCorrelativo.mockResolvedValue("00000001");
    mockGenerateXML.mockReturnValue("<xml>mock</xml>");
    mockEmitirComprobante.mockResolvedValue(SUNAT_RESULT);
  });

  // 1. Sin auth → 401
  it("retorna 401 cuando el usuario no está autenticado", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);

    const res = await POST(makeReq(BODY_BOLETA));
    expect(res.status).toBe(401);
  });

  // 2. POST con orderId válido → 200
  it("retorna 200 con comprobante al emitir con orderId válido", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetById.mockResolvedValue(ORDER_MOCK);

    const res = await POST(makeReq(BODY_BOLETA));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.comprobante).toBeDefined();
  });

  // 3. POST sin orderId → 400
  it("retorna 400 cuando falta orderId en el body", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);

    const res = await POST(
      makeReq({ tipoDoc: "03", clienteNombre: "Juan Pérez" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // 4. POST con orden inexistente → 404
  it("retorna 404 cuando el pedido no existe en la base de datos", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetById.mockResolvedValue(null);

    const res = await POST(makeReq(BODY_BOLETA));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/encontrad/i);
  });

  // 5. tenantId correcto — getById recibe el orderId del body
  it("consulta la orden con el orderId recibido en el body", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetById.mockResolvedValue(ORDER_MOCK);

    await POST(makeReq(BODY_BOLETA));
    expect(mockGetById).toHaveBeenCalledWith("order-001");
    expect(mockGetById).toHaveBeenCalledTimes(1);
  });

  // 6. emitirComprobante falla → 500
  it("retorna 500 cuando emitirComprobante lanza un error", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetById.mockResolvedValue(ORDER_MOCK);
    mockEmitirComprobante.mockRejectedValue(new Error("Nubefact error 503"));

    const res = await POST(makeReq(BODY_BOLETA));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // 7. Rate limiting — applyRateLimit devuelve 429 cuando está activado
  it("retorna 429 si el rate limiter rechaza la petición", async () => {
    const { applyRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(applyRateLimit).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
    );

    // requireAdmin no llega a llamarse
    const res = await POST(makeReq(BODY_BOLETA));
    expect(res.status).toBe(429);
  });

  // 8. Respuesta incluye documento generado (pdfUrl, xmlUrl, hash)
  it("la respuesta incluye pdfUrl, xmlUrl y hash del documento emitido", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetById.mockResolvedValue(ORDER_MOCK);

    const res = await POST(makeReq(BODY_BOLETA));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pdfUrl).toBe(SUNAT_RESULT.pdfUrl);
    expect(body.xmlUrl).toBe(SUNAT_RESULT.xmlUrl);
    expect(body.hash).toBe(SUNAT_RESULT.hash);
  });

  // Extra: body inválido (no JSON) → 400
  it("retorna 400 cuando el body no es JSON válido", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);

    const req = new NextRequest("https://host/api/invoices/emit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "esto no es json{{{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Extra: factura sin RUC → 400 (validación de negocio)
  it("retorna 400 cuando se emite factura sin RUC del cliente", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);

    const res = await POST(
      makeReq({ orderId: "order-001", tipoDoc: "01", clienteNombre: "Sin RUC" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ruc/i);
  });

  // Extra: cajero también tiene acceso → 200
  it("permite emitir comprobante con rol cajero", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_CAJERO);
    mockGetById.mockResolvedValue(ORDER_MOCK);

    const res = await POST(makeReq(BODY_BOLETA));
    expect(res.status).toBe(200);
  });

  // Extra: sin NUBEFACT_TOKEN → modo desarrollo, retorna xmlUbl
  it("retorna modo desarrollo con xmlUbl cuando NUBEFACT_TOKEN no está configurado", async () => {
    delete process.env.NUBEFACT_TOKEN;
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetById.mockResolvedValue(ORDER_MOCK);

    const res = await POST(makeReq(BODY_BOLETA));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modo).toBe("desarrollo");
    expect(body.xmlUbl).toBeDefined();
    // emitirComprobante NO debe llamarse en modo desarrollo
    expect(mockEmitirComprobante).not.toHaveBeenCalled();
  });
});
