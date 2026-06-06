/**
 * app/api/chat/public/route.ts — unit tests
 *
 * Cubre:
 *   - Feature flag gate (503 si marketplace-chat-public=false)
 *   - Validación Zod (body vacío, formatos inválidos)
 *   - Ownership validation (customerPhone + storeId deben matchear)
 *   - Apertura de thread (happy path + con firstMessage)
 *   - Envío de mensajes (happy path + thread cerrado)
 *   - Listado de mensajes (con auto-markAsRead fire-and-forget)
 *   - Store no publicada → 404
 *
 * Total: 12 tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// ─── Mock logger ───────────────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Mock Sentry ───────────────────────────────────────────────────────────
vi.mock("@/lib/sentry-alerts", () => ({
  reportCriticalError: vi.fn(),
}));

// ─── Mock feature flags ────────────────────────────────────────────────────
const { mockIsFeatureEnabled } = vi.hoisted(() => ({
  mockIsFeatureEnabled: vi.fn((flag: string) => flag === "marketplace-chat-public"),
}));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
}));

// ─── Mock cache ────────────────────────────────────────────────────────────
vi.mock("@/lib/cache", () => ({
  getOrSet: async <T>(_k: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidateByPrefix: vi.fn(),
}));

// ─── Mock prisma + chat DB classes ─────────────────────────────────────────
const {
  mockFindUnique,
  mockQueryRawUnsafe,
  mockExecuteRawUnsafe,
  mockTransaction,
  mockThreadsOpenOrGet,
  mockMessagesSend,
  mockMessagesListByThread,
  mockMessagesMarkAsRead,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockQueryRawUnsafe: vi.fn(),
  mockExecuteRawUnsafe: vi.fn(),
  mockTransaction: vi.fn(),
  mockThreadsOpenOrGet: vi.fn(),
  mockMessagesSend: vi.fn(),
  mockMessagesListByThread: vi.fn(),
  mockMessagesMarkAsRead: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store: { findUnique: mockFindUnique },
    $queryRawUnsafe: mockQueryRawUnsafe,
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/chat.db", () => ({
  ChatThreadsDB: {
    openOrGet: mockThreadsOpenOrGet,
  },
  ChatMessagesDB: {
    send: mockMessagesSend,
    listByThread: mockMessagesListByThread,
    markAsRead: mockMessagesMarkAsRead,
  },
}));

// Import AFTER mocks
import { POST, GET } from "@/app/api/chat/public/route";

const STORE_PUBLISHED = {
  id: "store-1",
  tenantId: "tenant-main",
  isPublished: true,
  name: "Bodega Demo",
};

const THREAD_OK = {
  id: "thread-1",
  tenantId: "tenant-main",
  storeId: "store-1",
  orderId: null,
  customerPhone: "+51987654321",
  customerName: "María",
  subject: null,
  status: "open" as const,
  unreadForBuyer: 0,
  unreadForSeller: 0,
  lastMessageAt: null,
  lastMessageText: null,
  lastSenderType: null,
  closedAt: null,
  closedReason: null,
  createdAt: "2026-04-08T20:00:00.000Z",
  updatedAt: "2026-04-08T20:00:00.000Z",
};

function mkRequest(url: string, init?: globalThis.RequestInit): NextRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(`https://example.com${url}`, init as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsFeatureEnabled.mockImplementation((flag: string) => flag === "marketplace-chat-public");
  mockMessagesMarkAsRead.mockResolvedValue(undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
// Feature flag gate
// ═════════════════════════════════════════════════════════════════════════════

describe("Feature flag gate", () => {
  it("POST devuelve 503 si marketplace-chat-public está OFF", async () => {
    mockIsFeatureEnabled.mockReturnValue(false);
    const res = await POST(
      mkRequest("/api/chat/public?action=open", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("300");
  });

  it("GET devuelve 503 si marketplace-chat-public está OFF", async () => {
    mockIsFeatureEnabled.mockReturnValue(false);
    const res = await GET(
      mkRequest("/api/chat/public?threadId=t1&storeSlug=s&customerPhone=+51999", {
        method: "GET",
      }),
    );
    expect(res.status).toBe(503);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Validación Zod
// ═════════════════════════════════════════════════════════════════════════════

describe("Validación Zod del body", () => {
  it("POST action=open rechaza body sin storeSlug", async () => {
    const res = await POST(
      mkRequest("/api/chat/public?action=open", {
        method: "POST",
        body: JSON.stringify({ customerPhone: "+51987", customerName: "Ana" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("POST action=open rechaza phone muy corto", async () => {
    const res = await POST(
      mkRequest("/api/chat/public?action=open", {
        method: "POST",
        body: JSON.stringify({
          storeSlug: "bodega",
          customerPhone: "123", // min 6
          customerName: "Ana",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("POST action=send rechaza body vacío", async () => {
    const res = await POST(
      mkRequest("/api/chat/public?action=send", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("POST con JSON inválido devuelve 400", async () => {
    const res = await POST(
      mkRequest("/api/chat/public?action=open", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Apertura de thread (action=open)
// ═════════════════════════════════════════════════════════════════════════════

describe("POST action=open", () => {
  it("happy path devuelve data con threadId y storeName", async () => {
    mockFindUnique.mockResolvedValueOnce(STORE_PUBLISHED);
    mockThreadsOpenOrGet.mockResolvedValueOnce(THREAD_OK);

    const res = await POST(
      mkRequest("/api/chat/public?action=open", {
        method: "POST",
        body: JSON.stringify({
          storeSlug: "bodega-demo",
          customerPhone: "+51987654321",
          customerName: "María López",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.threadId).toBe("thread-1");
    expect(json.data.storeName).toBe("Bodega Demo");
    // NO debe exponer tenantId, customerName ni unreadForSeller
    expect(json.data.tenantId).toBeUndefined();
    expect(json.data.customerName).toBeUndefined();
    expect(json.data.unreadForSeller).toBeUndefined();
  });

  it("devuelve 404 si la tienda no está publicada", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...STORE_PUBLISHED, isPublished: false });
    const res = await POST(
      mkRequest("/api/chat/public?action=open", {
        method: "POST",
        body: JSON.stringify({
          storeSlug: "bodega-demo",
          customerPhone: "+51987654321",
          customerName: "María",
        }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("envía el firstMessage si está presente", async () => {
    mockFindUnique.mockResolvedValueOnce(STORE_PUBLISHED);
    mockThreadsOpenOrGet.mockResolvedValueOnce(THREAD_OK);
    mockMessagesSend.mockResolvedValueOnce({ id: "msg-1", body: "Hola" });

    await POST(
      mkRequest("/api/chat/public?action=open", {
        method: "POST",
        body: JSON.stringify({
          storeSlug: "bodega-demo",
          customerPhone: "+51987654321",
          customerName: "María",
          firstMessage: "Hola, ¿hay arroz?",
        }),
      }),
    );
    expect(mockMessagesSend).toHaveBeenCalledTimes(1);
    const sendCall = mockMessagesSend.mock.calls[0]?.[0];
    expect(sendCall?.body).toBe("Hola, ¿hay arroz?");
    expect(sendCall?.senderType).toBe("buyer");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Envío de mensajes (action=send) + ownership check
// ═════════════════════════════════════════════════════════════════════════════

describe("POST action=send — ownership validation", () => {
  it("rechaza con 404 si el threadId no matchea con el customerPhone", async () => {
    mockFindUnique.mockResolvedValueOnce(STORE_PUBLISHED);
    // Thread existe pero con otro customerPhone
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { customerPhone: "+51999888777", storeId: "store-1", status: "open" },
    ]);

    const res = await POST(
      mkRequest("/api/chat/public?action=send", {
        method: "POST",
        body: JSON.stringify({
          threadId: "thread-1",
          storeSlug: "bodega-demo",
          customerPhone: "+51987654321", // no matchea con el del thread
          customerName: "María",
          body: "Hola",
        }),
      }),
    );
    expect(res.status).toBe(404);
    expect(mockMessagesSend).not.toHaveBeenCalled();
  });

  it("rechaza con 409 si el thread está cerrado", async () => {
    mockFindUnique.mockResolvedValueOnce(STORE_PUBLISHED);
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { customerPhone: "+51987654321", storeId: "store-1", status: "closed" },
    ]);

    const res = await POST(
      mkRequest("/api/chat/public?action=send", {
        method: "POST",
        body: JSON.stringify({
          threadId: "thread-1",
          storeSlug: "bodega-demo",
          customerPhone: "+51987654321",
          customerName: "María",
          body: "Hola",
        }),
      }),
    );
    expect(res.status).toBe(409);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET — listado con ownership + auto-markAsRead
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/chat/public — listado", () => {
  it("devuelve mensajes con campos seguros solamente", async () => {
    mockFindUnique.mockResolvedValueOnce(STORE_PUBLISHED);
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { customerPhone: "+51987654321", storeId: "store-1" },
    ]);
    mockMessagesListByThread.mockResolvedValueOnce([
      {
        id: "m1",
        tenantId: "tenant-main",
        threadId: "thread-1",
        senderType: "seller",
        senderId: "admin",
        senderName: "Juan",
        body: "Hola",
        messageType: "text",
        attachmentUrl: null,
        metadataJson: "{secret}",
        readByBuyerAt: null,
        readBySellerAt: null,
        deletedAt: null,
        createdAt: "2026-04-08T20:01:00.000Z",
      },
    ]);

    const res = await GET(
      mkRequest(
        "/api/chat/public?threadId=thread-1&storeSlug=bodega-demo&customerPhone=%2B51987654321",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    const msg = json.data[0];
    expect(msg.id).toBe("m1");
    expect(msg.body).toBe("Hola");
    // Campos internos NO expuestos
    expect(msg.tenantId).toBeUndefined();
    expect(msg.metadataJson).toBeUndefined();
    expect(msg.readByBuyerAt).toBeUndefined();
    // readBySellerAt SÍ se expone desde 2026-06-06 — habilita los ✓✓
    // estilo WhatsApp (el buyer ve si la tienda leyó su mensaje).
    expect("readBySellerAt" in msg).toBe(true);
    // Headers privacy-by-design
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("dispara markAsRead('buyer') fire-and-forget", async () => {
    mockFindUnique.mockResolvedValueOnce(STORE_PUBLISHED);
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { customerPhone: "+51987654321", storeId: "store-1" },
    ]);
    mockMessagesListByThread.mockResolvedValueOnce([]);

    await GET(
      mkRequest(
        "/api/chat/public?threadId=thread-1&storeSlug=bodega-demo&customerPhone=%2B51987654321",
      ),
    );
    // markAsRead debe haberse llamado con "buyer"
    expect(mockMessagesMarkAsRead).toHaveBeenCalledWith(
      "tenant-main",
      "thread-1",
      "buyer",
    );
  });

  it("rechaza con 404 si el thread no existe", async () => {
    mockFindUnique.mockResolvedValueOnce(STORE_PUBLISHED);
    mockQueryRawUnsafe.mockResolvedValueOnce([]); // thread no encontrado

    const res = await GET(
      mkRequest(
        "/api/chat/public?threadId=fake&storeSlug=bodega-demo&customerPhone=%2B51987654321",
      ),
    );
    expect(res.status).toBe(404);
  });
});
