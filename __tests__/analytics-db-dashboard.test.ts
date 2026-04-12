/**
 * lib/db/analytics.db.ts — unit tests
 *
 * Covers TASK-002 acceptance criterion #6:
 * "Unit test covers 5 tenant isolation cases" for
 * AnalyticsDB.getDashboardAggregates.
 *
 * The five cases (see docs/squad-reviews/gamma-review-task-002.md):
 *   1. tenant-a cannot read tenant-b totals
 *   2. empty tenant returns zeros
 *   3. today filter excludes yesterday (week captures it)
 *   4. active-cart status filter (pendiente + confirmado only)
 *   5. low-stock query respects tenant + active + stockMin NOT NULL
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// next/cache — cacheLife / cacheTag would throw outside of a Next cache scope.
// Mock them as no-ops so the "use cache" directive becomes a plain function.
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    order: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    savedCart: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { AnalyticsDB } from "@/lib/db/analytics.db";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

const EMPTY_AGGREGATE = { _sum: { total: null }, _count: { _all: 0 } };

function mockAllQueries(opts: {
  todayCount?: number;
  todayRevenue?: number | null;
  weekCount?: number;
  weekRevenue?: number | null;
  activeCarts?: number;
  lowStock?: number;
}) {
  mockPrisma.order.aggregate
    .mockResolvedValueOnce({
      _sum: { total: opts.todayRevenue ?? null },
      _count: { _all: opts.todayCount ?? 0 },
    })
    .mockResolvedValueOnce({
      _sum: { total: opts.weekRevenue ?? null },
      _count: { _all: opts.weekCount ?? 0 },
    });
  mockPrisma.order.count.mockResolvedValueOnce(opts.activeCarts ?? 0);
  mockPrisma.$queryRaw.mockResolvedValueOnce([
    { count: BigInt(opts.lowStock ?? 0) },
  ]);
  mockPrisma.savedCart.findMany.mockResolvedValueOnce([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AnalyticsDB.getDashboardAggregates — tenant isolation", () => {
  // ──────────────────────────────────────────────────────────────────────
  // Case 1 — tenant-a cannot read tenant-b totals
  // ──────────────────────────────────────────────────────────────────────
  it("tenant-a cannot read tenant-b totals (where.tenantId is always the caller's id)", async () => {
    // Tenant A scenario — 5 orders today, 1200 revenue
    mockAllQueries({
      todayCount: 5,
      todayRevenue: 1200,
      weekCount: 20,
      weekRevenue: 5500,
      activeCarts: 3,
      lowStock: 2,
    });

    const resA = await AnalyticsDB.getDashboardAggregates(TENANT_A);

    // Every aggregate / count / raw call for tenant A must carry tenantId=A.
    expect(mockPrisma.order.aggregate.mock.calls[0]?.[0]?.where?.tenantId).toBe(TENANT_A);
    expect(mockPrisma.order.aggregate.mock.calls[1]?.[0]?.where?.tenantId).toBe(TENANT_A);
    expect(mockPrisma.order.count.mock.calls[0]?.[0]?.where?.tenantId).toBe(TENANT_A);
    // Tagged template: calls[0] = [stringsArray, tenantId]
    expect(mockPrisma.$queryRaw.mock.calls[0]?.[1]).toBe(TENANT_A);

    expect(resA.tenantId).toBe(TENANT_A);
    expect(resA.today.salesCount).toBe(5);
    expect(resA.today.revenue).toBe(1200);

    // Now tenant B — very different numbers. None of A's values may leak.
    vi.clearAllMocks();
    mockAllQueries({
      todayCount: 99,
      todayRevenue: 9999,
      weekCount: 500,
      weekRevenue: 77777,
      activeCarts: 42,
      lowStock: 17,
    });

    const resB = await AnalyticsDB.getDashboardAggregates(TENANT_B);

    expect(mockPrisma.order.aggregate.mock.calls[0]?.[0]?.where?.tenantId).toBe(TENANT_B);
    expect(mockPrisma.order.aggregate.mock.calls[1]?.[0]?.where?.tenantId).toBe(TENANT_B);
    expect(mockPrisma.order.count.mock.calls[0]?.[0]?.where?.tenantId).toBe(TENANT_B);
    expect(mockPrisma.$queryRaw.mock.calls[0]?.[1]).toBe(TENANT_B);

    expect(resB.tenantId).toBe(TENANT_B);
    expect(resB.today.salesCount).toBe(99);
    expect(resB.today.revenue).toBe(9999);
    expect(resB.week.salesCount).toBe(500);
    expect(resB.activeCarts).toBe(42);
    expect(resB.lowStockCount).toBe(17);

    // Sanity: none of tenant A's values bled into the tenant B result.
    expect(resB.today.salesCount).not.toBe(resA.today.salesCount);
    expect(resB.today.revenue).not.toBe(resA.today.revenue);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Case 2 — empty tenant returns zeros
  // ──────────────────────────────────────────────────────────────────────
  it("empty tenant returns all zeros without throwing", async () => {
    mockPrisma.order.aggregate
      .mockResolvedValueOnce(EMPTY_AGGREGATE)
      .mockResolvedValueOnce(EMPTY_AGGREGATE);
    mockPrisma.order.count.mockResolvedValueOnce(0);
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);
    mockPrisma.savedCart.findMany.mockResolvedValueOnce([]);

    const res = await AnalyticsDB.getDashboardAggregates("tenant-empty");

    expect(res.tenantId).toBe("tenant-empty");
    expect(res.today.salesCount).toBe(0);
    expect(res.today.revenue).toBe(0);
    expect(res.week.salesCount).toBe(0);
    expect(res.week.revenue).toBe(0);
    expect(res.activeCarts).toBe(0);
    expect(res.lowStockCount).toBe(0);
    expect(typeof res.generatedAt).toBe("string");
    // generatedAt must be a parseable ISO timestamp
    expect(Number.isNaN(Date.parse(res.generatedAt))).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Case 3 — today filter excludes yesterday (but week captures it)
  // ──────────────────────────────────────────────────────────────────────
  it("today aggregate uses startOfToday; week aggregate uses startOfLastWeek", async () => {
    // Simulate: 0 sales today, 1 sale yesterday (inside 7d window).
    mockAllQueries({
      todayCount: 0,
      todayRevenue: 0,
      weekCount: 1,
      weekRevenue: 500,
      activeCarts: 0,
      lowStock: 0,
    });

    const before = Date.now();
    const res = await AnalyticsDB.getDashboardAggregates(TENANT_A);
    const after = Date.now();

    expect(res.today.salesCount).toBe(0);
    expect(res.week.salesCount).toBe(1);
    expect(res.week.revenue).toBe(500);

    const todayWhere = mockPrisma.order.aggregate.mock.calls[0]?.[0]?.where;
    const weekWhere = mockPrisma.order.aggregate.mock.calls[1]?.[0]?.where;

    // Today filter: createdAt.gte is the start of the current day (00:00:00).
    const todayGte: Date = todayWhere?.createdAt?.gte;
    expect(todayGte).toBeInstanceOf(Date);
    expect(todayGte.getHours()).toBe(0);
    expect(todayGte.getMinutes()).toBe(0);
    expect(todayGte.getSeconds()).toBe(0);
    expect(todayGte.getMilliseconds()).toBe(0);

    // Week filter: createdAt.gte ≈ now - 7d, within a generous slack of the
    // window we timed the call in.
    const weekGte: Date = weekWhere?.createdAt?.gte;
    expect(weekGte).toBeInstanceOf(Date);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(weekGte.getTime()).toBeGreaterThanOrEqual(before - sevenDaysMs - 50);
    expect(weekGte.getTime()).toBeLessThanOrEqual(after - sevenDaysMs + 50);

    // The today cutoff is strictly after the week cutoff.
    expect(todayGte.getTime()).toBeGreaterThan(weekGte.getTime());

    // Soft-delete exclusion is still in place on both filters.
    expect(todayWhere?.deletedAt).toBeNull();
    expect(weekWhere?.deletedAt).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Case 4 — active-cart status filter
  // ──────────────────────────────────────────────────────────────────────
  it("active-cart count filters by status in ['pendiente','confirmado'] only", async () => {
    mockAllQueries({
      todayCount: 1,
      todayRevenue: 250,
      weekCount: 1,
      weekRevenue: 250,
      activeCarts: 2, // 1 pendiente + 1 confirmado (entregado must NOT count here)
      lowStock: 0,
    });

    const res = await AnalyticsDB.getDashboardAggregates(TENANT_A);

    expect(res.activeCarts).toBe(2);

    const activeWhere = mockPrisma.order.count.mock.calls[0]?.[0]?.where;
    expect(activeWhere?.tenantId).toBe(TENANT_A);
    expect(activeWhere?.deletedAt).toBeNull();

    const activeStatuses: string[] = activeWhere?.status?.in ?? [];
    expect(activeStatuses).toEqual(expect.arrayContaining(["pendiente", "confirmado"]));
    expect(activeStatuses).not.toContain("entregado");
    expect(activeStatuses).not.toContain("cancelado");
    expect(activeStatuses).not.toContain("en_camino");
    expect(activeStatuses).toHaveLength(2);

    // And the "completed revenue" aggregates DO include entregado, while they
    // exclude pendiente (the opposite bucket — that's what keeps them disjoint).
    const todayStatuses: string[] =
      mockPrisma.order.aggregate.mock.calls[0]?.[0]?.where?.status?.in ?? [];
    expect(todayStatuses).toEqual(
      expect.arrayContaining(["entregado", "confirmado", "en_camino"]),
    );
    expect(todayStatuses).not.toContain("pendiente");
  });

  // ──────────────────────────────────────────────────────────────────────
  // Case 5 — low-stock query respects tenant + active + stockMin NOT NULL
  // ──────────────────────────────────────────────────────────────────────
  it("low-stock raw query filters by tenant, active, stock/stockMin NOT NULL, stock <= stockMin", async () => {
    mockAllQueries({
      todayCount: 0,
      weekCount: 0,
      activeCarts: 0,
      lowStock: 0, // tenant A has zero rows even though tenant B might have some
    });

    const res = await AnalyticsDB.getDashboardAggregates(TENANT_A);

    expect(res.lowStockCount).toBe(0);

    // Tagged template call: calls[0] = [TemplateStringsArray, ...values]
    const rawCall = mockPrisma.$queryRaw.mock.calls[0];
    expect(rawCall).toBeDefined();

    const templateStrings = rawCall?.[0] as unknown as { raw?: readonly string[] };
    const joined = Array.isArray(templateStrings)
      ? (templateStrings as unknown as string[]).join(" ")
      : (templateStrings?.raw ?? []).join(" ");

    expect(joined).toContain('FROM "Product"');
    expect(joined).toContain('"tenantId"');
    expect(joined).toContain('"deletedAt" IS NULL');
    expect(joined).toContain('"active" = true');
    expect(joined).toContain('"stock" IS NOT NULL');
    expect(joined).toContain('"stockMin" IS NOT NULL');
    expect(joined).toContain('"stock" <= "stockMin"');

    // The tenantId is passed as a parameterised value, not interpolated.
    expect(rawCall?.[1]).toBe(TENANT_A);

    // Sanity: tenant A's low-stock count stays at 0 even if tenant B had rows —
    // the mock only returned what was set up for this call.
    expect(res.lowStockCount).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// HOTFIX-006 — cache poisoning regression guard
//
// Before the fix, getDashboardAggregates wrapped its Prisma calls in a
// try/catch INSIDE the `"use cache"` scope and returned an all-zero fallback
// on failure. Next 16 Cache Components would happily store those zeros under
// `tenant:${tenantId}:dashboard` for up to `expire:300` seconds, blinding
// the dashboard for five minutes after a two-second DB hiccup.
//
// The fix removes the inner catch so Prisma errors propagate. Next does NOT
// cache thrown errors, so the next request after the DB recovers gets fresh
// numbers. This test asserts the function REJECTS on DB failure — if a future
// refactor re-introduces a swallowing catch, this test will catch it.
// ──────────────────────────────────────────────────────────────────────────
describe("AnalyticsDB.getDashboardAggregates — error propagation (HOTFIX-006)", () => {
  it("rejects on prisma failure (must NOT return a zero fallback that would poison the cache)", async () => {
    const dbError = new Error("connection terminated unexpectedly");
    // First aggregate call rejects; Promise.all short-circuits and the
    // rejection bubbles out of the cached function. Mock the other queries
    // too so a stray resolution can't mask the failure if the call order
    // changes in the future.
    mockPrisma.order.aggregate.mockRejectedValueOnce(dbError);
    mockPrisma.order.aggregate.mockRejectedValueOnce(dbError);
    mockPrisma.order.count.mockRejectedValueOnce(dbError);
    mockPrisma.$queryRaw.mockRejectedValueOnce(dbError);
    mockPrisma.savedCart.findMany.mockRejectedValueOnce(dbError);

    await expect(
      AnalyticsDB.getDashboardAggregates(TENANT_A),
    ).rejects.toThrow("connection terminated unexpectedly");
  });

  it("does not swallow errors into an all-zero DashboardAggregates shape", async () => {
    // Regression guard: the old fallback returned an object with
    // today.salesCount === 0, activeCarts === 0, etc. If that behaviour ever
    // comes back, this assertion fails because the promise resolves instead
    // of rejecting.
    mockPrisma.order.aggregate.mockRejectedValueOnce(new Error("boom"));
    mockPrisma.order.aggregate.mockRejectedValueOnce(new Error("boom"));
    mockPrisma.order.count.mockRejectedValueOnce(new Error("boom"));
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("boom"));
    mockPrisma.savedCart.findMany.mockRejectedValueOnce(new Error("boom"));

    let resolved = false;
    try {
      await AnalyticsDB.getDashboardAggregates(TENANT_A);
      resolved = true;
    } catch {
      // expected
    }
    expect(resolved).toBe(false);
  });
});
