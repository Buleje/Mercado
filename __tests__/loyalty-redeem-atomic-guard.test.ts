/**
 * __tests__/loyalty-redeem-atomic-guard.test.ts
 *
 * `LoyaltyDB.redeemPoints` (lib/db/customers.db.ts) es el que usan
 * /api/loyalty/redeem y /api/loyalty/[phone] — el camino admin/POS, resuelto
 * vía el barrel `@/lib/jsondb` (no confundir con `lib/db/loyalty.db.ts`, la
 * clase homónima del lado marketplace).
 *
 * Encontrado 2026-08-22: leía el saldo (`findFirst`) y escribía el valor YA
 * CALCULADO (`c.loyaltyPoints - points`) en un `updateMany` aparte. Bajo READ
 * COMMITTED sin lock de fila, dos canjes concurrentes del mismo teléfono
 * podían leer el MISMO saldo antes de que ninguno commitee, los dos pasar el
 * check `c.loyaltyPoints < points`, y el segundo pisar el saldo dejándolo
 * negativo. El fix mueve la condición de saldo al WHERE del propio UPDATE
 * (Prisma lo traduce a un solo statement atómico) — este test fija que:
 *   1. Con saldo insuficiente, `updateMany` se llama con la condición y NO
 *      se escribe el ledger cuando el `count` viene en 0 (la "derrota" de la
 *      carrera).
 *   2. Con saldo suficiente, decrementa vía `{ decrement }` (no un valor
 *      absoluto precalculado) y escribe el ledger.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdateMany = vi.fn();
const mockTransactionCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
    loyaltyTransaction: {
      create: (...a: unknown[]) => mockTransactionCreate(...a),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
  getOrSet: vi.fn(),
}));

import { LoyaltyDB } from "@/lib/db/customers.db";

const TENANT = "bodega-a";
const PHONE = "51987654321";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoyaltyDB.redeemPoints — guard atómico contra doble canje concurrente", () => {
  it("pierde la carrera con count:0 y NO escribe el ledger cuando el saldo ya no alcanza", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const ok = await LoyaltyDB.redeemPoints(TENANT, PHONE, 100);

    expect(ok).toBe(false);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    // La condición de saldo vive en el WHERE, no en un `if` previo sobre un
    // valor leído por separado.
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ loyaltyPoints: { gte: 100 } }),
        data: expect.objectContaining({ loyaltyPoints: { decrement: 100 } }),
      }),
    );
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });

  it("con saldo suficiente, decrementa atómico y escribe el ledger", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockTransactionCreate.mockResolvedValue({});

    const ok = await LoyaltyDB.redeemPoints(TENANT, PHONE, 50);

    expect(ok).toBe(true);
    expect(mockTransactionCreate).toHaveBeenCalledTimes(1);
    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: -50, reason: "redemption" }),
      }),
    );
  });

  it("nunca escribe con points <= 0 (no hay carrera que ganarle a un no-op)", async () => {
    const ok = await LoyaltyDB.redeemPoints(TENANT, PHONE, 0);

    expect(ok).toBe(false);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
