/**
 * API /api/products – GET handler unit tests
 * Covers: no filters (200), category filter, search filter, active filter,
 *         empty results, pagination (bonus), and DB error (503).
 *
 * The GET handler is PUBLIC — requireAdmin is NOT called for GET requests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock: logger — swallow all output ────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock: jsondb / ProductsDB ─────────────────────────────────────────────────
const { mockGetAll } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
}));
vi.mock("@/lib/jsondb", () => ({
  ProductsDB: { getAll: mockGetAll },
  SettingsDB: { get: vi.fn() },
}));

// ── Mock: activity-logger ─────────────────────────────────────────────────────
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
}));

// ── Mock: require-admin (not used by GET, but imported by the module) ─────────
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

// ── Mock: tenant ──────────────────────────────────────────────────────────────
vi.mock("@/lib/tenant", () => ({
  prismaForTenant: vi.fn(),
}));

// ── Mock: prisma ──────────────────────────────────────────────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findFirst: vi.fn() },
    product: { count: vi.fn() },
  },
}));

// ── Mock: plans ───────────────────────────────────────────────────────────────
vi.mock("@/lib/plans", () => ({
  getPlanLimits:    vi.fn(() => ({ maxProducts: 100 })),
  withinLimit:      vi.fn(() => true),
  planLimitPayload: vi.fn(),
}));

// ── Mock: cache ───────────────────────────────────────────────────────────────
vi.mock("@/lib/cache", () => ({
  invalidate: vi.fn(),
}));

import { GET } from "@/app/api/products/route";
import { requireAdmin } from "@/lib/require-admin";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_A = {
  id: 1, name: "Arroz Extra",   category: "granos",  price: 3.5,  image: "", unit: "kg",  active: true,
};
const PRODUCT_B = {
  id: 2, name: "Aceite Vegetal", category: "aceites", price: 8.0,  image: "", unit: "lt",  active: true,
};
const PRODUCT_C = {
  id: 3, name: "Arroz Largo",   category: "granos",  price: 4.0,  image: "", unit: "kg",  active: false,
};

const ALL_PRODUCTS = [PRODUCT_A, PRODUCT_B, PRODUCT_C];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeReq(params: Record<string, string> = {}): Request {
  const url = new URL("https://host/api/products");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue(ALL_PRODUCTS);
  });

  // ── 1. No filters → returns all products ──────────────────────────────────

  describe("200 – no filters applied", () => {
    it("returns 200 with the full product list when no query params are provided", async () => {
      const res = await GET(makeReq() as any);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(3);
    });

    it("includes all product fields in each item", async () => {
      const res = await GET(makeReq() as any);
      const [first] = await res.json();
      expect(first).toMatchObject({ id: 1, name: "Arroz Extra", category: "granos", price: 3.5 });
    });

    it("returns X-Total-Count header equal to number of products", async () => {
      const res = await GET(makeReq() as any);
      expect(res.headers.get("X-Total-Count")).toBe("3");
    });

    it("does NOT call requireAdmin (GET is a public endpoint)", async () => {
      await GET(makeReq() as any);
      expect(requireAdmin).not.toHaveBeenCalled();
    });

    it("calls ProductsDB.getAll() exactly once", async () => {
      await GET(makeReq() as any);
      expect(mockGetAll).toHaveBeenCalledTimes(1);
    });
  });

  // ── 2. Category filter ────────────────────────────────────────────────────

  describe("200 – category filter", () => {
    it("returns only products matching the given category", async () => {
      const res = await GET(makeReq({ category: "granos" }) as any);
      expect(res.status).toBe(200);

      const body = await res.json();
      // PRODUCT_A and PRODUCT_C are in 'granos'; PRODUCT_B is not
      expect(body).toHaveLength(2);
      expect(body.every((p: typeof PRODUCT_A) => p.category === "granos")).toBe(true);
    });

    it("returns only aceites products when category=aceites", async () => {
      const res = await GET(makeReq({ category: "aceites" }) as any);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(PRODUCT_B.id);
    });

    it("returns all products when category=todos (special 'all' sentinel)", async () => {
      const res = await GET(makeReq({ category: "todos" }) as any);
      const body = await res.json();
      expect(body).toHaveLength(3);
    });

    it("reflects filtered count in X-Total-Count header", async () => {
      const res = await GET(makeReq({ category: "granos" }) as any);
      expect(res.headers.get("X-Total-Count")).toBe("2");
    });
  });

  // ── 3. Search filter → empty results ─────────────────────────────────────

  describe("200 – search query with no matches", () => {
    it("returns an empty array when no products match the search term", async () => {
      const res = await GET(makeReq({ q: "zzznomatch" }) as any);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });

    it("sets X-Total-Count to 0 when search yields no results", async () => {
      const res = await GET(makeReq({ q: "zzznomatch" }) as any);
      expect(res.headers.get("X-Total-Count")).toBe("0");
    });
  });

  describe("200 – search query with matches", () => {
    it("returns products whose name contains the search term (case-insensitive)", async () => {
      const res = await GET(makeReq({ q: "arroz" }) as any);
      const body = await res.json();
      // Both PRODUCT_A ('Arroz Extra') and PRODUCT_C ('Arroz Largo') match
      expect(body).toHaveLength(2);
      expect(body.every((p: typeof PRODUCT_A) => p.name.toLowerCase().includes("arroz"))).toBe(true);
    });

    it("search is case-insensitive", async () => {
      const res = await GET(makeReq({ q: "ARROZ" }) as any);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  // ── 4. Active filter ──────────────────────────────────────────────────────

  describe("200 – active=true filter", () => {
    it("returns only active products when active=true param is set", async () => {
      const res = await GET(makeReq({ active: "true" }) as any);
      const body = await res.json();
      // PRODUCT_C has active: false — only A and B should remain
      expect(body).toHaveLength(2);
      expect(body.every((p: typeof PRODUCT_A) => p.active !== false)).toBe(true);
    });

    it("does NOT filter inactive products when active param is absent", async () => {
      const res = await GET(makeReq() as any);
      const body = await res.json();
      expect(body).toHaveLength(3); // includes PRODUCT_C with active: false
    });
  });

  // ── 5. Pagination (bonus) ─────────────────────────────────────────────────

  describe("200 – pagination via ?limit and ?page", () => {
    it("returns paginated slice when limit param is provided", async () => {
      const res = await GET(makeReq({ limit: "2" }) as any);
      expect(res.status).toBe(200);

      const body = await res.json();
      // First page of size 2 from 3 total products
      expect(body).toHaveLength(2);
    });

    it("returns correct second page", async () => {
      const res = await GET(makeReq({ limit: "2", page: "2" }) as any);
      const body = await res.json();
      expect(body).toHaveLength(1); // only 1 product left on page 2
      expect(body[0].id).toBe(PRODUCT_C.id);
    });

    it("includes pagination headers when limit is provided", async () => {
      const res = await GET(makeReq({ limit: "2" }) as any);
      expect(res.headers.get("X-Total-Count")).toBe("3");
      expect(res.headers.get("X-Page")).toBe("1");
      expect(res.headers.get("X-Limit")).toBe("2");
      expect(res.headers.get("X-Total-Pages")).toBe("2");
    });

    it("does NOT include X-Page header when limit is not provided", async () => {
      const res = await GET(makeReq() as any);
      expect(res.headers.get("X-Page")).toBeNull();
    });

    it("clamps limit to maximum of 200", async () => {
      const res = await GET(makeReq({ limit: "9999" }) as any);
      expect(res.headers.get("X-Limit")).toBe("200");
      const body = await res.json();
      // All 3 products fit within the clamped 200 limit
      expect(body).toHaveLength(3);
    });
  });

  // ── 6. Database error → 503 ───────────────────────────────────────────────

  describe("503 – database failure", () => {
    it("returns 503 with { error: 'Database error' } when ProductsDB.getAll() throws", async () => {
      mockGetAll.mockRejectedValue(new Error("DB connection failed"));

      const res = await GET(makeReq() as any);
      expect(res.status).toBe(503);

      const body = await res.json();
      expect(body.error).toBe("Database error");
    });
  });
});
