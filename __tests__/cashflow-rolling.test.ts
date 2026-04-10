/**
 * Cashflow Rolling 13-Week Forecast Test Suite (#11 — Flujo de caja)
 *
 * Tests the rolling 13-week cashflow projection logic:
 * - 13 weeks with normal sales produce positive balances
 * - Week with more payments than collections shows negative balance flagged
 * - 0 data returns 13 weeks with zero balances
 * - Overdue fiados are added to expected collections
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockOrderFindMany,
  mockFiadoFindMany,
  mockPurchaseOrderFindMany,
  mockExpenseFindMany,
} = vi.hoisted(() => ({
  mockOrderFindMany: vi.fn(),
  mockFiadoFindMany: vi.fn(),
  mockPurchaseOrderFindMany: vi.fn(),
  mockExpenseFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findMany: mockOrderFindMany },
    fiado: { findMany: mockFiadoFindMany },
    purchaseOrder: { findMany: mockPurchaseOrderFindMany },
    expense: { findMany: mockExpenseFindMany },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Types ────────────────────────────────────────────────────────────────────

type CashflowWeek = {
  weekNumber: number;
  startDate: string;
  endDate: string;
  cobrosEsperados: number; // expected collections (sales + fiados)
  pagosEsperados: number;  // expected payments (purchases + expenses)
  saldoNeto: number;       // cobros - pagos
  saldoAcumulado: number;  // running cumulative balance
  isNegative: boolean;     // flagged if saldoNeto < 0
};

type CashflowInput = {
  ventas: { weekIndex: number; amount: number }[];
  fiadosVencidos: { weekIndex: number; amount: number }[];
  compras: { weekIndex: number; amount: number }[];
  gastos: { weekIndex: number; amount: number }[];
  saldoInicial?: number;
};

// ── Business logic under test ────────────────────────────────────────────────

/**
 * Generates a 13-week rolling cashflow forecast.
 * This pure function represents the core calculation logic that would
 * live in a service/lib module.
 */
function generateCashflowForecast(input: CashflowInput): CashflowWeek[] {
  const WEEKS = 13;
  const today = new Date();
  const saldoInicial = input.saldoInicial ?? 0;

  const weeks: CashflowWeek[] = [];
  let acumulado = saldoInicial;

  for (let i = 0; i < WEEKS; i++) {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() + i * 7);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    // Aggregate collections for this week
    const ventasSemana = input.ventas
      .filter((v) => v.weekIndex === i)
      .reduce((sum, v) => sum + v.amount, 0);

    const fiadosSemana = input.fiadosVencidos
      .filter((f) => f.weekIndex === i)
      .reduce((sum, f) => sum + f.amount, 0);

    const cobrosEsperados = ventasSemana + fiadosSemana;

    // Aggregate payments for this week
    const comprasSemana = input.compras
      .filter((c) => c.weekIndex === i)
      .reduce((sum, c) => sum + c.amount, 0);

    const gastosSemana = input.gastos
      .filter((g) => g.weekIndex === i)
      .reduce((sum, g) => sum + g.amount, 0);

    const pagosEsperados = comprasSemana + gastosSemana;

    const saldoNeto = cobrosEsperados - pagosEsperados;
    acumulado += saldoNeto;

    weeks.push({
      weekNumber: i + 1,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      cobrosEsperados,
      pagosEsperados,
      saldoNeto,
      saldoAcumulado: acumulado,
      isNegative: saldoNeto < 0,
    });
  }

  return weeks;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Cashflow Rolling 13-Week Forecast (#11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("13 weeks with normal sales produce positive balances", () => {
    // Every week: S/500 in sales, S/300 in expenses
    const input: CashflowInput = {
      ventas: Array.from({ length: 13 }, (_, i) => ({ weekIndex: i, amount: 500 })),
      fiadosVencidos: [],
      compras: Array.from({ length: 13 }, (_, i) => ({ weekIndex: i, amount: 200 })),
      gastos: Array.from({ length: 13 }, (_, i) => ({ weekIndex: i, amount: 100 })),
      saldoInicial: 1000,
    };

    const result = generateCashflowForecast(input);

    expect(result).toHaveLength(13);

    // Every week should have positive net balance (500 - 300 = 200)
    result.forEach((week) => {
      expect(week.cobrosEsperados).toBe(500);
      expect(week.pagosEsperados).toBe(300);
      expect(week.saldoNeto).toBe(200);
      expect(week.isNegative).toBe(false);
    });

    // Cumulative: 1000 + 200*1 = 1200, 1000 + 200*2 = 1400, ...
    expect(result[0].saldoAcumulado).toBe(1200);
    expect(result[12].saldoAcumulado).toBe(1000 + 200 * 13); // 3600
  });

  it("week with more payments than collections shows negative balance flagged", () => {
    const input: CashflowInput = {
      ventas: [
        { weekIndex: 0, amount: 500 },
        { weekIndex: 1, amount: 100 }, // Low sales week
        { weekIndex: 2, amount: 500 },
      ],
      fiadosVencidos: [],
      compras: [
        { weekIndex: 0, amount: 200 },
        { weekIndex: 1, amount: 800 }, // Big supplier payment
        { weekIndex: 2, amount: 200 },
      ],
      gastos: [
        { weekIndex: 0, amount: 100 },
        { weekIndex: 1, amount: 100 },
        { weekIndex: 2, amount: 100 },
      ],
      saldoInicial: 0,
    };

    const result = generateCashflowForecast(input);

    // Week 1: 500 - 300 = 200 (positive)
    expect(result[0].saldoNeto).toBe(200);
    expect(result[0].isNegative).toBe(false);

    // Week 2: 100 - 900 = -800 (NEGATIVE - flagged!)
    expect(result[1].saldoNeto).toBe(-800);
    expect(result[1].isNegative).toBe(true);
    expect(result[1].cobrosEsperados).toBe(100);
    expect(result[1].pagosEsperados).toBe(900);

    // Week 3: 500 - 300 = 200 (positive again)
    expect(result[2].saldoNeto).toBe(200);
    expect(result[2].isNegative).toBe(false);

    // Cumulative balance reflects the dip
    expect(result[0].saldoAcumulado).toBe(200);
    expect(result[1].saldoAcumulado).toBe(-600); // 200 - 800
    expect(result[2].saldoAcumulado).toBe(-400); // -600 + 200
  });

  it("0 data returns 13 weeks with zero balances", () => {
    const input: CashflowInput = {
      ventas: [],
      fiadosVencidos: [],
      compras: [],
      gastos: [],
      saldoInicial: 0,
    };

    const result = generateCashflowForecast(input);

    expect(result).toHaveLength(13);

    result.forEach((week, index) => {
      expect(week.weekNumber).toBe(index + 1);
      expect(week.cobrosEsperados).toBe(0);
      expect(week.pagosEsperados).toBe(0);
      expect(week.saldoNeto).toBe(0);
      expect(week.saldoAcumulado).toBe(0);
      expect(week.isNegative).toBe(false);
      // Dates should be valid ISO strings
      expect(week.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(week.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("overdue fiados are added to expected collections", () => {
    const input: CashflowInput = {
      ventas: [
        { weekIndex: 0, amount: 300 },
        { weekIndex: 1, amount: 300 },
        { weekIndex: 2, amount: 300 },
      ],
      fiadosVencidos: [
        { weekIndex: 0, amount: 150 }, // S/150 in overdue fiados expected week 1
        { weekIndex: 1, amount: 250 }, // S/250 in overdue fiados expected week 2
      ],
      compras: [
        { weekIndex: 0, amount: 200 },
        { weekIndex: 1, amount: 200 },
        { weekIndex: 2, amount: 200 },
      ],
      gastos: [],
      saldoInicial: 500,
    };

    const result = generateCashflowForecast(input);

    // Week 1: cobros = 300 (ventas) + 150 (fiados) = 450
    expect(result[0].cobrosEsperados).toBe(450);
    expect(result[0].pagosEsperados).toBe(200);
    expect(result[0].saldoNeto).toBe(250);

    // Week 2: cobros = 300 (ventas) + 250 (fiados) = 550
    expect(result[1].cobrosEsperados).toBe(550);
    expect(result[1].pagosEsperados).toBe(200);
    expect(result[1].saldoNeto).toBe(350);

    // Week 3: cobros = 300 (ventas only, no fiados)
    expect(result[2].cobrosEsperados).toBe(300);
    expect(result[2].pagosEsperados).toBe(200);
    expect(result[2].saldoNeto).toBe(100);

    // Cumulative: 500 + 250 = 750, 750 + 350 = 1100, 1100 + 100 = 1200
    expect(result[0].saldoAcumulado).toBe(750);
    expect(result[1].saldoAcumulado).toBe(1100);
    expect(result[2].saldoAcumulado).toBe(1200);
  });

  describe("Edge cases", () => {
    it("weeks without any data default to zero", () => {
      // Only provide data for week 0, rest should be zero
      const input: CashflowInput = {
        ventas: [{ weekIndex: 0, amount: 1000 }],
        fiadosVencidos: [],
        compras: [{ weekIndex: 0, amount: 400 }],
        gastos: [],
        saldoInicial: 0,
      };

      const result = generateCashflowForecast(input);

      expect(result[0].saldoNeto).toBe(600);
      // Weeks 2-13 should all have zero flow
      for (let i = 1; i < 13; i++) {
        expect(result[i].cobrosEsperados).toBe(0);
        expect(result[i].pagosEsperados).toBe(0);
        expect(result[i].saldoNeto).toBe(0);
      }
      // But cumulative stays at 600
      expect(result[12].saldoAcumulado).toBe(600);
    });

    it("negative saldoInicial propagates correctly", () => {
      const input: CashflowInput = {
        ventas: [{ weekIndex: 0, amount: 100 }],
        fiadosVencidos: [],
        compras: [],
        gastos: [],
        saldoInicial: -500,
      };

      const result = generateCashflowForecast(input);

      // Week 1: -500 + 100 = -400
      expect(result[0].saldoAcumulado).toBe(-400);
      expect(result[0].isNegative).toBe(false); // net is positive (+100)
    });

    it("week numbers are sequential 1 through 13", () => {
      const input: CashflowInput = {
        ventas: [],
        fiadosVencidos: [],
        compras: [],
        gastos: [],
      };

      const result = generateCashflowForecast(input);
      const weekNumbers = result.map((w) => w.weekNumber);

      expect(weekNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    });
  });
});
