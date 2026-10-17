/**
 * Límites de la operación diaria (17-10): rutas que el personal usa muchas veces
 * por turno y que tenían STRICT por IP (10 cada 15 min) ANTES del login.
 *
 * - Personal del panel (boleta, factura por foto, sugerencia de WhatsApp, caja):
 *   el límite va después de `requireAdmin`, con clave por negocio + usuario.
 * - Repartidor: ping de GPS cada 30 s → POLL por repartidor (antes a los 5 min
 *   quedaba congelado); foto de entrega por repartidor (comparten IP móvil).
 * - Chat de la tienda (público): GET y POST compartían el balde; el sondeo del
 *   widget dejaba al cliente sin poder escribir. Se prueba con el límite real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  rl: vi.fn(),
  admin: vi.fn(),
  partner: vi.fn(),
  chatGet: vi.fn(),
  chatAdd: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: h.rl }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.admin }));
vi.mock("@/lib/delivery/partner-session", () => ({ requirePartner: h.partner }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("@/lib/jsondb", () => ({
  CashRegistersDB: {},
  ChatDB: { getByPhone: h.chatGet, add: h.chatAdd },
}));
vi.mock("@/lib/db/sales.db", () => ({ CashRegistersDB: {} }));
vi.mock("@/lib/db/cash-registers-by-id.db", () => ({ CashRegisterOwnershipDB: {} }));
vi.mock("@/lib/mailer", () => ({ sendCashSummaryEmail: vi.fn() }));
vi.mock("@/lib/create-notification", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn() }));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ chatModel: vi.fn(), getActiveProvider: vi.fn() }));
vi.mock("@/lib/db/whatsapp-messages.db", () => ({ WhatsAppMessagesDB: {} }));
vi.mock("@/lib/integrations/sunat", () => ({ emitirBoleta: vi.fn(), emitirFactura: vi.fn() }));
vi.mock("@/lib/sunat/modo-oficial", () => ({ isSunatOficial: vi.fn() }));
vi.mock("@/lib/ai/cost-control", () => ({ aiCostGuard: { canSpend: vi.fn(), recordSpend: vi.fn() } }));
vi.mock("@/lib/ai/vision-extract", () => ({
  FORMATOS_IMAGEN: [],
  costoMaximoLecturaUsd: vi.fn(),
  falloSinLector: vi.fn(),
  gastoDeLectura: vi.fn(),
  proveedorVision: vi.fn(),
  visionExtractJSON: vi.fn(),
}));
vi.mock("@/lib/ai/detalle-clave-ia", () => ({ veDetalleDeClaveIA: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getTenantIdFromRequest: () => "tenant-1" }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: <T,>(_req: unknown, _user: unknown, fn: () => Promise<T>) => fn(),
  getAuditContext: () => null,
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const LLENO = () => new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
const SIN_SESION = () => NextResponse.json({ error: "No autorizado" }, { status: 401 });
const CAJERO = { role: "cajero", username: "cajero1", tenantId: "tenant-1" };
const PARTNER = { partnerId: "rep-1", tenantId: "tenant-1" };
const PARAMS = { params: Promise.resolve({ id: "asig-1" }) };

function req(url: string, method = "POST", body: unknown = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": "190.1.2.3" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

type Llamar = () => Promise<Response>;

/** [nombre, cómo llamar la ruta, preset esperado, clave esperada, guardia de sesión] */
const PANEL: Array<[string, () => Promise<Llamar>, string, string]> = [
  [
    "boleta/factura (admin/sunat/generate-invoice)",
    async () => { const m = await import("@/app/api/admin/sunat/generate-invoice/route"); return () => m.POST(req("/api/admin/sunat/generate-invoice")); },
    "GENEROUS",
    "sunat-generate:tenant-1:cajero1",
  ],
  [
    "factura por foto (ocr/invoice)",
    async () => { const m = await import("@/app/api/ocr/invoice/route"); return () => m.POST(req("/api/ocr/invoice")); },
    "MODERATE",
    "ocr-invoice:tenant-1:cajero1",
  ],
  [
    "sugerir respuesta de WhatsApp",
    async () => { const m = await import("@/app/api/admin/whatsapp/suggest/route"); return () => m.POST(req("/api/admin/whatsapp/suggest")); },
    "MODERATE",
    "admin-whatsapp-suggest:tenant-1:cajero1",
  ],
  [
    "abrir caja (cash-registers POST)",
    async () => { const m = await import("@/app/api/cash-registers/route"); return () => m.POST(req("/api/cash-registers")); },
    "MODERATE",
    "cash-registers-post:tenant-1:cajero1",
  ],
  [
    "movimiento/arqueo/cierre (cash-registers/[id] PATCH)",
    async () => { const m = await import("@/app/api/cash-registers/[id]/route"); return () => m.PATCH(req("/api/cash-registers/c1", "PATCH"), { params: Promise.resolve({ id: "c1" }) }); },
    "MODERATE",
    "cash-registers-X:tenant-1:cajero1",
  ],
];

const REPARTO: Array<[string, () => Promise<Llamar>, string, string]> = [
  [
    "ping de GPS",
    async () => { const m = await import("@/app/api/delivery/me/ping/route"); return () => m.POST(req("/api/delivery/me/ping", "POST", { lat: -8.38, lng: -74.55 })); },
    "POLL",
    "delivery-ping:tenant-1:rep-1",
  ],
  [
    "foto de entrega (me/assignments/[id]/proof)",
    async () => { const m = await import("@/app/api/delivery/me/assignments/[id]/proof/route"); return () => m.POST(req("/api/delivery/me/assignments/asig-1/proof"), PARAMS); },
    "STRICT",
    "delivery-proof-upload:tenant-1:rep-1",
  ],
  [
    "entregar con foto (assignments/[id]/deliver)",
    async () => { const m = await import("@/app/api/delivery/assignments/[id]/deliver/route"); return () => m.POST(req("/api/delivery/assignments/asig-1/deliver"), PARAMS); },
    "STRICT",
    "delivery-deliver-upload:tenant-1:rep-1",
  ],
];

describe("límites de la operación diaria — después del login y por usuario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rl.mockImplementation(LLENO);
  });

  describe.each(PANEL)("%s", (_n, cargar, preset, clave) => {
    it("sin sesión: 401 sin gastar el cupo", async () => {
      h.admin.mockResolvedValue(SIN_SESION());
      const res = await (await cargar())();
      expect(res.status).toBe(401);
      expect(h.rl).not.toHaveBeenCalled();
    });

    it(`con sesión: ${preset} por negocio + usuario`, async () => {
      h.admin.mockResolvedValue(CAJERO);
      const res = await (await cargar())();
      expect(res.status).toBe(429);
      expect(h.rl).toHaveBeenCalledWith(expect.anything(), preset, clave);
    });
  });

  describe.each(REPARTO)("%s", (_n, cargar, preset, clave) => {
    it("sin sesión de repartidor: 401 sin gastar el cupo", async () => {
      h.partner.mockResolvedValue(SIN_SESION());
      const res = await (await cargar())();
      expect(res.status).toBe(401);
      expect(h.rl).not.toHaveBeenCalled();
    });

    it(`con sesión: ${preset} por repartidor`, async () => {
      h.partner.mockResolvedValue(PARTNER);
      const res = await (await cargar())();
      expect(res.status).toBe(429);
      expect(h.rl).toHaveBeenCalledWith(expect.anything(), preset, clave);
    });
  });
});

describe("límite real: lo que hace la app en un turno", () => {
  type RL = typeof import("@/lib/rate-limit");
  let real: RL;

  beforeEach(async () => {
    vi.clearAllMocks();
    real = await vi.importActual<RL>("@/lib/rate-limit");
    real.__resetInMemoryStores();
    h.rl.mockImplementation(real.applyRateLimit as (...a: unknown[]) => Response | null);
  });

  it("el repartidor en línea 15 min (ping cada 30 s) nunca recibe 429", async () => {
    h.partner.mockResolvedValue(PARTNER);
    const { POST } = await import("@/app/api/delivery/me/ping/route");
    const estados: number[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await POST(req("/api/delivery/me/ping", "POST", { lat: 999, lng: 0 })); // 400 = pasó el límite
      estados.push(res.status);
    }
    expect(estados.filter((s) => s === 429)).toHaveLength(0);
  });

  it("chat de la tienda abierto 5 min (sondeo cada 15 s): el cliente igual puede escribir", async () => {
    h.chatGet.mockResolvedValue([]);
    h.chatAdd.mockImplementation(async (_t: string, phone: string, name: string, _s: string, message: string) => ({ phone, name, message }));
    const { GET, POST } = await import("@/app/api/chat/route");
    for (let i = 0; i < 20; i++) {
      const res = await GET(req("/api/chat?phone=987654321", "GET"));
      expect(res.status).toBe(200);
    }
    const res = await POST(req("/api/chat", "POST", { phone: "987654321", name: "Ana", message: "¿Tienen arroz?" }));
    expect(res.status).toBe(201);
  });

  it("el POST del chat sigue con su tope anti-spam (STRICT: el 11.º en 15 min es 429)", async () => {
    h.chatAdd.mockResolvedValue({});
    const { POST } = await import("@/app/api/chat/route");
    const estados: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await POST(req("/api/chat", "POST", { phone: "987654321", message: `m${i}` }));
      estados.push(res.status);
    }
    expect(estados.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(estados[10]).toBe(429);
  });
});
