/**
 * @vitest-environment node
 *
 * Chat de invitado — hallazgos bajos de security-t4 (2026-10-17).
 *  2. El token del hilo no vencía → `<exp>.<firma>` con 30 días; vencido o del
 *     formato viejo sin `exp` = 401 (abrir de nuevo o iniciar sesión).
 *  4. `action=open` fijaba cualquier `orderId` y el GET mostraba estado, total
 *     e ítems de un pedido ajeno → sólo se fija el pedido de ESE celular, y el
 *     GET no muestra el de un hilo fijado antes a un pedido ajeno.
 *  5. `upload` y `upload-audio` guardaban archivos sin hilo ni token → piden
 *     el hilo abierto y su token (o la sesión verificada de ese celular).
 * (El punto 3, token fuera de Sentry, vive en telemetria-secretos-en-url.test.ts.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
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
  list: vi.fn(),
  orderGet: vi.fn(),
  subir: vi.fn(),
  sharp: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { store: { findUnique: h.storeFind }, $queryRawUnsafe: h.queryRaw },
}));
vi.mock("@/lib/db/chat.db", () => ({
  HiloYaAbiertoError: class HiloYaAbiertoError extends Error {},
  ChatThreadsDB: { openOrGet: h.openOrGet },
  ChatMessagesDB: { send: vi.fn(), listByThread: h.list, markAsRead: vi.fn(async () => undefined) },
}));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: { getById: h.orderGet } }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        upload: h.subir,
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/media/${p}` } }),
      }),
    },
  }),
}));
vi.mock("sharp", () => ({ default: h.sharp }));

const { POST, GET } = await import("@/app/api/chat/public/route");
const subirFoto = await import("@/app/api/chat/public/upload/route");
const subirAudio = await import("@/app/api/chat/public/upload-audio/route");
const { firmarTokenHilo, estadoTokenHilo, VIDA_TOKEN_HILO_SEG } = await import("@/lib/chat/thread-token");
const { createCustomerToken, CUSTOMER_SESSION } = await import("@/lib/auth/customer-session");

const TENANT = "tenant-main";
const STORE = { id: "store-1", tenantId: TENANT, isPublished: true, name: "Bodega Demo" };
const TEL = "999000111";
const AJENO = "988777666";
const HILO = "thread-1";
const fila = (extra: Record<string, unknown> = {}) => ({ customerPhone: TEL, storeId: "store-1", status: "open", orderId: null, ...extra });
const pedidoDe = (tel: string) => ({
  id: "order-abc123",
  status: "pending",
  total: 87.5,
  createdAt: "2026-10-16T12:00:00.000Z",
  customer: { name: "Otra Persona", phone: tel },
  items: [{ name: "Arroz 5 kg", quantity: 2 }],
});

function pedido(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; cookie?: string } = {}): NextRequest {
  const r = new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (init.cookie) r.cookies.set(CUSTOMER_SESSION.COOKIE_NAME, init.cookie);
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.storeFind.mockResolvedValue(STORE);
  h.queryRaw.mockResolvedValue([fila()]);
  h.list.mockResolvedValue([]);
  h.openOrGet.mockImplementation(async (p: { orderId?: string }) => ({
    id: HILO,
    customerPhone: TEL,
    status: "open",
    unreadForBuyer: 0,
    createdAt: "2026-10-17T05:00:00.000Z",
    orderId: p.orderId ?? null,
  }));
  h.subir.mockResolvedValue({ error: null });
  h.sharp.mockImplementation(() => ({
    resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.from("webp") }) }),
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("2 · el token del hilo vence a los 30 días", () => {
  const urlLeer = `/api/chat/public?threadId=${HILO}&storeSlug=bodega-demo&customerPhone=${TEL}`;

  it("recién firmado vale; un día antes de vencer vale; al pasar los 30 días, 401", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T05:00:00Z"));
    const token = firmarTokenHilo(TENANT, HILO, TEL);
    expect(token).toMatch(/^\d+\.[\w-]+$/);
    expect((await GET(pedido(urlLeer, { headers: { "x-chat-token": token } }))).status).toBe(200);

    vi.setSystemTime(new Date(Date.parse("2026-10-17T05:00:00Z") + (VIDA_TOKEN_HILO_SEG - 86_400) * 1000));
    expect(estadoTokenHilo(TENANT, HILO, TEL, token)).toBe("ok");

    vi.setSystemTime(new Date(Date.parse("2026-10-17T05:00:00Z") + (VIDA_TOKEN_HILO_SEG + 1) * 1000));
    expect(estadoTokenHilo(TENANT, HILO, TEL, token)).toBe("vencido");
    h.list.mockClear();
    const res = await GET(pedido(urlLeer, { headers: { "x-chat-token": token } }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("CHAT_TOKEN_REQUERIDO");
    expect(h.list).not.toHaveBeenCalled();
  });

  it("alargar el `exp` a mano rompe la firma: 403", async () => {
    const token = firmarTokenHilo(TENANT, HILO, TEL);
    const [exp, sig] = token.split(".");
    const alargado = `${Number(exp) + 10 * VIDA_TOKEN_HILO_SEG}.${sig}`;
    expect(estadoTokenHilo(TENANT, HILO, TEL, alargado)).toBe("invalido");
    expect((await GET(pedido(urlLeer, { headers: { "x-chat-token": alargado } }))).status).toBe(403);
  });

  it("token del formato viejo (sin `exp`, válido antes de T4): 401 como vencido", async () => {
    const clave = createHmac("sha256", process.env.AUTH_SECRET ?? "").update("buleje-chat-hilo/v1").digest();
    const viejo = createHmac("sha256", clave).update(`${TENANT}:${HILO}:${TEL}`).digest().toString("base64url");
    expect(estadoTokenHilo(TENANT, HILO, TEL, viejo)).toBe("vencido");
    expect((await GET(pedido(urlLeer, { headers: { "x-chat-token": viejo } }))).status).toBe(401);
    // Uno viejo de OTRO hilo sigue siendo ajeno (403), no «vencido».
    const viejoAjeno = createHmac("sha256", clave).update(`${TENANT}:thread-otro:${TEL}`).digest().toString("base64url");
    expect(estadoTokenHilo(TENANT, HILO, TEL, viejoAjeno)).toBe("invalido");
  });

  it("con la sesión verificada del celular se sigue leyendo aunque el token venza", async () => {
    const sesion = await createCustomerToken({ customerId: TEL, email: `${TEL}@p`, name: "Ana", tenantId: TENANT, provider: "phone" });
    expect((await GET(pedido(urlLeer, { headers: { "x-chat-token": "1.x" }, cookie: sesion }))).status).toBe(200);
  });
});

describe("4 · open sólo fija el pedido de ESE celular", () => {
  const abrir = (orderId: string) =>
    POST(pedido("/api/chat/public?action=open", {
      method: "POST",
      body: { storeSlug: "bodega-demo", customerPhone: TEL, customerName: "Ana", orderId },
    }));

  it("pedido de otro celular: el hilo se abre SIN pedido", async () => {
    h.orderGet.mockResolvedValue(pedidoDe(AJENO));
    const res = await abrir("order-abc123");
    expect(res.status).toBe(200);
    expect(h.orderGet).toHaveBeenCalledWith(TENANT, "order-abc123");
    expect(h.openOrGet.mock.calls[0]![0].orderId).toBeUndefined();
  });

  it("pedido inexistente: sin pedido", async () => {
    h.orderGet.mockResolvedValue(null);
    await abrir("order-no-existe");
    expect(h.openOrGet.mock.calls[0]![0].orderId).toBeUndefined();
  });

  it("pedido propio (+51 y espacios cuentan igual): se fija", async () => {
    h.orderGet.mockResolvedValue(pedidoDe("+51 999 000 111"));
    await abrir("order-abc123");
    expect(h.openOrGet.mock.calls[0]![0].orderId).toBe("order-abc123");
  });

  it("GET de un hilo fijado ANTES a un pedido ajeno: sin estado, total ni ítems", async () => {
    h.queryRaw.mockResolvedValue([fila({ orderId: "order-abc123" })]);
    h.orderGet.mockResolvedValue(pedidoDe(AJENO));
    const token = firmarTokenHilo(TENANT, HILO, TEL);
    const res = await GET(pedido(`/api/chat/public?threadId=${HILO}&storeSlug=bodega-demo&customerPhone=${TEL}`, { headers: { "x-chat-token": token } }));
    expect(res.status).toBe(200);
    expect((await res.json()).orderContext).toBeNull();
  });

  it("GET con el pedido propio: muestra su contexto", async () => {
    h.queryRaw.mockResolvedValue([fila({ orderId: "order-abc123" })]);
    h.orderGet.mockResolvedValue(pedidoDe(TEL));
    const token = firmarTokenHilo(TENANT, HILO, TEL);
    const res = await GET(pedido(`/api/chat/public?threadId=${HILO}&storeSlug=bodega-demo&customerPhone=${TEL}`, { headers: { "x-chat-token": token } }));
    expect((await res.json()).orderContext).toMatchObject({ total: 87.5, itemCount: 2 });
  });
});

describe("5 · las subidas piden el hilo abierto y su token", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const WEBM = new Uint8Array(300).fill(0, 4).map((b, i) => [0x1a, 0x45, 0xdf, 0xa3][i] ?? b); // ≥256 bytes (el mínimo del audio)
  const casos = [
    ["foto", subirFoto, () => new File([PNG], "c.png", { type: "image/png" })],
    ["nota de voz", subirAudio, () => new File([WEBM], "n.webm", { type: "audio/webm" })],
  ] as const;

  function subida(file: File, campos: Record<string, string>, cookie?: string): NextRequest {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    fd.append("file", file);
    const r = new NextRequest("http://localhost/api/chat/public/upload", { method: "POST", body: fd });
    if (cookie) r.cookies.set(CUSTOMER_SESSION.COOKIE_NAME, cookie);
    return r;
  }
  const hilo = { threadId: HILO, storeSlug: "bodega-demo", customerPhone: TEL };

  it.each(casos)("%s sin hilo ni token: 401 y no sube nada", async (_n, ruta, archivo) => {
    const res = await ruta.POST(subida(archivo(), {}));
    expect(res.status).toBe(401);
    expect(h.subir).not.toHaveBeenCalled();
  });

  it.each(casos)("%s con hilo pero sin token: 401", async (_n, ruta, archivo) => {
    const res = await ruta.POST(subida(archivo(), hilo));
    expect(res.status).toBe(401);
    expect(h.subir).not.toHaveBeenCalled();
  });

  it.each(casos)("%s con el token de OTRO hilo: 403", async (_n, ruta, archivo) => {
    const res = await ruta.POST(subida(archivo(), { ...hilo, threadToken: firmarTokenHilo(TENANT, "thread-otro", TEL) }));
    expect(res.status).toBe(403);
    expect(h.subir).not.toHaveBeenCalled();
  });

  it.each(casos)("%s en una conversación cerrada: 409", async (_n, ruta, archivo) => {
    h.queryRaw.mockResolvedValue([fila({ status: "closed" })]);
    const res = await ruta.POST(subida(archivo(), { ...hilo, threadToken: firmarTokenHilo(TENANT, HILO, TEL) }));
    expect(res.status).toBe(409);
    expect(h.subir).not.toHaveBeenCalled();
  });

  it.each(casos)("%s con el token del hilo: 200 y sube", async (_n, ruta, archivo) => {
    const res = await ruta.POST(subida(archivo(), { ...hilo, threadToken: firmarTokenHilo(TENANT, HILO, TEL) }));
    expect(res.status).toBe(200);
    expect(h.subir).toHaveBeenCalledTimes(1);
    expect((await res.json()).url).toContain("https://cdn.test/media/chat");
  });

  it.each(casos)("%s con la sesión verificada del celular (sin token): 200", async (_n, ruta, archivo) => {
    const sesion = await createCustomerToken({ customerId: TEL, email: `${TEL}@p`, name: "Ana", tenantId: TENANT, provider: "phone" });
    const res = await ruta.POST(subida(archivo(), hilo, sesion));
    expect(res.status).toBe(200);
  });
});
