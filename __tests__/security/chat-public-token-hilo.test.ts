/**
 * Chat de invitado (`/api/chat/public` y su stream) — privacidad del hilo
 * (Ley 29733, 2026-10-17).
 *
 * Antes: `action=open` con un celular cualquiera devolvía el hilo abierto de
 * esa persona y el GET entregaba sus mensajes sin sesión (probado en localhost:
 * 200 con 7 mensajes de «Cliente Prueba»). Ahora leer o seguir un hilo pide
 * el token que el servidor firma al abrirlo, o la sesión verificada de ese
 * celular; abrir uno NUEVO sigue sin sesión.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/sentry-alerts", () => ({ reportCriticalError: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (flag: string) => flag === "marketplace-chat-public",
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/cache", () => ({
  getOrSet: async <T>(_k: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
  revalidateTenantTag: vi.fn(),
}));
vi.mock("@/lib/sse-emitter", () => ({ emitAdminSSE: vi.fn() }));

const h = vi.hoisted(() => ({
  storeFind: vi.fn(),
  queryRaw: vi.fn(),
  openOrGet: vi.fn(),
  send: vi.fn(),
  list: vi.fn(),
  markAsRead: vi.fn(),
  react: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { store: { findUnique: h.storeFind }, $queryRawUnsafe: h.queryRaw },
}));
vi.mock("@/lib/db/chat.db", () => ({
  HiloYaAbiertoError: class HiloYaAbiertoError extends Error {},
  ChatThreadsDB: { openOrGet: h.openOrGet },
  ChatMessagesDB: {
    send: h.send,
    listByThread: h.list,
    markAsRead: h.markAsRead,
    reactToMessage: h.react,
  },
}));

const { POST, GET } = await import("@/app/api/chat/public/route");
const stream = await import("@/app/api/chat/public/stream/route");
const { firmarTokenHilo, verificarTokenHilo } = await import("@/lib/chat/thread-token");
const { createCustomerToken, CUSTOMER_SESSION } = await import("@/lib/auth/customer-session");

const TENANT = "tenant-main";
const STORE = { id: "store-1", tenantId: TENANT, isPublished: true, name: "Bodega Demo" };
const TEL = "999000111";
const HILO = "thread-victima";
const FILA_HILO = { customerPhone: TEL, storeId: "store-1", status: "open", orderId: null };
const TOKEN_OK = firmarTokenHilo(TENANT, HILO, TEL);
const TOKEN_OTRO_HILO = firmarTokenHilo(TENANT, "thread-del-atacante", TEL);
const MSGS = [
  { id: "m1", senderType: "buyer", senderName: "Cliente Prueba", body: "Mi dirección es…", createdAt: "2026-10-17T05:00:00.000Z" },
];

function pedido(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; cookie?: string; signal?: AbortSignal } = {},
): NextRequest {
  const r = new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  if (init.cookie) r.cookies.set(CUSTOMER_SESSION.COOKIE_NAME, init.cookie);
  return r;
}

const urlLeer = `/api/chat/public?threadId=${HILO}&storeSlug=bodega-demo&customerPhone=${TEL}`;
const sesionDe = (tel: string) =>
  createCustomerToken({ customerId: tel, email: `${tel}@prueba`, name: "Ana", tenantId: TENANT, provider: "phone" });

beforeEach(() => {
  vi.clearAllMocks();
  h.storeFind.mockResolvedValue(STORE);
  h.queryRaw.mockResolvedValue([FILA_HILO]);
  h.list.mockResolvedValue(MSGS);
  h.markAsRead.mockResolvedValue(undefined);
  h.openOrGet.mockImplementation(async (p: { soloNuevo?: boolean }) => ({
    id: p.soloNuevo ? "thread-nuevo" : HILO,
    customerPhone: TEL,
    status: "open",
    unreadForBuyer: 0,
    createdAt: "2026-10-17T05:00:00.000Z",
  }));
});

describe("GET /api/chat/public — leer un hilo pide su token o la sesión del celular", () => {
  it("sin token ni sesión: 401 y no lee ningún mensaje", async () => {
    const res = await GET(pedido(urlLeer));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("CHAT_TOKEN_REQUERIDO");
    expect(h.list).not.toHaveBeenCalled();
    expect(h.markAsRead).not.toHaveBeenCalled();
  });

  it("token de OTRA conversación: 403", async () => {
    const res = await GET(pedido(urlLeer, { headers: { "x-chat-token": TOKEN_OTRO_HILO } }));
    expect(res.status).toBe(403);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("token de otro negocio (mismo hilo y celular): 403", async () => {
    const ajeno = firmarTokenHilo("tenant-otro", HILO, TEL);
    const res = await GET(pedido(urlLeer, { headers: { "x-chat-token": ajeno } }));
    expect(res.status).toBe(403);
  });

  it("token basura: 403", async () => {
    const res = await GET(pedido(urlLeer, { headers: { "x-chat-token": "no-es-un-token" } }));
    expect(res.status).toBe(403);
  });

  it("token correcto (header): 200 con sus mensajes", async () => {
    const res = await GET(pedido(urlLeer, { headers: { "x-chat-token": TOKEN_OK } }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
  });

  it("token correcto en la query también vale", async () => {
    const res = await GET(pedido(`${urlLeer}&threadToken=${encodeURIComponent(TOKEN_OK)}`));
    expect(res.status).toBe(200);
  });

  it("sesión verificada de ESE celular, sin token: 200", async () => {
    const res = await GET(pedido(urlLeer, { cookie: await sesionDe(TEL) }));
    expect(res.status).toBe(200);
  });

  it("sesión de OTRO celular sin token: 401", async () => {
    const res = await GET(pedido(urlLeer, { cookie: await sesionDe("912345678") }));
    expect(res.status).toBe(401);
  });
});

describe("POST action=open — abrir sin sesión ya no entrega el hilo de otro", () => {
  const abrir = (cookie?: string) =>
    POST(
      pedido("/api/chat/public?action=open", {
        method: "POST",
        body: { storeSlug: "bodega-demo", customerPhone: TEL, customerName: "Atacante" },
        cookie,
      }),
    );

  it("sin sesión y sin hilo abierto: 200, crea uno NUEVO y su token sólo abre ese", async () => {
    const res = await abrir();
    expect(res.status).toBe(200);
    expect(h.openOrGet).toHaveBeenCalledWith(expect.objectContaining({ soloNuevo: true }));
    const { data } = await res.json();
    expect(data.threadId).toBe("thread-nuevo");
    expect(verificarTokenHilo(TENANT, "thread-nuevo", TEL, data.threadToken)).toBe(true);
    expect(verificarTokenHilo(TENANT, HILO, TEL, data.threadToken)).toBe(false);
  });

  it("sin sesión y ese celular YA tiene uno abierto: 401, sin hilo ni token", async () => {
    const { HiloYaAbiertoError } = await import("@/lib/db/chat.db");
    h.openOrGet.mockRejectedValueOnce(new HiloYaAbiertoError());
    const res = await abrir();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("CHAT_INICIA_SESION");
    expect(json.data).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain(HILO);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("con la sesión verificada de ese celular: recupera su hilo abierto", async () => {
    const res = await abrir(await sesionDe(TEL));
    expect(res.status).toBe(200);
    expect(h.openOrGet).toHaveBeenCalledWith(expect.objectContaining({ soloNuevo: false }));
    expect((await res.json()).data.threadId).toBe(HILO);
  });
});

describe("POST send/react/typing — escribir en un hilo pide la misma prueba", () => {
  const cuerpo = { threadId: HILO, storeSlug: "bodega-demo", customerPhone: TEL, customerName: "X", body: "hola" };

  it("send sin token: 401 y no escribe", async () => {
    const res = await POST(pedido("/api/chat/public?action=send", { method: "POST", body: cuerpo }));
    expect(res.status).toBe(401);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("send con token de otro hilo: 403 y no escribe", async () => {
    const res = await POST(
      pedido("/api/chat/public?action=send", { method: "POST", body: { ...cuerpo, threadToken: TOKEN_OTRO_HILO } }),
    );
    expect(res.status).toBe(403);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("react sin token: 401", async () => {
    const res = await POST(
      pedido("/api/chat/public?action=react", {
        method: "POST",
        body: { threadId: HILO, storeSlug: "bodega-demo", customerPhone: TEL, messageId: "m1", emoji: "👍" },
      }),
    );
    expect(res.status).toBe(401);
    expect(h.react).not.toHaveBeenCalled();
  });

  it("typing con token correcto: 200", async () => {
    const res = await POST(
      pedido("/api/chat/public?action=typing", {
        method: "POST",
        body: { threadId: HILO, storeSlug: "bodega-demo", customerPhone: TEL, threadToken: TOKEN_OK },
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/chat/public/stream — escuchar un hilo pide la misma prueba", () => {
  const urlStream = `/api/chat/public/stream?threadId=${HILO}&storeSlug=bodega-demo&customerPhone=${TEL}`;
  let corte: AbortController;
  beforeEach(() => { corte = new AbortController(); });
  afterEach(() => corte.abort());

  it("sin token: 401", async () => {
    const res = await stream.GET(pedido(urlStream));
    expect(res.status).toBe(401);
  });

  it("token de otro hilo: 403", async () => {
    const res = await stream.GET(pedido(`${urlStream}&threadToken=${encodeURIComponent(TOKEN_OTRO_HILO)}`));
    expect(res.status).toBe(403);
  });

  it("token correcto: abre el stream", async () => {
    const res = await stream.GET(
      pedido(`${urlStream}&threadToken=${encodeURIComponent(TOKEN_OK)}`, { signal: corte.signal }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });
});

describe("lib/chat/thread-token", () => {
  it("el celular se compara normalizado (+51, espacios)", () => {
    expect(verificarTokenHilo(TENANT, HILO, "+51 999 000 111", TOKEN_OK)).toBe(true);
    expect(verificarTokenHilo(TENANT, HILO, "999000112", TOKEN_OK)).toBe(false);
  });

  it("sigue valiendo durante la rotación de AUTH_SECRET", () => {
    const viejo = process.env.AUTH_SECRET;
    vi.stubEnv("AUTH_SECRET", "secreto-nuevo-de-al-menos-32-caracteres!!");
    vi.stubEnv("AUTH_SECRET_PREVIOUS", viejo ?? "");
    try {
      expect(verificarTokenHilo(TENANT, HILO, TEL, TOKEN_OK)).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
