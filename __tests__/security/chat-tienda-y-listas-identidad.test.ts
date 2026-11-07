/**
 * @vitest-environment node
 *
 * Security 2026-10-17 (Ley 29733).
 *  1. `GET /api/chat?phone=` devolvía la conversación (nombre completo +
 *     mensajes) a cualquiera que supiera el celular, sin sesión. Medido en
 *     local: 200 con 2 mensajes de un cliente real de `main`. Ahora exige la
 *     cookie de cliente que PROBÓ ese celular.
 *  2. `POST /api/chat` dejaba escribir como "sistema"/"bot" sin sesión y, con
 *     sesión, a nombre de otro celular. T4 (17-10): sin sesión tampoco se
 *     escribe con el celular de otro y nadie escribe como "sistema"/"bot": el
 *     aviso «sin respuesta» lo arma `/api/chat/auto-reply` con la cookie.
 *  3. `/api/shopping-lists` (y `[id]`) no pedían sesión en la ruta (la salvaba
 *     el proxy) y tomaban el negocio del pedido, no de la sesión.
 *  4. `POST /api/admin/whatsapp/suggest`: cualquier sesión del panel, sin tope
 *     de gasto de IA. Ahora roles de `comunicaciones` + presupuesto del plan +
 *     tope diario por negocio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  chatGet: vi.fn(),
  chatAdd: vi.fn(),
  listasGet: vi.fn(),
  listasAdd: vi.fn(),
  admin: vi.fn(),
  canSpend: vi.fn(),
  diaCheck: vi.fn(),
  generateText: vi.fn(),
  waList: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  cacheStore: { get: vi.fn(() => null), set: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  createDistributedRateLimiter: () => ({ check: h.diaCheck }),
}));
vi.mock("@/lib/tenant", () => ({ getTenantIdFromRequest: () => "tenant-host" }));
vi.mock("@/lib/jsondb", () => ({
  ChatDB: { getByPhone: h.chatGet, add: h.chatAdd },
  ShoppingListsDB: { getByPhone: h.listasGet, add: h.listasAdd },
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.admin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("ai", () => ({ generateText: h.generateText }));
vi.mock("@/lib/ai/provider", () => ({
  chatModel: {},
  chatModelId: "claude-haiku-5-5",
  getActiveProvider: () => "anthropic",
}));
vi.mock("@/lib/ai/cost-control", () => ({
  aiCostGuard: { canSpend: h.canSpend, recordSpend: vi.fn() },
}));
vi.mock("@/lib/db/whatsapp-messages.db", () => ({
  WhatsAppMessagesDB: { listMessages: h.waList },
}));
vi.mock("@/lib/ai-config", () => ({ getActiveProvider: () => null, chatCompletion: vi.fn() }));
vi.mock("@/lib/db/products.db", () => ({ ProductsDB: { getAll: vi.fn(async () => []) } }));

const { createCustomerToken, CUSTOMER_SESSION } = await import("@/lib/auth/customer-session");
const chat = await import("@/app/api/chat/route");
const listas = await import("@/app/api/shopping-lists/route");
const listaPorId = await import("@/app/api/shopping-lists/[id]/route");
const sugerir = await import("@/app/api/admin/whatsapp/suggest/route");
const autoRespuesta = await import("@/app/api/chat/auto-reply/route");

const MIO = "987654321";
const AJENO = "912345678";
const SIN_SESION = () => NextResponse.json({ error: "No autorizado" }, { status: 401 });

function pedido(url: string, method = "GET", body?: unknown, cookie?: string): NextRequest {
  const r = new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", "x-tenant-id": "tenant-host" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (cookie) r.cookies.set(CUSTOMER_SESSION.COOKIE_NAME, cookie);
  return r;
}

const sesion = (provider: string, customerId?: string, extra: Record<string, unknown> = {}) =>
  createCustomerToken({
    customerId,
    email: `${customerId ?? "x"}@prueba`,
    name: "Ana",
    tenantId: "tenant-host",
    provider,
    ...extra,
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.chatGet.mockResolvedValue([{ id: "m1", customerName: "Ana Pérez", message: "hola" }]);
  h.chatAdd.mockImplementation(async (_t: string, phone: string) => ({ id: "m2", phone }));
});

describe("GET /api/chat — leer exige la sesión de ESE celular", () => {
  it("sin cookie: 401 y no lee nada", async () => {
    const res = await chat.GET(pedido(`/api/chat?phone=${MIO}`));
    expect(res.status).toBe(401);
    expect(h.chatGet).not.toHaveBeenCalled();
  });

  it("token de seguimiento de un pedido de invitado: 401 (no prueba el celular)", async () => {
    const t = await sesion("checkout", MIO, { pedidos: ["o1"] });
    const res = await chat.GET(pedido(`/api/chat?phone=${MIO}`, "GET", undefined, t));
    expect(res.status).toBe(401);
    expect(h.chatGet).not.toHaveBeenCalled();
  });

  it("login de Google: 401 (prueba un correo, no un celular)", async () => {
    const t = await sesion("google", "google_1177");
    const res = await chat.GET(pedido(`/api/chat?phone=${MIO}`, "GET", undefined, t));
    expect(res.status).toBe(401);
  });

  it("sesión verificada pidiendo el celular de OTRO: 403", async () => {
    const t = await sesion("phone", MIO);
    const res = await chat.GET(pedido(`/api/chat?phone=${AJENO}`, "GET", undefined, t));
    expect(res.status).toBe(403);
    expect(h.chatGet).not.toHaveBeenCalled();
  });

  it("sesión verificada pidiendo el suyo: 200 con su conversación", async () => {
    const t = await sesion("phone", MIO);
    const res = await chat.GET(pedido(`/api/chat?phone=${MIO}`, "GET", undefined, t));
    expect(res.status).toBe(200);
    expect(h.chatGet).toHaveBeenCalledWith("tenant-host", MIO);
  });
});

describe("POST /api/chat — escribir exige la sesión de ESE celular (security 17-10, T4)", () => {
  it("sin sesión no se escribe como el sistema: 401", async () => {
    const res = await chat.POST(pedido("/api/chat", "POST", { phone: "sistema", message: "⚠️ falso" }));
    expect(res.status).toBe(401);
    expect(h.chatAdd).not.toHaveBeenCalled();
  });

  it("invitado sin sesión con el celular de OTRO cliente: 401 y no se guarda", async () => {
    const res = await chat.POST(pedido("/api/chat", "POST", { phone: AJENO, message: "cancelen mi pedido" }));
    expect(res.status).toBe(401);
    expect(h.chatAdd).not.toHaveBeenCalled();
  });

  it.each([
    ["seguimiento de un pedido de invitado", () => sesion("checkout", undefined, { pedidos: ["o1"] })],
    ["login de Google", () => sesion("google", "google_123")],
  ])("%s: 401 (no prueba el celular)", async (_n, token) => {
    const res = await chat.POST(pedido("/api/chat", "POST", { phone: MIO, message: "hola" }, await token()));
    expect(res.status).toBe(401);
    expect(h.chatAdd).not.toHaveBeenCalled();
  });

  it("con sesión, a nombre de otro celular: 403", async () => {
    const t = await sesion("phone", MIO);
    const res = await chat.POST(pedido("/api/chat", "POST", { phone: AJENO, message: "hola" }, t));
    expect(res.status).toBe(403);
    expect(h.chatAdd).not.toHaveBeenCalled();
  });

  it.each(["sistema", "bot"])("con sesión, escribir como «%s»: 403 (el aviso lo arma el servidor)", async (phone) => {
    const t = await sesion("phone", MIO);
    const res = await chat.POST(pedido("/api/chat", "POST", { phone, name: "Bot", message: "no pude" }, t));
    expect(res.status).toBe(403);
    expect(h.chatAdd).not.toHaveBeenCalled();
  });

  it("con sesión, en su propia conversación: 201 en el negocio del host", async () => {
    const t = await sesion("phone", MIO);
    const res = await chat.POST(pedido("/api/chat", "POST", { phone: MIO, name: "Ana", message: "¿Tienen arroz?" }, t));
    expect(res.status).toBe(201);
    expect(h.chatAdd).toHaveBeenCalledWith("tenant-host", MIO, "Ana", "customer", "¿Tienen arroz?");
  });

  it("mensaje vacío o de más de 500: 400", async () => {
    const t = await sesion("phone", MIO);
    const vacio = await chat.POST(pedido("/api/chat", "POST", { phone: MIO, message: "  " }, t));
    const largo = await chat.POST(pedido("/api/chat", "POST", { phone: MIO, message: "x".repeat(501) }, t));
    expect([vacio.status, largo.status]).toEqual([400, 400]);
  });
});

describe("POST /api/chat/auto-reply — el aviso «sin respuesta» lo arma el servidor", () => {
  const RARA = "zzqx wvbn plok";

  it("con sesión verificada: un aviso en «sistema» con nombre y celular de la COOKIE", async () => {
    const t = await sesion("phone", MIO);
    const res = await autoRespuesta.POST(pedido("/api/chat/auto-reply", "POST", { message: RARA }, t));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe("fallback");
    expect(h.chatAdd).toHaveBeenCalledTimes(1);
    const [tenant, phone, nombre, sender, texto] = h.chatAdd.mock.calls[0]!;
    expect([tenant, phone, nombre, sender]).toEqual(["tenant-host", "sistema", "Bot", "customer"]);
    expect(texto).toContain(`Ana (${MIO})`);
    expect(texto).toContain(RARA);
  });

  it("sin sesión o con Google: contesta igual pero no escribe en la bandeja", async () => {
    const sin = await autoRespuesta.POST(pedido("/api/chat/auto-reply", "POST", { message: RARA }));
    const google = await autoRespuesta.POST(
      pedido("/api/chat/auto-reply", "POST", { message: RARA }, await sesion("google", "google_123")),
    );
    expect([sin.status, google.status]).toEqual([200, 200]);
    expect(h.chatAdd).not.toHaveBeenCalled();
  });

  it("si la bandeja falla, el cliente igual recibe su respuesta", async () => {
    h.chatAdd.mockRejectedValueOnce(new Error("db caída"));
    const res = await autoRespuesta.POST(pedido("/api/chat/auto-reply", "POST", { message: RARA }, await sesion("phone", MIO)));
    expect(res.status).toBe(200);
  });
});

describe("/api/shopping-lists — sólo el panel, negocio de la sesión", () => {
  it.each([
    ["GET", () => listas.GET(pedido(`/api/shopping-lists?phone=${MIO}`))],
    ["GET [id]", () => listaPorId.GET(pedido(`/api/shopping-lists/x?phone=${MIO}`))],
    ["POST", () => listas.POST(pedido("/api/shopping-lists", "POST", { customerPhone: MIO, name: "Semana" }))],
  ])("%s sin sesión: 401 sin tocar la base", async (_n, llamar) => {
    h.admin.mockImplementation(SIN_SESION);
    const res = await llamar();
    expect(res.status).toBe(401);
    expect(h.listasGet).not.toHaveBeenCalled();
    expect(h.listasAdd).not.toHaveBeenCalled();
  });

  it("lee con el negocio de la sesión aunque el pedido diga otro", async () => {
    h.admin.mockResolvedValue({ role: "cajero", username: "c1", tenantId: "tenant-sesion" });
    h.listasGet.mockResolvedValue([]);
    const res = await listas.GET(pedido(`/api/shopping-lists?phone=${MIO}`));
    expect(res.status).toBe(200);
    expect(h.listasGet).toHaveBeenCalledWith("tenant-sesion", MIO);
    const roles = h.admin.mock.calls[0][1] as string[];
    expect(roles).toContain("cajero");
    expect(roles).not.toContain("delivery");
  });

  it("alta: sólo gerencia y cuerpo validado", async () => {
    h.admin.mockResolvedValue({ role: "admin", username: "a1", tenantId: "tenant-sesion" });
    const malo = await listas.POST(pedido("/api/shopping-lists", "POST", { customerPhone: MIO }));
    expect(malo.status).toBe(400);
    h.listasAdd.mockResolvedValue({ id: "l1" });
    const ok = await listas.POST(pedido("/api/shopping-lists", "POST", { customerPhone: MIO, name: "Semana" }));
    expect(ok.status).toBe(201);
    expect(h.listasAdd).toHaveBeenCalledWith({ customerPhone: MIO, name: "Semana", items: [], tenantId: "tenant-sesion" });
    expect(h.admin.mock.calls.at(-1)?.[1]).toEqual(["admin", "owner", "manager"]);
  });
});

describe("POST /api/admin/whatsapp/suggest — roles y tope de IA", () => {
  const cuerpo = { phone: "51987654321" };
  beforeEach(() => {
    h.admin.mockResolvedValue({ role: "cajero", username: "c1", tenantId: "tenant-sesion" });
    h.waList.mockResolvedValue([{ body: "¿tienen arroz?", direction: "in", sentBy: null }]);
    h.canSpend.mockResolvedValue(true);
    h.diaCheck.mockResolvedValue(true);
    h.generateText.mockResolvedValue({ text: '{"suggestions":["Sí","Claro","Te confirmo"]}', usage: {} });
  });

  it("pide los roles de la bandeja (sin almacenero ni analista)", async () => {
    await sugerir.POST(pedido("/api/admin/whatsapp/suggest", "POST", cuerpo));
    const roles = h.admin.mock.calls[0][1] as string[];
    expect(roles).toEqual(expect.arrayContaining(["cajero", "tienda_owner"]));
    expect(roles).not.toContain("almacenero");
    expect(roles).not.toContain("analista");
  });

  it("sin sesión: 401 y no llama a la IA", async () => {
    h.admin.mockImplementation(SIN_SESION);
    const res = await sugerir.POST(pedido("/api/admin/whatsapp/suggest", "POST", cuerpo));
    expect(res.status).toBe(401);
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("presupuesto del plan agotado: genéricas, sin llamar a la IA", async () => {
    h.canSpend.mockResolvedValue(false);
    const res = await sugerir.POST(pedido("/api/admin/whatsapp/suggest", "POST", cuerpo));
    expect(await res.json()).toMatchObject({ source: "tope" });
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("tope diario del negocio: genéricas, sin llamar a la IA", async () => {
    h.diaCheck.mockResolvedValue(false);
    const res = await sugerir.POST(pedido("/api/admin/whatsapp/suggest", "POST", cuerpo));
    expect(await res.json()).toMatchObject({ source: "tope" });
    expect(h.diaCheck).toHaveBeenCalledWith("tenant-sesion");
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("dentro del tope: las 3 de la IA", async () => {
    const res = await sugerir.POST(pedido("/api/admin/whatsapp/suggest", "POST", cuerpo));
    expect(await res.json()).toEqual({ suggestions: ["Sí", "Claro", "Te confirmo"], source: "ai" });
    expect(h.canSpend).toHaveBeenCalledWith("tenant-sesion", expect.any(Number));
  });
});
