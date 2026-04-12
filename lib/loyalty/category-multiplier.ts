import "server-only";

/**
 * lib/loyalty/category-multiplier.ts
 *
 * Defines point multipliers per product category.
 * Categories with higher margins get higher multipliers to incentivize
 * purchases that are more profitable for the business.
 *
 * Base: 1x (1 point per S/1). Max: 3x.
 * Config can be moved to DB/settings later — for now, static.
 */

export interface CategoryMultiplier {
  category: string;
  multiplier: number;
  label: string;
}

/**
 * Default multipliers. Categories not listed get 1x.
 * These match the top-level product categories in the bodega catalog.
 */
export const CATEGORY_MULTIPLIERS: CategoryMultiplier[] = [
  { category: "frutas-y-verduras", multiplier: 2.0, label: "Frutas y Verduras ×2" },
  { category: "lacteos",           multiplier: 1.5, label: "Lácteos ×1.5" },
  { category: "carnes",            multiplier: 2.0, label: "Carnes ×2" },
  { category: "panaderia",         multiplier: 1.5, label: "Panadería ×1.5" },
  { category: "bebidas",           multiplier: 1.0, label: "Bebidas ×1" },
  { category: "abarrotes",         multiplier: 1.0, label: "Abarrotes ×1" },
  { category: "limpieza",          multiplier: 1.0, label: "Limpieza ×1" },
  { category: "snacks",            multiplier: 1.5, label: "Snacks ×1.5" },
  { category: "cuidado-personal",  multiplier: 1.0, label: "Cuidado Personal ×1" },
];

const multiplierMap = new Map(CATEGORY_MULTIPLIERS.map((c) => [c.category, c.multiplier]));

/**
 * Get the point multiplier for a category slug.
 * Returns 1.0 if the category is not configured.
 */
export function getMultiplier(categorySlug: string | null | undefined): number {
  if (!categorySlug) return 1.0;
  return multiplierMap.get(categorySlug.toLowerCase()) ?? 1.0;
}

/**
 * Calculate total loyalty points from order items with category multipliers.
 *
 * @param items - Array of { categorySlug, lineTotal } from the order
 * @returns Total points (floored to integer)
 */
export function calculatePointsWithMultipliers(
  items: { categorySlug?: string | null; lineTotal: number }[],
): { totalPoints: number; breakdown: { category: string; points: number; multiplier: number }[] } {
  const breakdown: { category: string; points: number; multiplier: number }[] = [];
  let totalRaw = 0;

  for (const item of items) {
    const mult = getMultiplier(item.categorySlug);
    const pts = item.lineTotal * mult;
    totalRaw += pts;
    breakdown.push({
      category: item.categorySlug ?? "sin-categoria",
      points: Math.floor(pts),
      multiplier: mult,
    });
  }

  return {
    totalPoints: Math.floor(totalRaw),
    breakdown,
  };
}
