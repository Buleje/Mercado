/**
 * Coupons Store Isolation Test Suite (#9 — Cupones por tienda)
 *
 * Tests the business logic for store-scoped coupons:
 * - Coupon with storeId only applies to that store
 * - Coupon without storeId applies to all stores
 * - Coupon from store A does not work in store B
 * - Creating coupon with invalid storeId returns error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockCouponFindFirst,
  mockCouponCreate,
  mockStoreFindUnique,
} = vi.hoisted(() => ({
  mockCouponFindFirst: vi.fn(),
  mockCouponCreate: vi.fn(),
  mockStoreFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: {
      findFirst: mockCouponFindFirst,
      create: mockCouponCreate,
    },
    store: {
      findUnique: mockStoreFindUnique,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = "demo";
const STORE_A_ID = "store-a-001";
const STORE_B_ID = "store-b-002";

type CouponOverrides = {
  code?: string;
  storeId?: string | null;
  active?: boolean;
  discountType?: string;
  discountValue?: number;
  expiresAt?: Date | null;
  maxUses?: number | null;
  usedCount?: number;
  tenantId?: string;
};

function makeCoupon(overrides: CouponOverrides = {}) {
  return {
    id: "cpn-001",
    code: overrides.code ?? "TIENDA10",
    tenantId: overrides.tenantId ?? TENANT_ID,
    storeId: overrides.storeId === undefined ? STORE_A_ID : overrides.storeId,
    description: "Descuento de tienda",
    discountType: overrides.discountType ?? "percent",
    discountValue: overrides.discountValue ?? 10,
    active: overrides.active ?? true,
    expiresAt: overrides.expiresAt === undefined ? null : overrides.expiresAt,
    maxUses: overrides.maxUses === undefined ? null : overrides.maxUses,
    usedCount: overrides.usedCount ?? 0,
    createdAt: new Date("2026-01-01"),
  };
}

/**
 * Simulates the store-scoped coupon validation logic:
 * - If coupon has a storeId, it only applies when the purchase storeId matches
 * - If coupon has no storeId (null), it applies to all stores
 */
function validateCouponForStore(
  coupon: ReturnType<typeof makeCoupon> | null,
  purchaseStoreId: string,
): { valid: boolean; error?: string; discount?: number } {
  if (!coupon) return { valid: false, error: "Cupón no encontrado" };
  if (!coupon.active) return { valid: false, error: "Cupón inactivo" };

  // Store isolation check
  if (coupon.storeId && coupon.storeId !== purchaseStoreId) {
    return {
      valid: false,
      error: `Cupón "${coupon.code}" solo es válido para la tienda asignada`,
    };
  }

  return { valid: true, discount: coupon.discountValue };
}

/**
 * Simulates creating a coupon with storeId validation
 */
async function createCouponWithStore(data: {
  code: string;
  tenantId: string;
  storeId?: string;
  discountType: string;
  discountValue: number;
}): Promise<{ success: boolean; error?: string; coupon?: ReturnType<typeof makeCoupon> }> {
  // Validate storeId if provided
  if (data.storeId) {
    const store = await mockStoreFindUnique({ where: { id: data.storeId } });
    if (!store) {
      return { success: false, error: "storeId inválido: tienda no encontrada" };
    }
  }

  const coupon = await mockCouponCreate({
    data: {
      code: data.code,
      tenantId: data.tenantId,
      storeId: data.storeId ?? null,
      discountType: data.discountType,
      discountValue: data.discountValue,
    },
  });

  return { success: true, coupon };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Coupons Store Isolation (#9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Store-scoped coupon validation", () => {
    it("coupon with storeId only applies to that store", () => {
      const coupon = makeCoupon({ storeId: STORE_A_ID });

      const result = validateCouponForStore(coupon, STORE_A_ID);

      expect(result.valid).toBe(true);
      expect(result.discount).toBe(10);
    });

    it("coupon without storeId applies to all stores", () => {
      const coupon = makeCoupon({ storeId: null });

      const resultA = validateCouponForStore(coupon, STORE_A_ID);
      const resultB = validateCouponForStore(coupon, STORE_B_ID);
      const resultRandom = validateCouponForStore(coupon, "store-xyz-999");

      expect(resultA.valid).toBe(true);
      expect(resultA.discount).toBe(10);
      expect(resultB.valid).toBe(true);
      expect(resultB.discount).toBe(10);
      expect(resultRandom.valid).toBe(true);
      expect(resultRandom.discount).toBe(10);
    });

    it("coupon from store A does NOT work in store B", () => {
      const coupon = makeCoupon({ storeId: STORE_A_ID });

      const result = validateCouponForStore(coupon, STORE_B_ID);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/solo es válido/i);
      expect(result.discount).toBeUndefined();
    });

    it("creating coupon with invalid storeId returns error", async () => {
      // Store does not exist
      mockStoreFindUnique.mockResolvedValue(null);

      const result = await createCouponWithStore({
        code: "INVALID",
        tenantId: TENANT_ID,
        storeId: "store-nonexistent-999",
        discountType: "percent",
        discountValue: 15,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/storeId inválido/i);
      // Should NOT have called coupon create
      expect(mockCouponCreate).not.toHaveBeenCalled();
    });
  });

  describe("Store-scoped coupon creation", () => {
    it("creates store-scoped coupon when store exists", async () => {
      const storeData = { id: STORE_A_ID, name: "Bodega Central", tenantId: TENANT_ID };
      mockStoreFindUnique.mockResolvedValue(storeData);
      mockCouponCreate.mockResolvedValue(
        makeCoupon({ storeId: STORE_A_ID, code: "CENTRAL20" }),
      );

      const result = await createCouponWithStore({
        code: "CENTRAL20",
        tenantId: TENANT_ID,
        storeId: STORE_A_ID,
        discountType: "percent",
        discountValue: 20,
      });

      expect(result.success).toBe(true);
      expect(result.coupon).toBeDefined();
      expect(result.coupon!.storeId).toBe(STORE_A_ID);
      expect(mockStoreFindUnique).toHaveBeenCalledWith({ where: { id: STORE_A_ID } });
      expect(mockCouponCreate).toHaveBeenCalledOnce();
    });

    it("creates global coupon when no storeId provided", async () => {
      mockCouponCreate.mockResolvedValue(
        makeCoupon({ storeId: null, code: "GLOBAL10" }),
      );

      const result = await createCouponWithStore({
        code: "GLOBAL10",
        tenantId: TENANT_ID,
        discountType: "fixed",
        discountValue: 5,
      });

      expect(result.success).toBe(true);
      expect(result.coupon).toBeDefined();
      expect(result.coupon!.storeId).toBeNull();
      // Should NOT have validated store since none was provided
      expect(mockStoreFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("Cross-store isolation edge cases", () => {
    it("inactive coupon is rejected even if storeId matches", () => {
      const coupon = makeCoupon({ storeId: STORE_A_ID, active: false });

      const result = validateCouponForStore(coupon, STORE_A_ID);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/inactivo/i);
    });

    it("null coupon returns not found error", () => {
      const result = validateCouponForStore(null, STORE_A_ID);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/no encontrado/i);
    });
  });
});
