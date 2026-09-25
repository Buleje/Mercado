/**
 * lib/db/reviews.db.ts — unit tests
 *
 * Cubre:
 *   - ReviewsMarketplaceDB.createVerified (5 tests)
 *   - ReviewsMarketplaceDB.listByStore/listByProduct (2 tests)
 *   - ReviewsMarketplaceDB.getAggregate (2 tests)
 *   - ReviewsMarketplaceDB.moderate/reply/softDelete (3 tests)
 *   - ReviewVotesDB.vote + dedupe (4 tests)
 *   - Multi-tenant isolation (2 tests)
 *
 * Total: 18 tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockInvalidateByPrefix } = vi.hoisted(() => ({
  mockInvalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: async <T>(_k: string, _ttl: number, fn: () => Promise<T>) => fn(),
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

import { ReviewsMarketplaceDB, ReviewVotesDB } from "@/lib/db/reviews.db";

const T1 = "tenant-main";
const T2 = "tenant-demo";
const STORE_ID = "store-1";
const ORDER_ID = "MKT-ABC123";
const REVIEW_ID = "review-1";
const PHONE_A = "+51987654321";
const PHONE_B = "+51912345678";

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteRawUnsafe.mockResolvedValue(1);
  mockQueryRawUnsafe.mockResolvedValue([]);
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ $executeRawUnsafe: mockExecuteRawUnsafe, $queryRawUnsafe: mockQueryRawUnsafe }),
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// createVerified
// ═════════════════════════════════════════════════════════════════════════════

describe("ReviewsMarketplaceDB.createVerified", () => {
  it("crea una review verificada cuando el order existe y el phone matchea", async () => {
    // Mock del SELECT del order
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { id: ORDER_ID, tenantId: T1, customerPhone: PHONE_A, deletedAt: null },
    ]);

    const result = await ReviewsMarketplaceDB.createVerified({
      tenantId: T1,
      storeId: STORE_ID,
      orderId: ORDER_ID,
      name: "María",
      phone: PHONE_A,
      text: "Excelente servicio",
      rating: 5,
    });

    expect(result.verified).toBe(true);
    expect(result.status).toBe("pending"); // arranca en pending para moderación
    expect(result.rating).toBe(5);
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1); // 1 INSERT
    expect(mockInvalidateByPrefix).toHaveBeenCalled();
  });

  it("rechaza si el order no existe", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]); // no order

    await expect(
      ReviewsMarketplaceDB.createVerified({
        tenantId: T1,
        storeId: STORE_ID,
        orderId: "no-existe",
        name: "María",
        phone: PHONE_A,
        text: "test",
        rating: 5,
      }),
    ).rejects.toThrow(/no existe/);
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  it("rechaza si el order fue soft-deleted", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { id: ORDER_ID, tenantId: T1, customerPhone: PHONE_A, deletedAt: new Date() },
    ]);

    await expect(
      ReviewsMarketplaceDB.createVerified({
        tenantId: T1,
        storeId: STORE_ID,
        orderId: ORDER_ID,
        name: "María",
        phone: PHONE_A,
        text: "test",
        rating: 4,
      }),
    ).rejects.toThrow(/eliminado/);
  });

  it("rechaza si el phone del review no matchea con el del order", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { id: ORDER_ID, tenantId: T1, customerPhone: PHONE_A, deletedAt: null },
    ]);

    await expect(
      ReviewsMarketplaceDB.createVerified({
        tenantId: T1,
        storeId: STORE_ID,
        orderId: ORDER_ID,
        name: "María",
        phone: PHONE_B, // phone diferente del order
        text: "test",
        rating: 3,
      }),
    ).rejects.toThrow(/no coincide/);
  });

  it("rechaza rating fuera de rango 1-5", async () => {
    await expect(
      ReviewsMarketplaceDB.createVerified({
        tenantId: T1,
        storeId: STORE_ID,
        orderId: ORDER_ID,
        name: "María",
        phone: PHONE_A,
        text: "test",
        rating: 10, // fuera de rango
      }),
    ).rejects.toThrow(/entre 1 y 5/);
    // No debe haber tocado la DB
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// listByStore / listByProduct
// ═════════════════════════════════════════════════════════════════════════════

describe("listByStore / listByProduct", () => {
  it("listByStore filtra por status y usa verifiedOnly", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]);

    await ReviewsMarketplaceDB.listByStore(T1, STORE_ID, {
      status: "approved",
      verifiedOnly: true,
      limit: 20,
    });

    const sql = String(mockQueryRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"verified" = true`);
    expect(sql).toContain(`ORDER BY "date" DESC`);
    // Primer arg es tenantId, segundo storeId
    expect(mockQueryRawUnsafe.mock.calls[0]?.[1]).toBe(T1);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[2]).toBe(STORE_ID);
  });

  it("listByProduct filtra por productId + deletedAt IS NULL", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]);

    await ReviewsMarketplaceDB.listByProduct(T1, 42, { status: "approved" });

    const sql = String(mockQueryRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"productId" = $2`);
    expect(sql).toContain(`"deletedAt" IS NULL`);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[2]).toBe(42);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getAggregate
// ═════════════════════════════════════════════════════════════════════════════

describe("getAggregate", () => {
  it("calcula promedio + distribución + verified count a partir de las filas", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { rating: 5, cnt: 10, verified_cnt: 8 },
      { rating: 4, cnt: 5,  verified_cnt: 5 },
      { rating: 3, cnt: 2,  verified_cnt: 1 },
      { rating: 1, cnt: 1,  verified_cnt: 0 },
    ]);

    const agg = await ReviewsMarketplaceDB.getAggregate(T1, { storeId: STORE_ID });

    expect(agg.count).toBe(18);
    // sum = 5*10 + 4*5 + 3*2 + 1*1 = 50 + 20 + 6 + 1 = 77
    // avg = 77/18 = 4.27... round to 1 decimal = 4.3
    expect(agg.average).toBe(4.3);
    expect(agg.distribution[5]).toBe(10);
    expect(agg.distribution[4]).toBe(5);
    expect(agg.distribution[3]).toBe(2);
    expect(agg.distribution[1]).toBe(1);
    expect(agg.distribution[2]).toBe(0);
    expect(agg.verifiedCount).toBe(14); // 8 + 5 + 1 + 0
  });

  it("devuelve promedio 0 cuando no hay reviews", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]);

    const agg = await ReviewsMarketplaceDB.getAggregate(T1, { productId: 1 });

    expect(agg.count).toBe(0);
    expect(agg.average).toBe(0);
    expect(agg.verifiedCount).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// moderate / reply / softDelete
// ═════════════════════════════════════════════════════════════════════════════

describe("moderate / reply / softDelete", () => {
  it("moderate actualiza status con tenantId en el WHERE", async () => {
    await ReviewsMarketplaceDB.moderate(T1, REVIEW_ID, "approved");

    const sql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"status" = $1`);
    expect(sql).toContain(`"tenantId" = $3`);
    expect(mockExecuteRawUnsafe.mock.calls[0]?.[1]).toBe("approved");
    expect(mockExecuteRawUnsafe.mock.calls[0]?.[3]).toBe(T1);
  });

  it("reply agrega adminReply + adminReplyDate", async () => {
    await ReviewsMarketplaceDB.reply(T1, REVIEW_ID, "Gracias por tu compra!");

    const sql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"adminReply" = $1`);
    expect(sql).toContain(`"adminReplyDate" = $2`);
    expect(mockExecuteRawUnsafe.mock.calls[0]?.[1]).toBe("Gracias por tu compra!");
  });

  it("softDelete solo setea deletedAt (sin borrar)", async () => {
    await ReviewsMarketplaceDB.softDelete(T1, REVIEW_ID);

    const sql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"deletedAt" = $1`);
    expect(sql).not.toContain("DELETE");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ReviewVotesDB
// ═════════════════════════════════════════════════════════════════════════════

describe("ReviewVotesDB.vote", () => {
  it("crea voto nuevo + incrementa upvotes", async () => {
    // 1er query: buscar voto previo → no existe
    mockQueryRawUnsafe.mockResolvedValueOnce([]);
    // 3er query: leer nuevos contadores
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { helpfulUpvotes: 6, helpfulDownvotes: 1 },
    ]);

    const result = await ReviewVotesDB.vote({
      tenantId: T1,
      reviewId: REVIEW_ID,
      customerPhone: PHONE_A,
      voteType: "upvote",
    });

    expect(result.helpfulUpvotes).toBe(6);
    // 2 execute calls: INSERT ReviewVote + UPDATE Review
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(2);
    const updateSql = String(mockExecuteRawUnsafe.mock.calls[1]?.[0] ?? "");
    expect(updateSql).toContain(`"helpfulUpvotes" = "helpfulUpvotes" + 1`);
  });

  it("si ya votó con el mismo tipo no hace nada", async () => {
    // 1er query: voto previo igual
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { id: "vote-existing", voteType: "upvote" },
    ]);
    // 2do query: leer contadores sin cambio
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { helpfulUpvotes: 5, helpfulDownvotes: 1 },
    ]);

    const result = await ReviewVotesDB.vote({
      tenantId: T1,
      reviewId: REVIEW_ID,
      customerPhone: PHONE_A,
      voteType: "upvote",
    });

    expect(result.helpfulUpvotes).toBe(5);
    // NO debe haber execute (solo select)
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  it("si cambia de upvote a downvote, ajusta ambos contadores", async () => {
    // 1er query: voto previo upvote
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { id: "vote-existing", voteType: "upvote" },
    ]);
    // 2do query (tras execute): leer nuevos contadores
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { helpfulUpvotes: 4, helpfulDownvotes: 2 },
    ]);

    const result = await ReviewVotesDB.vote({
      tenantId: T1,
      reviewId: REVIEW_ID,
      customerPhone: PHONE_A,
      voteType: "downvote", // cambio
    });

    // UPDATE ReviewVote + UPDATE Review con ambas columnas (GREATEST(0, up-1), down+1)
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(2);
    const updateReviewSql = String(mockExecuteRawUnsafe.mock.calls[1]?.[0] ?? "");
    expect(updateReviewSql).toContain(`"helpfulUpvotes" = GREATEST(0, "helpfulUpvotes" - 1)`);
    expect(updateReviewSql).toContain(`"helpfulDownvotes" = "helpfulDownvotes" + 1`);
    expect(result.helpfulDownvotes).toBe(2);
  });

  it("getVoteFor devuelve null si no hay voto previo", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]);
    const result = await ReviewVotesDB.getVoteFor(T1, REVIEW_ID, PHONE_A);
    expect(result).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Multi-tenant isolation
// ═════════════════════════════════════════════════════════════════════════════

describe("Multi-tenant isolation", () => {
  it("listByStore pasa tenantId como $1 en cada tenant", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]);
    await ReviewsMarketplaceDB.listByStore(T1, STORE_ID);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[1]).toBe(T1);

    mockQueryRawUnsafe.mockClear();
    mockQueryRawUnsafe.mockResolvedValueOnce([]);
    await ReviewsMarketplaceDB.listByStore(T2, STORE_ID);
    expect(mockQueryRawUnsafe.mock.calls[0]?.[1]).toBe(T2);
  });

  it("moderate filtra por tenantId en el WHERE (no puede cruzar tenants)", async () => {
    await ReviewsMarketplaceDB.moderate(T1, REVIEW_ID, "hidden");
    const sql = String(mockExecuteRawUnsafe.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain(`"tenantId" = $3`);
    expect(mockExecuteRawUnsafe.mock.calls[0]?.[3]).toBe(T1);
  });
});
