import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type IngredientCostDetail = {
  name: string;
  qty: number;
  unitCost: number;
  subtotal: number;
};

export type RecipeCostResult = {
  recipeId: string;
  recipeName: string;
  cost: number;
  margin: number | null;
  sellingPrice: number | null;
  ingredients: IngredientCostDetail[];
};

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Calculate the real cost of a recipe by summing
 * (ingredient.cantidad * product.costPrice) for each ingredient.
 *
 * Falls back to product.price if costPrice is not set.
 * Also updates the recipe's costoTotal in DB.
 *
 * @param tenantId - Tenant scope
 * @param recipeId - The recipe ID
 * @returns Total cost or 0 if recipe not found
 */
export async function calculateRecipeCost(
  tenantId: string,
  recipeId: string,
): Promise<{ cost: number; ingredients: IngredientCostDetail[] } | null> {
  const receta = await prisma.receta.findFirst({
    where: { id: recipeId, tenantId },
    include: {
      ingredientes: {
        include: { producto: true },
      },
    },
  });

  if (!receta) return null;

  const ingredients: IngredientCostDetail[] = [];
  let totalCost = 0;

  for (const ing of receta.ingredientes) {
    const qty = toNumOrZero(ing.cantidad);
    // Prefer costPrice; fall back to retail price
    const unitCost = toNumOrZero(ing.producto.costPrice) || toNumOrZero(ing.producto.price);
    const subtotal = Math.round(qty * unitCost * 100) / 100;

    ingredients.push({
      name: ing.producto.name,
      qty,
      unitCost,
      subtotal,
    });

    totalCost += subtotal;
  }

  totalCost = Math.round(totalCost * 100) / 100;

  // Persist the computed cost back to the recipe
  await prisma.receta.updateMany({
    where: { id: recipeId, tenantId },
    data: { costoTotal: totalCost },
  });

  return { cost: totalCost, ingredients };
}

/**
 * Calculate the margin percentage for a recipe given a selling price.
 *
 * margin = (sellingPrice - cost) / sellingPrice * 100
 *
 * @param tenantId - Tenant scope
 * @param recipeId - The recipe ID
 * @param sellingPrice - The selling price to compare against
 * @returns Margin percentage, or null if recipe not found or sellingPrice is 0
 */
export async function calculateRecipeMargin(
  tenantId: string,
  recipeId: string,
  sellingPrice: number,
): Promise<number | null> {
  if (sellingPrice <= 0) return null;

  const result = await calculateRecipeCost(tenantId, recipeId);
  if (!result) return null;

  const margin = ((sellingPrice - result.cost) / sellingPrice) * 100;
  return Math.round(margin * 100) / 100;
}

/**
 * Get the full cost breakdown of a recipe including margin.
 * If the recipe has a linked product (productoId), uses its price as sellingPrice.
 * Otherwise, sellingPrice can be passed explicitly.
 */
export async function getRecipeCostBreakdown(
  tenantId: string,
  recipeId: string,
  overrideSellingPrice?: number,
): Promise<RecipeCostResult | null> {
  const receta = await prisma.receta.findFirst({
    where: { id: recipeId, tenantId },
    include: {
      ingredientes: {
        include: { producto: true },
      },
      producto: true,
    },
  });

  if (!receta) return null;

  const ingredients: IngredientCostDetail[] = [];
  let totalCost = 0;

  for (const ing of receta.ingredientes) {
    const qty = toNumOrZero(ing.cantidad);
    const unitCost = toNumOrZero(ing.producto.costPrice) || toNumOrZero(ing.producto.price);
    const subtotal = Math.round(qty * unitCost * 100) / 100;

    ingredients.push({
      name: ing.producto.name,
      qty,
      unitCost,
      subtotal,
    });

    totalCost += subtotal;
  }

  totalCost = Math.round(totalCost * 100) / 100;

  // Determine selling price: override > linked product price > null
  const sellingPrice =
    overrideSellingPrice ??
    (receta.producto ? toNumOrZero(receta.producto.price) : null);

  let margin: number | null = null;
  if (sellingPrice && sellingPrice > 0) {
    margin = Math.round(((sellingPrice - totalCost) / sellingPrice) * 100 * 100) / 100;
  }

  // Persist cost
  await prisma.receta.updateMany({
    where: { id: recipeId, tenantId },
    data: { costoTotal: totalCost },
  });

  return {
    recipeId,
    recipeName: receta.nombre,
    cost: totalCost,
    margin,
    sellingPrice,
    ingredients,
  };
}
