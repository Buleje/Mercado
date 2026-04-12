/**
 * Recipe Cost Calculation Test Suite (#13 — Recetas costo real)
 *
 * Tests the recipe cost and margin calculation logic:
 * - Cost = sum(ingredient.qty * product.cost) is correct
 * - Margin = (price - cost) / price * 100 is correct
 * - Recipe with no ingredients has cost 0 and margin 100%
 * - Ingredient with deleted product returns descriptive error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockRecetaFindUnique,
  mockProductFindUnique,
} = vi.hoisted(() => ({
  mockRecetaFindUnique: vi.fn(),
  mockProductFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    receta: {
      findUnique: mockRecetaFindUnique,
    },
    product: {
      findUnique: mockProductFindUnique,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Types ────────────────────────────────────────────────────────────────────

type Ingredient = {
  id: string;
  recetaId: string;
  productoId: number;
  cantidad: number; // quantity used
  unidad: string;
  producto: {
    id: number;
    name: string;
    costPrice: number | null;
    price: number;
    active: boolean;
  } | null;
};

type Recipe = {
  id: string;
  tenantId: string;
  nombre: string;
  productoId: number | null;
  costoTotal: number;
  activa: boolean;
  ingredientes: Ingredient[];
};

// ── Business logic under test ────────────────────────────────────────────────

/**
 * Calculates the total cost of a recipe based on its ingredients.
 * Uses costPrice preferentially, falls back to price.
 */
function calcularCostoReceta(
  ingredientes: Ingredient[],
): { costo: number; errors: string[] } {
  let costo = 0;
  const errors: string[] = [];

  for (const ing of ingredientes) {
    if (!ing.producto) {
      errors.push(
        `Ingrediente "${ing.id}" referencia producto #${ing.productoId} que fue eliminado`,
      );
      continue;
    }

    if (!ing.producto.active) {
      errors.push(
        `Ingrediente "${ing.producto.name}" (ID: ${ing.productoId}) está inactivo`,
      );
    }

    const costUnit = ing.producto.costPrice ?? ing.producto.price;
    costo += costUnit * ing.cantidad;
  }

  return { costo, errors };
}

/**
 * Calculates the profit margin percentage.
 * margin = (price - cost) / price * 100
 */
function calcularMargen(
  precioVenta: number,
  costo: number,
): number {
  if (precioVenta <= 0) return 0;
  return ((precioVenta - costo) / precioVenta) * 100;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: overrides.id ?? "ing-001",
    recetaId: overrides.recetaId ?? "receta-001",
    productoId: overrides.productoId ?? 1,
    cantidad: overrides.cantidad ?? 1,
    unidad: overrides.unidad ?? "kg",
    producto: overrides.producto === undefined
      ? {
          id: overrides.productoId ?? 1,
          name: "Harina",
          costPrice: 3.5,
          price: 5.0,
          active: true,
        }
      : overrides.producto,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Recipe Cost Calculation (#13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Cost calculation", () => {
    it("cost = sum(ingredient.qty * product.costPrice) is correct", () => {
      const ingredientes: Ingredient[] = [
        makeIngredient({
          id: "ing-001",
          productoId: 1,
          cantidad: 2,
          producto: { id: 1, name: "Harina", costPrice: 3.5, price: 5.0, active: true },
        }),
        makeIngredient({
          id: "ing-002",
          productoId: 2,
          cantidad: 0.5,
          producto: { id: 2, name: "Azúcar", costPrice: 4.0, price: 6.0, active: true },
        }),
        makeIngredient({
          id: "ing-003",
          productoId: 3,
          cantidad: 3,
          producto: { id: 3, name: "Mantequilla", costPrice: 8.0, price: 12.0, active: true },
        }),
      ];

      const { costo, errors } = calcularCostoReceta(ingredientes);

      // 2 * 3.5 + 0.5 * 4.0 + 3 * 8.0 = 7 + 2 + 24 = 33
      expect(costo).toBe(33);
      expect(errors).toHaveLength(0);
    });

    it("falls back to price when costPrice is null", () => {
      const ingredientes: Ingredient[] = [
        makeIngredient({
          id: "ing-001",
          productoId: 1,
          cantidad: 2,
          producto: { id: 1, name: "Harina", costPrice: null, price: 5.0, active: true },
        }),
      ];

      const { costo, errors } = calcularCostoReceta(ingredientes);

      // 2 * 5.0 = 10 (uses price as fallback)
      expect(costo).toBe(10);
      expect(errors).toHaveLength(0);
    });
  });

  describe("Margin calculation", () => {
    it("margin = (price - cost) / price * 100 is correct", () => {
      const precioVenta = 50;
      const costo = 33;

      const margen = calcularMargen(precioVenta, costo);

      // (50 - 33) / 50 * 100 = 34%
      expect(margen).toBe(34);
    });

    it("margin with high markup", () => {
      const precioVenta = 100;
      const costo = 20;

      const margen = calcularMargen(precioVenta, costo);

      // (100 - 20) / 100 * 100 = 80%
      expect(margen).toBe(80);
    });

    it("margin is 0% when selling at cost", () => {
      const precioVenta = 33;
      const costo = 33;

      const margen = calcularMargen(precioVenta, costo);

      expect(margen).toBe(0);
    });

    it("margin is negative when selling below cost", () => {
      const precioVenta = 20;
      const costo = 30;

      const margen = calcularMargen(precioVenta, costo);

      // (20 - 30) / 20 * 100 = -50%
      expect(margen).toBe(-50);
    });
  });

  describe("Edge cases", () => {
    it("recipe with no ingredients has cost 0 and margin 100%", () => {
      const ingredientes: Ingredient[] = [];

      const { costo, errors } = calcularCostoReceta(ingredientes);
      const margen = calcularMargen(50, costo);

      expect(costo).toBe(0);
      expect(errors).toHaveLength(0);
      // (50 - 0) / 50 * 100 = 100%
      expect(margen).toBe(100);
    });

    it("ingredient with deleted product returns descriptive error", () => {
      const ingredientes: Ingredient[] = [
        makeIngredient({
          id: "ing-001",
          productoId: 1,
          cantidad: 2,
          producto: { id: 1, name: "Harina", costPrice: 3.5, price: 5.0, active: true },
        }),
        makeIngredient({
          id: "ing-002",
          productoId: 99,
          cantidad: 1,
          producto: null, // Product was deleted!
        }),
      ];

      const { costo, errors } = calcularCostoReceta(ingredientes);

      // Only the valid ingredient contributes: 2 * 3.5 = 7
      expect(costo).toBe(7);

      // Should have exactly 1 error about the deleted product
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/producto #99/);
      expect(errors[0]).toMatch(/eliminado/i);
    });

    it("multiple deleted products produce multiple errors", () => {
      const ingredientes: Ingredient[] = [
        makeIngredient({ id: "ing-001", productoId: 10, producto: null }),
        makeIngredient({ id: "ing-002", productoId: 20, producto: null }),
        makeIngredient({ id: "ing-003", productoId: 30, producto: null }),
      ];

      const { costo, errors } = calcularCostoReceta(ingredientes);

      expect(costo).toBe(0);
      expect(errors).toHaveLength(3);
      expect(errors[0]).toMatch(/producto #10/);
      expect(errors[1]).toMatch(/producto #20/);
      expect(errors[2]).toMatch(/producto #30/);
    });

    it("margin returns 0 when precioVenta is 0 (avoid division by zero)", () => {
      const margen = calcularMargen(0, 10);
      expect(margen).toBe(0);
    });

    it("single ingredient with quantity 1 produces exact costPrice", () => {
      const ingredientes: Ingredient[] = [
        makeIngredient({
          cantidad: 1,
          producto: { id: 1, name: "Sal", costPrice: 2.5, price: 4.0, active: true },
        }),
      ];

      const { costo } = calcularCostoReceta(ingredientes);
      expect(costo).toBe(2.5);
    });
  });
});
