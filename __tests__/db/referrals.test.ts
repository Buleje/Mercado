/**
 * lib/db/referrals.db.ts — unit tests
 *
 * Cubre los criterios de aceptación del módulo de referidos:
 *   1. generateCodeForCustomer — devuelve código existente si ya tiene uno
 *   2. generateCodeForCustomer — genera código único de 8 chars base36
 *   3. registerReferral — bloquea auto-referido
 *   4. registerReferral — registra vínculo y crea cupón de bienvenida
 *   5. onFirstOrderCompleted — dispara reward al referrer en primer pedido
 *   6. onFirstOrderCompleted — es idempotente (no duplica reward)
 *   7. listReferralsByCustomer — retorna lista del referrer
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => undefined),
}));

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    customer: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    coupon: {
      create: vi.fn(),
    },
    order: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { ReferralsDB } from "@/lib/db/referrals.db";

const TENANT = "tenant-test";
const REFERRER_PHONE = "+51999000111";
const REFEREE_PHONE = "+51999000222";
const ORDER_ID = "order-abc-123";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 1. generateCodeForCustomer — devuelve existente ───────────────────────────

describe("ReferralsDB.generateCodeForCustomer", () => {
  it("devuelve el código existente si el customer ya tiene uno", async () => {
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      referralCode: "EXISTIN1",
    });

    const code = await ReferralsDB.generateCodeForCustomer(TENANT, REFERRER_PHONE);

    expect(code).toBe("EXISTIN1");
    expect(mockPrisma.customer.updateMany).not.toHaveBeenCalled();
  });

  it("genera y persiste un código único de 8 caracteres si no tiene uno", async () => {
    // findFirst para obtener customer existente → null (sin código)
    mockPrisma.customer.findFirst
      .mockResolvedValueOnce({ referralCode: null }) // primer findFirst (obtener customer)
      .mockResolvedValueOnce(null);                  // segundo findFirst (verificar unicidad)

    mockPrisma.customer.updateMany.mockResolvedValueOnce({ count: 1 });

    const code = await ReferralsDB.generateCodeForCustomer(TENANT, REFERRER_PHONE);

    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[0-9A-Z]{8}$/);
    expect(mockPrisma.customer.updateMany).toHaveBeenCalledWith({
      where: { phone: REFERRER_PHONE, tenantId: TENANT },
      data: { referralCode: code },
    });
  });
});

// ── 3. registerReferral — bloquea auto-referido ───────────────────────────────

describe("ReferralsDB.registerReferral — guardia auto-referido", () => {
  it("retorna error si referrerId === refereeId", async () => {
    const result = await ReferralsDB.registerReferral(
      TENANT,
      REFERRER_PHONE,
      REFERRER_PHONE, // mismo teléfono
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("propio código");
    // No debe tocar la base de datos
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.coupon.create).not.toHaveBeenCalled();
  });
});

// ── 4. registerReferral — flujo completo ─────────────────────────────────────

describe("ReferralsDB.registerReferral — flujo completo", () => {
  it("crea el registro Referral y el cupón de bienvenida para el referee", async () => {
    // $queryRaw: no existe referral previo
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockPrisma.customer.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.$executeRaw.mockResolvedValueOnce(1);
    mockPrisma.coupon.create.mockResolvedValueOnce({
      id: "coupon-bienvenida-1",
      code: "REF-000222-abc",
    });

    const result = await ReferralsDB.registerReferral(
      TENANT,
      REFERRER_PHONE,
      REFEREE_PHONE,
    );

    expect(result.success).toBe(true);
    expect(result.couponCode).toBeDefined();
    expect(result.couponCode).toMatch(/^REF-/);

    // Debe actualizar referredBy del referee
    expect(mockPrisma.customer.updateMany).toHaveBeenCalledWith({
      where: { phone: REFEREE_PHONE, tenantId: TENANT },
      data: { referredBy: REFERRER_PHONE },
    });

    // Debe crear cupón de tipo percent con valor 10
    expect(mockPrisma.coupon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          discountType: "percent",
          discountValue: 10,
          maxUses: 1,
          active: true,
        }),
      }),
    );
  });

  it("retorna error si el referee ya fue referido anteriormente", async () => {
    // $queryRaw: ya existe un registro
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: "referral-existente" }]);

    const result = await ReferralsDB.registerReferral(
      TENANT,
      REFERRER_PHONE,
      REFEREE_PHONE,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("ya fue referido");
    expect(mockPrisma.coupon.create).not.toHaveBeenCalled();
  });
});

// ── 5. onFirstOrderCompleted — dispara reward ─────────────────────────────────

describe("ReferralsDB.onFirstOrderCompleted", () => {
  it("crea cupón de S/10 para el referrer y marca el referral como rewarded", async () => {
    // $queryRaw: encontramos referral pendiente
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { id: "referral-1", referrerId: REFERRER_PHONE, status: "pending" },
    ]);
    // order.count: 0 pedidos previos confirmados (este es el primero)
    mockPrisma.order.count.mockResolvedValueOnce(0);
    // coupon.create: crea el cupón de reward
    mockPrisma.coupon.create.mockResolvedValueOnce({
      id: "coupon-reward-1",
      code: "BONUS-REF-000111-xyz",
    });
    // $executeRaw: update del referral
    mockPrisma.$executeRaw.mockResolvedValueOnce(1);

    const result = await ReferralsDB.onFirstOrderCompleted(
      TENANT,
      REFEREE_PHONE,
      ORDER_ID,
    );

    expect(result.rewarded).toBe(true);
    expect(result.couponCode).toMatch(/^BONUS-REF-/);
    expect(result.referrerId).toBe(REFERRER_PHONE);

    // El cupón para el referrer debe ser de tipo fixed con valor 10
    expect(mockPrisma.coupon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          discountType: "fixed",
          discountValue: 10,
          maxUses: 1,
          active: true,
        }),
      }),
    );
  });

  it("es idempotente: no duplica reward si el referral ya está rewarded", async () => {
    // $queryRaw: referral ya rewarded
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { id: "referral-1", referrerId: REFERRER_PHONE, status: "rewarded" },
    ]);

    const result = await ReferralsDB.onFirstOrderCompleted(
      TENANT,
      REFEREE_PHONE,
      ORDER_ID,
    );

    expect(result.rewarded).toBe(false);
    expect(mockPrisma.coupon.create).not.toHaveBeenCalled();
  });

  it("no dispara reward si el referee ya tiene pedidos previos confirmados", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { id: "referral-1", referrerId: REFERRER_PHONE, status: "pending" },
    ]);
    // 1 pedido previo confirmado → no es el primero
    mockPrisma.order.count.mockResolvedValueOnce(1);

    const result = await ReferralsDB.onFirstOrderCompleted(
      TENANT,
      REFEREE_PHONE,
      ORDER_ID,
    );

    expect(result.rewarded).toBe(false);
    expect(mockPrisma.coupon.create).not.toHaveBeenCalled();
  });

  it("retorna rewarded=false si no existe referral para ese referee", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    const result = await ReferralsDB.onFirstOrderCompleted(
      TENANT,
      REFEREE_PHONE,
      ORDER_ID,
    );

    expect(result.rewarded).toBe(false);
  });
});

// ── 7. listReferralsByCustomer ────────────────────────────────────────────────

describe("ReferralsDB.listReferralsByCustomer", () => {
  it("retorna la lista de referidos del referrer mapeada a DbReferral", async () => {
    const now = new Date("2026-04-10T10:00:00Z");
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        id: "ref-1",
        tenantId: TENANT,
        referrerId: REFERRER_PHONE,
        refereeId: REFEREE_PHONE,
        status: "rewarded",
        rewardCouponId: "coupon-abc",
        orderId: ORDER_ID,
        createdAt: now,
        rewardedAt: now,
      },
    ]);

    const list = await ReferralsDB.listReferralsByCustomer(TENANT, REFERRER_PHONE);

    expect(list).toHaveLength(1);
    expect(list[0].referrerId).toBe(REFERRER_PHONE);
    expect(list[0].refereeId).toBe(REFEREE_PHONE);
    expect(list[0].status).toBe("rewarded");
    expect(list[0].rewardCouponId).toBe("coupon-abc");
    expect(list[0].createdAt).toBe(now.toISOString());
  });

  it("retorna lista vacía si el referrer no tiene referidos", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    const list = await ReferralsDB.listReferralsByCustomer(TENANT, REFERRER_PHONE);
    expect(list).toHaveLength(0);
  });
});
