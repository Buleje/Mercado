/**
 * M3 — marketplace-commission-formula.test.ts
 *
 * Tests de la función pura calculateCommission() de lib/commissions.ts
 * Fórmula: Math.round((total * rate / 100) * 100) / 100
 *
 * Nota: lib/commissions.ts importa lib/prisma.ts (para recordCommission),
 * que a su vez necesita lib/generated/prisma/client. Se mockea @/lib/prisma
 * para que calculateCommission (función pura) sea testeable sin Prisma generado.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commissionLedger: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { calculateCommission } = await import("@/lib/commissions");

describe("calculateCommission — fórmula de comisión marketplace", () => {
  it("calc(100, 15) === 15.00 (15% de 100)", () => {
    expect(calculateCommission(100, 15)).toBe(15);
  });

  it("calc(99.99, 5.5) === 5.50 (redondeado a 2 dec, no 5.49945)", () => {
    // 99.99 * 5.5 / 100 = 5.49945 → redondeado → 5.5
    expect(calculateCommission(99.99, 5.5)).toBe(5.5);
  });

  it("calc(0, 10) === 0 (total cero)", () => {
    expect(calculateCommission(0, 10)).toBe(0);
  });

  it("calc(1000, 0) === 0 (rate cero = sin comisión)", () => {
    expect(calculateCommission(1000, 0)).toBe(0);
  });

  it("usa rate default 5% cuando no se pasa storeCommissionRate", () => {
    // 200 * 5 / 100 = 10
    expect(calculateCommission(200)).toBe(10);
  });

  it("resultado siempre tiene máximo 2 decimales", () => {
    const result = calculateCommission(33.33, 10);
    const decimals = (result.toString().split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});
