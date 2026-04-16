/**
 * Tests unitarios para lib/coupons/auto-coupon-triggers.ts
 *
 * Cubre:
 *  - checkAndIssueCoupons: primera compra emite cupón BIENVENIDO
 *  - checkAndIssueCoupons: no emite si ya existe cupón activo (idempotencia)
 *  - checkAndIssueCoupons: 10ma compra emite cupón FIEL
 *  - checkAndIssueCoupons: cumpleaños ±7 días emite cupón CUMPLEANOS
 *  - checkAndIssueCoupons: no emite si feature flag deshabilitado
 *  - checkAndIssueCoupons: no emite si cliente no tiene phone
 *  - isBirthdayWindow: lógica de ventana de días
 *  - issueBirthdayCouponsForTenant: itera clientes y emite correctamente
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockCouponFindFirst,
  mockOrderCount,
  mockCustomerFindMany,
  mockCouponCreate,
} = vi.hoisted(() => ({
  mockCouponFindFirst:  vi.fn(),
  mockOrderCount:       vi.fn(),
  mockCustomerFindMany: vi.fn(),
  mockCouponCreate:     vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: {
      findFirst:  mockCouponFindFirst,
      create:     mockCouponCreate,
    },
    order: {
      count: mockOrderCount,
    },
    customer: {
      findMany: mockCustomerFindMany,
    },
  },
}));

const { mockCouponsDBAdd } = vi.hoisted(() => ({
  mockCouponsDBAdd: vi.fn(),
}));

vi.mock("@/lib/db/promotions.db", () => ({
  CouponsDB: {
    add: mockCouponsDBAdd,
  },
}));

const { mockSendWhatsAppText } = vi.hoisted(() => ({
  mockSendWhatsAppText: vi.fn(),
}));

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppText: mockSendWhatsAppText,
  sendWhatsAppQueued: mockSendWhatsAppText,
}));

const { mockIsFeatureEnabled } = vi.hoisted(() => ({
  mockIsFeatureEnabled: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { checkAndIssueCoupons, issueBirthdayCouponsForTenant } from "@/lib/coupons/auto-coupon-triggers";
import type { DbOrder } from "@/lib/db/misc.db";
import type { DbCustomer } from "@/lib/db/misc.db";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeOrder = (overrides: Partial<DbOrder["customer"]> = {}): DbOrder => ({
  id: "order-001",
  customer: {
    name:  "María López",
    phone: "951111222",
    location: "",
    reference: "",
    ...overrides,
  },
  items: [{ id: 1, name: "Pan", price: 1.0, quantity: 3, unit: "un", image: "" }],
  total: 3.0,
  status: "pendiente",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const baseCustomer: DbCustomer = {
  phone:           "951111222",
  name:            "María López",
  location:        "",
  reference:       "",
  locations:       [],
  activeLocationId: null,
  loyaltyPoints:   0,
  loyaltyTier:     "bronce",
  totalSpent:      0,
  creditBalance:   0,
  creditLimit:     0,
  notifOrderUpdates: true,
  notifPromotions:   true,
  notifRestock:      true,
  createdAt:       new Date().toISOString(),
  updatedAt:       new Date().toISOString(),
};

// ── Tests: checkAndIssueCoupons ───────────────────────────────────────────────

describe("checkAndIssueCoupons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFeatureEnabled.mockReturnValue(true);
    mockCouponFindFirst.mockResolvedValue(null);    // sin cupón previo
    mockCouponsDBAdd.mockResolvedValue({ id: "c1", code: "BIENVENIDO-111222-ABCD" });
    mockSendWhatsAppText.mockResolvedValue(true);
    mockOrderCount.mockResolvedValue(1);             // primera compra por defecto
  });

  it("no hace nada si el feature flag está deshabilitado", async () => {
    mockIsFeatureEnabled.mockReturnValue(false);

    await checkAndIssueCoupons(makeOrder(), baseCustomer, "main");

    expect(mockCouponsDBAdd).not.toHaveBeenCalled();
  });

  it("no hace nada si el cliente no tiene teléfono", async () => {
    const order = makeOrder({ phone: undefined });

    await checkAndIssueCoupons(order, baseCustomer, "main");

    expect(mockCouponsDBAdd).not.toHaveBeenCalled();
  });

  it("emite cupón BIENVENIDO en la primera compra", async () => {
    mockOrderCount.mockResolvedValue(1);

    await checkAndIssueCoupons(makeOrder(), baseCustomer, "main");

    expect(mockCouponsDBAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        discountType:  "percent",
        discountValue: 10,
        maxUses:       1,
      }),
      "main"
    );
    // El código debe empezar con BIENVENIDO-
    const call = mockCouponsDBAdd.mock.calls[0][0] as { code: string };
    expect(call.code).toMatch(/^BIENVENIDO-/);
  });

  it("no emite BIENVENIDO si ya existe un cupón activo (idempotencia)", async () => {
    mockOrderCount.mockResolvedValue(1);
    mockCouponFindFirst.mockResolvedValue({
      id: "existing",
      code: "BIENVENIDO-111222-XXXX",
      active: true,
      expiresAt: new Date(Date.now() + 86400000),
    });

    await checkAndIssueCoupons(makeOrder(), baseCustomer, "main");

    expect(mockCouponsDBAdd).not.toHaveBeenCalled();
  });

  it("emite cupón FIEL en la 10ma compra", async () => {
    mockOrderCount.mockResolvedValue(10);

    await checkAndIssueCoupons(makeOrder(), baseCustomer, "main");

    // Debe haber emitido FIEL (no BIENVENIDO porque orderCount !== 1)
    const codes = mockCouponsDBAdd.mock.calls.map(
      (c) => (c[0] as { code: string }).code
    );
    expect(codes.some((code) => code.startsWith("FIEL-"))).toBe(true);
    // El descuento debe ser 20%
    const fielCall = mockCouponsDBAdd.mock.calls.find(
      (c) => (c[0] as { code: string }).code.startsWith("FIEL-")
    );
    expect(fielCall?.[0]).toMatchObject({ discountValue: 20 });
  });

  it("emite cupón CUMPLEANOS si el cumpleaños es hoy", async () => {
    mockOrderCount.mockResolvedValue(5); // no es primera ni 10ma compra
    const today = new Date().toISOString();
    const customerWithBday: DbCustomer = { ...baseCustomer, birthday: today };

    await checkAndIssueCoupons(makeOrder(), customerWithBday, "main");

    const codes = mockCouponsDBAdd.mock.calls.map(
      (c) => (c[0] as { code: string }).code
    );
    expect(codes.some((code) => code.startsWith("CUMPLEANOS-"))).toBe(true);
    const bdayCall = mockCouponsDBAdd.mock.calls.find(
      (c) => (c[0] as { code: string }).code.startsWith("CUMPLEANOS-")
    );
    expect(bdayCall?.[0]).toMatchObject({ discountValue: 15 });
  });

  it("no emite CUMPLEANOS si el cumpleaños está lejos (fuera de ventana)", async () => {
    mockOrderCount.mockResolvedValue(5);
    // Cumpleaños hace 60 días
    const oldBday = new Date();
    oldBday.setDate(oldBday.getDate() - 60);
    const customerWithBday: DbCustomer = {
      ...baseCustomer,
      birthday: oldBday.toISOString(),
    };

    await checkAndIssueCoupons(makeOrder(), customerWithBday, "main");

    const codes = mockCouponsDBAdd.mock.calls.map(
      (c) => (c[0] as { code: string }).code
    );
    expect(codes.some((code) => code.startsWith("CUMPLEANOS-"))).toBe(false);
  });

  it("envía WhatsApp al cliente después de emitir el cupón", async () => {
    mockOrderCount.mockResolvedValue(1);

    await checkAndIssueCoupons(makeOrder(), baseCustomer, "main");

    // WhatsApp se envía fire-and-forget — esperamos que se llame
    // Puede haber un pequeño delay por la promesa, pero en tests sync ya resolvió
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSendWhatsAppText).toHaveBeenCalled();
  });
});

// ── Tests: issueBirthdayCouponsForTenant ──────────────────────────────────────

describe("issueBirthdayCouponsForTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFeatureEnabled.mockReturnValue(true);
    mockCouponFindFirst.mockResolvedValue(null);
    mockCouponsDBAdd.mockResolvedValue({ id: "c1", code: "CUMPLEANOS-111222-ABCD" });
    mockSendWhatsAppText.mockResolvedValue(true);
  });

  it("retorna 0 issued si el feature flag está deshabilitado", async () => {
    mockIsFeatureEnabled.mockReturnValue(false);

    const result = await issueBirthdayCouponsForTenant("main");

    expect(result).toEqual({ issued: 0, skipped: 0 });
  });

  it("emite cupones a clientes con cumpleaños en la ventana", async () => {
    const today = new Date();
    mockCustomerFindMany.mockResolvedValue([
      { phone: "951000001", name: "Ana", birthday: today },
    ]);

    const result = await issueBirthdayCouponsForTenant("main", 7);

    expect(result.issued).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockCouponsDBAdd).toHaveBeenCalledTimes(1);
  });

  it("omite clientes que ya tienen cupón activo", async () => {
    const today = new Date();
    mockCustomerFindMany.mockResolvedValue([
      { phone: "951000001", name: "Ana", birthday: today },
    ]);
    mockCouponFindFirst.mockResolvedValue({
      id: "existing",
      code: "CUMPLEANOS-000001-XXXX",
      active: true,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const result = await issueBirthdayCouponsForTenant("main", 7);

    expect(result.issued).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockCouponsDBAdd).not.toHaveBeenCalled();
  });

  it("omite clientes cuyo cumpleaños está fuera de la ventana", async () => {
    const farBday = new Date();
    farBday.setDate(farBday.getDate() - 60);
    mockCustomerFindMany.mockResolvedValue([
      { phone: "951000002", name: "Luis", birthday: farBday },
    ]);

    const result = await issueBirthdayCouponsForTenant("main", 7);

    expect(result.issued).toBe(0);
    expect(result.skipped).toBe(0);
    expect(mockCouponsDBAdd).not.toHaveBeenCalled();
  });
});
