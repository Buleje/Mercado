/**
 * __tests__/platform-settings.test.ts
 *
 * Unit tests for the PlatformSetting fix (bug MRR fake 2026-04-09).
 *
 * Covers:
 *   - PlatformSettingsDB: get / getAll / set / setMany / delete
 *   - lib/plans.ts:       getPlanPrice / getAllPlanPrices fallback + override
 *   - lib/plans.ts:       DEFAULT_PLAN_PRICES = {free:0, pro:49, business:149, enterprise:299}
 *
 * Estrategia: mockear `@/lib/prisma` y `@/lib/cache` para evitar DB real.
 * `getOrSet` mock ejecuta directamente el factory (bypass de cache) para que
 * las aserciones validen la lógica de la DB class en aislamiento.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const {
  mockFindUnique,
  mockFindMany,
  mockUpsert,
  mockDelete,
  mockTransaction,
  mockInvalidate,
} = vi.hoisted(() => {
  const mockFindUnique = vi.fn();
  const mockFindMany = vi.fn();
  const mockUpsert = vi.fn();
  const mockDelete = vi.fn();
  const mockTransaction = vi.fn(async (ops: unknown[]) => {
    // Simulamos que $transaction ejecuta el array de promesas secuencial.
    // En prod Prisma batch-las, pero para el test basta con Promise.all.
    return Promise.all(ops as Promise<unknown>[]);
  });
  const mockInvalidate = vi.fn();
  return {
    mockFindUnique,
    mockFindMany,
    mockUpsert,
    mockDelete,
    mockTransaction,
    mockInvalidate,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformSetting: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      upsert: mockUpsert,
      delete: mockDelete,
    },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/cache", () => ({
  // getOrSet bypass: ejecuta el factory directo para testear la DB class.
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: mockInvalidate,
  invalidateByPrefix: vi.fn(),
}));

// Imports AFTER los mocks — obligatorio para que los mocks se apliquen.
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { DEFAULT_PLAN_PRICES } from "@/lib/plans";
import { getPlanPrice, getAllPlanPrices } from "@/lib/plans-server";

// ── Reset entre tests ────────────────────────────────────────────────────────
beforeEach(() => {
  mockFindUnique.mockReset();
  mockFindMany.mockReset();
  mockUpsert.mockReset();
  mockDelete.mockReset();
  mockTransaction.mockClear();
  mockInvalidate.mockClear();
});

// ─── DEFAULT_PLAN_PRICES ─────────────────────────────────────────────────────

describe("DEFAULT_PLAN_PRICES", () => {
  it("tiene el precio canónico de enterprise = 299 (alineado a Stripe price_1TRogQ)", () => {
    expect(DEFAULT_PLAN_PRICES.enterprise).toBe(299);
  });

  it("tiene los 4 planes con los defaults correctos", () => {
    expect(DEFAULT_PLAN_PRICES).toEqual({
      free: 0,
      pro: 49,
      business: 149,
      enterprise: 299,
    });
  });
});

// ─── PlatformSettingsDB.get ──────────────────────────────────────────────────

describe("PlatformSettingsDB.get", () => {
  it("devuelve null cuando el key no existe", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const result = await PlatformSettingsDB.get("nonexistent");

    expect(result).toBeNull();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { key: "nonexistent" },
      select: { value: true },
    });
  });

  it("devuelve el valor typado cuando el key existe", async () => {
    mockFindUnique.mockResolvedValueOnce({
      value: { free: 0, pro: 49, business: 149, enterprise: 299 },
    });

    const result = await PlatformSettingsDB.get<Record<string, number>>("plan-prices");

    expect(result).toEqual({ free: 0, pro: 49, business: 149, enterprise: 299 });
  });
});

// ─── PlatformSettingsDB.getAll ───────────────────────────────────────────────

describe("PlatformSettingsDB.getAll", () => {
  it("devuelve un Record plano de todos los settings", async () => {
    mockFindMany.mockResolvedValueOnce([
      { key: "plan-prices", value: { free: 0, pro: 49, business: 149, enterprise: 299 } },
      { key: "maintenance-mode", value: false },
      { key: "commission-default", value: 2.5 },
    ]);

    const result = await PlatformSettingsDB.getAll();

    expect(result).toEqual({
      "plan-prices": { free: 0, pro: 49, business: 149, enterprise: 299 },
      "maintenance-mode": false,
      "commission-default": 2.5,
    });
  });

  it("devuelve {} si la tabla está vacía", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const result = await PlatformSettingsDB.getAll();
    expect(result).toEqual({});
  });
});

// ─── PlatformSettingsDB.set ──────────────────────────────────────────────────

describe("PlatformSettingsDB.set", () => {
  it("upserts el setting con el updatedBy correcto", async () => {
    mockUpsert.mockResolvedValueOnce({});

    await PlatformSettingsDB.set(
      "plan-prices",
      { free: 0, pro: 49, business: 149, enterprise: 299 },
      "admin@bsm",
    );

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { key: "plan-prices" },
      create: {
        key: "plan-prices",
        value: { free: 0, pro: 49, business: 149, enterprise: 299 },
        updatedBy: "admin@bsm",
      },
      update: {
        value: { free: 0, pro: 49, business: 149, enterprise: 299 },
        updatedBy: "admin@bsm",
      },
    });
  });

  it("invalida el cache del key Y el cache de __all__ tras set()", async () => {
    mockUpsert.mockResolvedValueOnce({});

    await PlatformSettingsDB.set("plan-prices", { pro: 49 });

    expect(mockInvalidate).toHaveBeenCalledWith("platform-settings:plan-prices");
    expect(mockInvalidate).toHaveBeenCalledWith("platform-settings:__all__");
  });

  it("omite updatedBy cuando no se provee", async () => {
    mockUpsert.mockResolvedValueOnce({});

    await PlatformSettingsDB.set("maintenance-mode", true);

    const callArg = mockUpsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(callArg.create).not.toHaveProperty("updatedBy");
    expect(callArg.update).not.toHaveProperty("updatedBy");
  });
});

// ─── PlatformSettingsDB.setMany ──────────────────────────────────────────────

describe("PlatformSettingsDB.setMany", () => {
  it("usa $transaction con N upserts", async () => {
    mockUpsert.mockResolvedValue({});

    await PlatformSettingsDB.setMany(
      {
        "plan-prices": { free: 0, pro: 49, business: 149, enterprise: 299 },
        "maintenance-mode": false,
      },
      "admin@bsm",
    );

    expect(mockTransaction).toHaveBeenCalledOnce();
    // 2 upserts para 2 keys
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("es no-op cuando no hay settings", async () => {
    await PlatformSettingsDB.setMany({});
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("invalida cada key tocada + el __all__ cache", async () => {
    mockUpsert.mockResolvedValue({});

    await PlatformSettingsDB.setMany({
      "plan-prices": {},
      "maintenance-mode": true,
    });

    expect(mockInvalidate).toHaveBeenCalledWith("platform-settings:plan-prices");
    expect(mockInvalidate).toHaveBeenCalledWith("platform-settings:maintenance-mode");
    expect(mockInvalidate).toHaveBeenCalledWith("platform-settings:__all__");
  });
});

// ─── PlatformSettingsDB.delete ───────────────────────────────────────────────

describe("PlatformSettingsDB.delete", () => {
  it("llama a prisma.platformSetting.delete con el key", async () => {
    mockDelete.mockResolvedValueOnce({});

    await PlatformSettingsDB.delete("plan-prices");

    expect(mockDelete).toHaveBeenCalledWith({ where: { key: "plan-prices" } });
  });

  it("no rompe si el key no existe (swallow)", async () => {
    mockDelete.mockRejectedValueOnce(new Error("Record not found"));

    await expect(PlatformSettingsDB.delete("ghost")).resolves.toBeUndefined();
  });

  it("invalida el cache del key + __all__ tras delete()", async () => {
    mockDelete.mockResolvedValueOnce({});

    await PlatformSettingsDB.delete("maintenance-mode");

    expect(mockInvalidate).toHaveBeenCalledWith("platform-settings:maintenance-mode");
    expect(mockInvalidate).toHaveBeenCalledWith("platform-settings:__all__");
  });
});

// ─── getPlanPrice / getAllPlanPrices ─────────────────────────────────────────

describe("getPlanPrice (lib/plans.ts)", () => {
  it("retorna DEFAULT_PLAN_PRICES.enterprise (299) si no hay override en DB", async () => {
    mockFindUnique.mockResolvedValueOnce(null); // plan-prices no existe

    const price = await getPlanPrice("enterprise");

    expect(price).toBe(299);
  });

  it("retorna DEFAULT_PLAN_PRICES.pro (49) si no hay override", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const price = await getPlanPrice("pro");
    expect(price).toBe(49);
  });

  it("retorna el valor de la DB cuando hay override", async () => {
    mockFindUnique.mockResolvedValueOnce({
      value: { free: 0, pro: 59, business: 179, enterprise: 599 },
    });

    const price = await getPlanPrice("enterprise");

    expect(price).toBe(599);
  });

  it("cae a default por-plano cuando el override es parcial", async () => {
    // Solo pro está overrideado, enterprise debe caer al default 299.
    mockFindUnique.mockResolvedValueOnce({
      value: { pro: 59 },
    });

    const enterprisePrice = await getPlanPrice("enterprise");
    expect(enterprisePrice).toBe(299);
  });
});

describe("getAllPlanPrices (lib/plans.ts)", () => {
  it("retorna los 4 defaults cuando no hay override", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const prices = await getAllPlanPrices();

    expect(prices).toEqual({
      free: 0,
      pro: 49,
      business: 149,
      enterprise: 299,
    });
  });

  it("retorna los 4 valores de la DB cuando hay override completo", async () => {
    mockFindUnique.mockResolvedValueOnce({
      value: { free: 0, pro: 59, business: 179, enterprise: 599 },
    });

    const prices = await getAllPlanPrices();

    expect(prices).toEqual({
      free: 0,
      pro: 59,
      business: 179,
      enterprise: 599,
    });
  });

  it("mezcla override parcial con defaults (merge shallow)", async () => {
    mockFindUnique.mockResolvedValueOnce({
      value: { enterprise: 699 }, // solo enterprise overrideado
    });

    const prices = await getAllPlanPrices();

    expect(prices).toEqual({
      free: 0,
      pro: 49,
      business: 149,
      enterprise: 699,
    });
  });

  it("cae a defaults si la DB class rompe (migración no corrida)", async () => {
    mockFindUnique.mockRejectedValueOnce(new Error("table does not exist"));

    const prices = await getAllPlanPrices();

    expect(prices).toEqual(DEFAULT_PLAN_PRICES);
  });
});
