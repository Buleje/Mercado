/**
 * Coupons Store Isolation Test Suite (#9 — Cupones por tienda)
 *
 * ADR-380: la versión anterior de este archivo definía `validateCouponForStore`
 * y `createCouponWithStore` DENTRO del propio test — no importaba una sola
 * línea de `lib/db/coupons.db.ts`, así que quedaba verde para siempre sin
 * cubrir el código que de verdad corre en el checkout
 * (verificacion-de-verdad.md #1). Esta versión importa `CouponsDB` real y
 * mockea sólo `prisma`, con un fake store en memoria que responde según el
 * `where` real que manda cada query — así SÍ prueba la rama
 * store-específico → fallback tenant-wide que usa `findByCode`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Fake tabla "Coupon" en memoria + mock de prisma que responde como Postgres ──

type FakeCoupon = {
  id: string;
  code: string;
  tenantId: string;
  storeId: string | null;
  description: string;
  discountType: string;
  discountValue: number;
  balance: number | null;
  minPurchase: number | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: Date | null;
  createdAt: Date;
};

let coupons: FakeCoupon[] = [];
let nextId = 1;

function makeCoupon(overrides: Partial<FakeCoupon> = {}): FakeCoupon {
  return {
    id: overrides.id ?? `cpn-${nextId++}`,
    code: overrides.code ?? "TIENDA10",
    tenantId: overrides.tenantId ?? TENANT_ID,
    storeId: overrides.storeId === undefined ? null : overrides.storeId,
    description: overrides.description ?? "Descuento de tienda",
    discountType: overrides.discountType ?? "percent",
    discountValue: overrides.discountValue ?? 10,
    balance: overrides.balance ?? null,
    minPurchase: overrides.minPurchase ?? null,
    maxUses: overrides.maxUses === undefined ? null : overrides.maxUses,
    usedCount: overrides.usedCount ?? 0,
    active: overrides.active ?? true,
    expiresAt: overrides.expiresAt === undefined ? null : overrides.expiresAt,
    createdAt: overrides.createdAt ?? new Date("2026-01-01"),
  };
}

/** Matchea un coupon fake contra un `where` de Prisma como los que arma coupons.db.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matches(c: FakeCoupon, where: any): boolean {
  if (where.tenantId != null && c.tenantId !== where.tenantId) return false;
  if (where.code != null && c.code !== where.code) return false;
  if (where.active != null && c.active !== where.active) return false;
  if ("storeId" in where) {
    if (where.storeId === null ? c.storeId !== null : c.storeId !== where.storeId) return false;
  }
  if (where.tenantId_code) {
    if (c.tenantId !== where.tenantId_code.tenantId || c.code !== where.tenantId_code.code) return false;
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        coupons.find((c) => matches(c, where)) ?? null,
      ),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        coupons.find((c) => matches(c, where)) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        coupons.filter((c) => matches(c, where)),
      ),
      create: vi.fn(async ({ data }: { data: Partial<FakeCoupon> & { code: string; tenantId: string } }) => {
        const row = makeCoupon(data);
        coupons.push(row);
        return row;
      }),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// El módulo real bajo prueba — nada simulado.
const { CouponsDB } = await import("@/lib/db/coupons.db");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = "demo";
const STORE_A_ID = "store-a-001";
const STORE_B_ID = "store-b-002";

describe("CouponsDB.findByCode — aislamiento por tienda (#9, ADR-380)", () => {
  beforeEach(() => {
    coupons = [];
    nextId = 1;
    vi.clearAllMocks();
  });

  it("cupón con storeId se encuentra al consultar ESA tienda", async () => {
    coupons.push(makeCoupon({ code: "TIENDA10", storeId: STORE_A_ID }));

    const found = await CouponsDB.findByCode(TENANT_ID, "TIENDA10", STORE_A_ID);

    expect(found).not.toBeNull();
    expect(found?.storeId).toBe(STORE_A_ID);
  });

  it("cupón sin storeId (tenant-wide) se encuentra desde CUALQUIER tienda", async () => {
    coupons.push(makeCoupon({ code: "GLOBAL10", storeId: null }));

    const foundFromA = await CouponsDB.findByCode(TENANT_ID, "GLOBAL10", STORE_A_ID);
    const foundFromB = await CouponsDB.findByCode(TENANT_ID, "GLOBAL10", STORE_B_ID);

    expect(foundFromA?.storeId).toBeNull();
    expect(foundFromB?.storeId).toBeNull();
  });

  it("un cupón de la tienda A NO se encuentra al consultar la tienda B (el bug real de ADR-380)", async () => {
    coupons.push(makeCoupon({ code: "SOLO_A", storeId: STORE_A_ID }));

    const foundFromB = await CouponsDB.findByCode(TENANT_ID, "SOLO_A", STORE_B_ID);

    expect(foundFromB).toBeNull();
  });

  it("sin pasar storeId, findByCode ignora el scope (comportamiento legacy explícito, no una fuga)", async () => {
    coupons.push(makeCoupon({ code: "SOLO_A", storeId: STORE_A_ID }));

    // Uso intencional: cuando el caller no tiene noción de tienda (ej. un
    // tenant sin presencia en marketplace), findByCode(tenantId, code) cae al
    // findUnique por la unique key (tenantId, code) sin filtrar storeId.
    const found = await CouponsDB.findByCode(TENANT_ID, "SOLO_A");

    expect(found?.code).toBe("SOLO_A");
  });

  it("no cruza tenants aunque el código coincida", async () => {
    coupons.push(makeCoupon({ code: "TIENDA10", tenantId: "otro-tenant", storeId: null }));

    const found = await CouponsDB.findByCode(TENANT_ID, "TIENDA10", STORE_A_ID);

    expect(found).toBeNull();
  });
});

describe("CouponsDB.create — alcance del cupón nuevo", () => {
  beforeEach(() => {
    coupons = [];
    nextId = 1;
    vi.clearAllMocks();
  });

  it("crea un cupón scoped a una tienda", async () => {
    const created = await CouponsDB.create(TENANT_ID, {
      code: "CENTRAL20",
      storeId: STORE_A_ID,
      discountType: "percent",
      discountValue: 20,
    });

    expect(created.storeId).toBe(STORE_A_ID);
    expect(coupons).toHaveLength(1);
  });

  it("crea un cupón global (todo el tenant) cuando no se pasa storeId", async () => {
    const created = await CouponsDB.create(TENANT_ID, {
      code: "GLOBAL10",
      discountType: "fixed",
      discountValue: 5,
    });

    expect(created.storeId).toBeNull();
  });
});
