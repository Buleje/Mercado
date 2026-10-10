/**
 * lib/db/chat.db.ts — unit tests
 *
 * Cubre las 2 DB classes del Bloque D2:
 *   - ChatThreadsDB   (5 tests)
 *   - ChatMessagesDB  (7 tests)
 *   - Multi-tenant isolation (3 tests)
 *
 * Total: 15 tests. Mock puro (no toca DB real).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { mockInvalidateByPrefix } = vi.hoisted(() => ({
  mockInvalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidateByPrefix: mockInvalidateByPrefix,
}));

const {
  mockExecuteRawUnsafe,
  mockQueryRawUnsafe,
  mockTransaction,
} = vi.hoisted(() => ({
  mockExecuteRawUnsafe: vi.fn(),
  mockQueryRawUnsafe: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $queryRawUnsafe: mockQueryRawUnsafe,
    $transaction: mockTransaction,
  },
}));

import { ChatThreadsDB, ChatMessagesDB } from "@/lib/db/chat.db";

const T1 = "tenant-main";
const T2 = "tenant-demo";
const STORE_ID = "store-1";
const THREAD_ID = "thread-1";
const PHONE_A = "+51987654321";

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteRawUnsafe.mockResolvedValue(1);
  mockQueryRawUnsafe.mockResolvedValue([]);
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      $executeRawUnsafe: mockExecuteRawUnsafe,
      $queryRawUnsafe: mockQueryRawUnsafe,
    }),
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// ChatThreadsDB
// ═════════════════════════════════════════════════════════════════════════════

describe("ChatThreadsDB.openOrGet", () => {
  it("devuelve el hilo existente si ya hay uno abierto", async () => {
    // 1a call: SELECT existente → devuelve 1 fila
    mockQueryRawUnsafe.mockResolvedValueOnce([
      {
        id: "existing-thread",
        tenantId: T1,
        storeId: STORE_ID,
        orderId: null,
        customerPhone: PHONE_A,
        customerName: "María",
        subject: null,
        status: "open",
        unreadForBuyer: 0,
        unreadForSeller: 2,
        lastMessageAt: new Date("2026-04-08T10:00:00Z"),
        lastMessageText: "Hola",
        lastSenderType: "buyer",
        closedAt: null,
        closedReason: null,
        createdAt: new Date("2026-04-08T09:00:00Z"),
        updatedAt: new Date("2026-04-08T10:00:00Z"),
      },
    ]);

    const result = await ChatThreadsDB.openOrGet({
      tenantId: T1,
      storeId: STORE_ID,
      customerPhone: PHONE_A,
      customerName: "María",
    });

    expect(result.id).toBe("existing-thread");
    expect(result.unreadForSeller).toBe(2);
    // NO debe haber INSERT porque ya existía
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  it("crea un hilo nuevo si no hay uno abierto", async () => {
    // 1a call: SELECT → vacío
    mockQueryRawUnsafe.mockResolvedValueOnce([]);

    const result = await ChatThreadsDB.openOrGet({
      tenantId: T1,
      storeId: STORE_ID,
      customerPhone: PHONE_A,
      customerName: "Carlos",
      subject: "Consulta de precio",
    });

    expect(result.status).toBe("open");
    expect(result.unreadForBuyer).toBe(0);
    expect(result.unreadForSeller).toBe(0);
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
    // INSERT del thread
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith(`chat:threads:${T1}`);
  });

  it("diferencia entre hilos con/sin orderId", async () => {
    // Búsqueda con orderId → no hay
    mockQueryRawUnsafe.mockResolvedValueOnce([]);
    await ChatThreadsDB.openOrGet({
      tenantId: T1,
      storeId: STORE_ID,
      customerPhone: PHONE_A,
      customerName: "Ana",
      orderId: "MKT-001",
    });
    // El SELECT debe incluir el COALESCE con $4 = 'MKT-001'
    expect(mockQueryRawUnsafe.mock.calls[0]?.[4]).toBe("MKT-001");
  });
});

describe("ChatThreadsDB.listByTenant", () => {
  it("mapea filas de Postgres y respeta el orden por lastMessageAt DESC", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      {
        id: "t1",
        tenantId: T1,
        storeId: STORE_ID,
        orderId: null,
        customerPhone: PHONE_A,
        customerName: "Ana",
        subject: null,
        status: "open",
        unreadForBuyer: 0,
        unreadForSeller: 1,
        lastMessageAt: new Date("2026-04-08T12:00:00Z"),
        lastMessageText: "Sí, gracias",
        lastSenderType: "buyer",
        closedAt: null,
        closedReason: null,
        createdAt: new Date("2026-04-08T11:00:00Z"),
        updatedAt: new Date("2026-04-08T12:00:00Z"),
      },
    ]);

    const result = await ChatThreadsDB.listByTenant(T1, { status: "open", limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("t1");
    expect(result[0]!.lastMessageText).toBe("Sí, gracias");
    // El SQL debe tener ORDER BY
    const sql = String(mockQueryRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("DESC");
  });
});

describe("ChatThreadsDB.close", () => {
  it("cierra el hilo y setea closedAt + closedReason", async () => {
    await ChatThreadsDB.close(T1, THREAD_ID, "Resuelto por el vendedor");

    const sql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"status" = 'closed'`);
    expect(sql).toContain(`"closedAt"`);
    expect(sql).toContain(`"closedReason"`);
    // El tenantId debe estar en el WHERE
    expect(mockExecuteRawUnsafe.mock.calls[0]?.[4]).toBe(T1);
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith(`chat:threads:${T1}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ChatMessagesDB
// ═════════════════════════════════════════════════════════════════════════════

describe("ChatMessagesDB.send", () => {
  it("envía un mensaje del buyer y bumpea unreadForSeller", async () => {
    // threadCheck: hilo existe y está open
    mockQueryRawUnsafe.mockResolvedValueOnce([{ status: "open" }]);

    const result = await ChatMessagesDB.send({
      tenantId: T1,
      threadId: THREAD_ID,
      senderType: "buyer",
      senderName: "María López",
      body: "Hola, ¿tienen arroz costeño?",
    });

    expect(result.senderType).toBe("buyer");
    expect(result.body).toBe("Hola, ¿tienen arroz costeño?");
    expect(result.messageType).toBe("text"); // default
    // 2 execute calls dentro de la tx: INSERT + UPDATE thread
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(2);
    // El 2do execute debe bumpear unreadForSeller (no unreadForBuyer)
    const updateSql = String(mockExecuteRawUnsafe.mock.calls[1]?.[0] ?? "");
    expect(updateSql).toContain(`"unreadForSeller"`);
  });

  it("envía un mensaje del seller y bumpea unreadForBuyer", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ status: "open" }]);

    await ChatMessagesDB.send({
      tenantId: T1,
      threadId: THREAD_ID,
      senderType: "seller",
      senderId: "admin",
      senderName: "Juan (tienda)",
      body: "Sí, tenemos. Te lo reservo.",
    });

    const updateSql = String(mockExecuteRawUnsafe.mock.calls[1]?.[0] ?? "");
    expect(updateSql).toContain(`"unreadForBuyer"`);
  });

  it("NO bumpea unread para mensajes del sistema", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ status: "open" }]);

    await ChatMessagesDB.send({
      tenantId: T1,
      threadId: THREAD_ID,
      senderType: "system",
      senderName: "Sistema",
      body: "El pedido cambió a en_camino",
      messageType: "system_event",
    });

    // El UPDATE del thread NO debe tener unread* = unread* + 1
    const updateSql = String(mockExecuteRawUnsafe.mock.calls[1]?.[0] ?? "");
    expect(updateSql).not.toContain(`"unreadForBuyer" = "unreadForBuyer" + 1`);
    expect(updateSql).not.toContain(`"unreadForSeller" = "unreadForSeller" + 1`);
  });

  it("lanza error si el hilo no existe", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]); // no thread

    await expect(
      ChatMessagesDB.send({
        tenantId: T1,
        threadId: "no-existe",
        senderType: "buyer",
        senderName: "María",
        body: "test",
      }),
    ).rejects.toThrow(/no existe/);
  });

  it("lanza error si el hilo está cerrado", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ status: "closed" }]);

    await expect(
      ChatMessagesDB.send({
        tenantId: T1,
        threadId: THREAD_ID,
        senderType: "buyer",
        senderName: "María",
        body: "test",
      }),
    ).rejects.toThrow(/closed/);
  });

  it("trunca el preview a 120 chars en lastMessageText", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ status: "open" }]);

    const longBody = "a".repeat(200);
    await ChatMessagesDB.send({
      tenantId: T1,
      threadId: THREAD_ID,
      senderType: "buyer",
      senderName: "María",
      body: longBody,
    });

    // El 2do arg del UPDATE (el preview) debe estar truncado + "…"
    const previewArg = mockExecuteRawUnsafe.mock.calls[1]?.[2] as string;
    expect(previewArg.length).toBeLessThanOrEqual(120);
    expect(previewArg.endsWith("…")).toBe(true);
  });
});

describe("ChatMessagesDB.listByThread", () => {
  it("mapea mensajes y respeta ORDER BY createdAt ASC", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      {
        id: "m1",
        tenantId: T1,
        threadId: THREAD_ID,
        senderType: "buyer",
        senderId: null,
        senderName: "Ana",
        body: "Hola",
        messageType: "text",
        attachmentUrl: null,
        metadataJson: null,
        readByBuyerAt: null,
        readBySellerAt: null,
        deletedAt: null,
        createdAt: new Date("2026-04-08T10:00:00Z"),
      },
    ]);

    const result = await ChatMessagesDB.listByThread(T1, THREAD_ID);
    expect(result).toHaveLength(1);
    expect(result[0]!.senderType).toBe("buyer");
    const sql = String(mockQueryRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`ORDER BY "createdAt" ASC`);
    expect(sql).toContain(`"deletedAt" IS NULL`);
  });
});

describe("ChatMessagesDB.markAsRead", () => {
  it("marca mensajes del otro lado como leídos y resetea unread del lado que lee", async () => {
    await ChatMessagesDB.markAsRead(T1, THREAD_ID, "seller");

    // 2 execute calls dentro de la tx: UPDATE messages + UPDATE thread
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(2);
    const messagesSql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(messagesSql).toContain(`"readBySellerAt"`);
    expect(messagesSql).toContain(`"senderType" != $4`);

    const threadSql = String(mockExecuteRawUnsafe.mock.calls[1]?.[0] ?? "");
    expect(threadSql).toContain(`"unreadForSeller" = 0`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Multi-tenant isolation
// ═════════════════════════════════════════════════════════════════════════════

describe("Multi-tenant isolation", () => {
  it("listByTenant nunca cruza tenants — tenantId siempre va como $1", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]);
    await ChatThreadsDB.listByTenant(T1);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[1]).toBe(T1);

    mockQueryRawUnsafe.mockClear();
    mockQueryRawUnsafe.mockResolvedValueOnce([]);
    await ChatThreadsDB.listByTenant(T2);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[1]).toBe(T2);
  });

  it("close filtra por tenantId en el WHERE", async () => {
    await ChatThreadsDB.close(T1, THREAD_ID);
    const sql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"tenantId" = $4`);
    expect(mockExecuteRawUnsafe.mock.calls[0]?.[3]).toBe(THREAD_ID);
    expect(mockExecuteRawUnsafe.mock.calls[0]?.[4]).toBe(T1);
  });

  it("send verifica tenantId en el threadCheck", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ status: "open" }]);
    await ChatMessagesDB.send({
      tenantId: T1,
      threadId: THREAD_ID,
      senderType: "buyer",
      senderName: "Ana",
      body: "test",
    });
    // El primer query (threadCheck) debe haber pasado T1 como segundo param
    expect(mockQueryRawUnsafe.mock.calls[0]?.[2]).toBe(T1);
  });
});
