import type { CartItem } from "@/hooks/use-marketplace-cart";

const CATEGORY_COMPLEMENTS: Record<string, string[]> = {
  abarrotes: ["bebidas", "snacks", "limpieza"],
  bebidas: ["snacks", "panaderia", "abarrotes"],
  carnes: ["abarrotes", "bebidas", "verduras"],
  frutas: ["lacteos", "snacks", "verduras"],
  lacteos: ["panaderia", "abarrotes", "frutas"],
  limpieza: ["abarrotes", "hogar", "higiene personal"],
  panaderia: ["lacteos", "bebidas", "abarrotes"],
  snacks: ["bebidas", "abarrotes"],
  verduras: ["abarrotes", "carnes", "frutas"],
};

const CATEGORY_LABELS: Record<string, string> = {
  abarrotes: "abarrotes",
  bebidas: "bebidas",
  carnes: "carnes",
  frutas: "frutas",
  hogar: "hogar",
  "higiene personal": "higiene personal",
  lacteos: "lacteos",
  limpieza: "limpieza",
  panaderia: "panaderia",
  snacks: "snacks",
  verduras: "verduras",
};

const DEFAULT_TARGET_CATEGORIES = ["bebidas", "snacks", "abarrotes"];

export interface CrossStoreCatalogProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo?: string | null;
  storeZone?: string | null;
  storeRating?: number;
}

export interface CrossStoreComboSuggestion extends CrossStoreCatalogProduct {
  anchorCategory: string;
  comboReason: string;
  comboScore: number;
  targetCategory: string;
}

interface ComboContext {
  anchorByTarget: Map<string, string>;
  anchorCategories: string[];
  cartProductIds: Set<number>;
  cartStoreIds: Set<string>;
  primaryZone: string | null;
  targetCategoryRank: Map<string, number>;
}

function normalizeText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function toCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function buildPrimaryZone(items: CartItem[]): string | null {
  const counts = new Map<string, { count: number; label: string }>();

  for (const item of items) {
    const zone = normalizeText(item.storeZone);
    if (!zone) continue;
    const entry = counts.get(zone);
    if (entry) {
      entry.count += item.quantity;
      continue;
    }
    counts.set(zone, { count: item.quantity, label: item.storeZone ?? "" });
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count)[0]?.label ?? null;
}

function buildTargetCategories(anchorCategories: string[], cartItems: CartItem[]) {
  const cartCategorySet = new Set(
    cartItems
      .map((item) => normalizeText(item.category))
      .filter(Boolean),
  );
  const rankedTargets: string[] = [];
  const seenTargets = new Set<string>();
  const anchorByTarget = new Map<string, string>();

  for (const anchorCategory of anchorCategories) {
    const complements = CATEGORY_COMPLEMENTS[anchorCategory] ?? DEFAULT_TARGET_CATEGORIES;

    for (const candidate of complements) {
      if (seenTargets.has(candidate)) continue;
      if (cartCategorySet.has(candidate)) continue;

      seenTargets.add(candidate);
      rankedTargets.push(candidate);
      anchorByTarget.set(candidate, anchorCategory);
    }
  }

  if (rankedTargets.length > 0) {
    return { anchorByTarget, rankedTargets };
  }

  for (const fallbackCategory of DEFAULT_TARGET_CATEGORIES) {
    if (cartCategorySet.has(fallbackCategory)) continue;
    if (seenTargets.has(fallbackCategory)) continue;

    seenTargets.add(fallbackCategory);
    rankedTargets.push(fallbackCategory);
    anchorByTarget.set(fallbackCategory, anchorCategories[0] ?? fallbackCategory);
  }

  return { anchorByTarget, rankedTargets };
}

function buildComboContext(cartItems: CartItem[]): ComboContext | null {
  const weightedCategories = new Map<string, number>();

  for (const item of cartItems) {
    const category = normalizeText(item.category);
    if (!category) continue;
    weightedCategories.set(category, (weightedCategories.get(category) ?? 0) + item.quantity);
  }

  const anchorCategories = [...weightedCategories.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([category]) => category)
    .slice(0, 2);

  if (anchorCategories.length === 0) {
    return null;
  }

  const { anchorByTarget, rankedTargets } = buildTargetCategories(anchorCategories, cartItems);

  return {
    anchorByTarget,
    anchorCategories,
    cartProductIds: new Set(cartItems.map((item) => item.productId)),
    cartStoreIds: new Set(cartItems.map((item) => item.storeId)),
    primaryZone: buildPrimaryZone(cartItems),
    targetCategoryRank: new Map(rankedTargets.map((category, index) => [category, index])),
  };
}

function buildComboReason(
  product: CrossStoreCatalogProduct,
  anchorCategory: string,
  targetCategory: string,
  primaryZone: string | null,
): string {
  const anchorLabel = toCategoryLabel(anchorCategory);
  const targetLabel = toCategoryLabel(targetCategory);
  const sameZone = primaryZone && normalizeText(primaryZone) === normalizeText(product.storeZone);
  const zoneSuffix = sameZone && product.storeZone ? ` de ${product.storeZone}` : "";

  return `Ya llevas ${anchorLabel}; suma ${targetLabel} desde ${product.storeName}${zoneSuffix} para completar mejor tu compra.`;
}

function rankCandidate(
  product: CrossStoreCatalogProduct,
  categoryRank: number,
  sameZone: boolean,
): number {
  const categoryScore = Math.max(0, 28 - categoryRank * 5);
  const zoneScore = sameZone ? 18 : 0;
  const ratingScore = Math.round((product.storeRating ?? 0) * 4);
  const priceScore = product.price <= 15 ? 6 : product.price <= 30 ? 3 : 0;
  return 40 + categoryScore + zoneScore + ratingScore + priceScore;
}

function balanceSuggestions(
  suggestions: CrossStoreComboSuggestion[],
  limit: number,
): CrossStoreComboSuggestion[] {
  const selected: CrossStoreComboSuggestion[] = [];
  const seenStores = new Set<string>();

  for (const suggestion of suggestions) {
    if (selected.length >= limit) break;
    if (seenStores.has(suggestion.storeId)) continue;
    selected.push(suggestion);
    seenStores.add(suggestion.storeId);
  }

  if (selected.length >= limit) {
    return selected;
  }

  for (const suggestion of suggestions) {
    if (selected.length >= limit) break;
    if (selected.some((item) => item.storeProductId === suggestion.storeProductId)) continue;
    selected.push(suggestion);
  }

  return selected;
}

export function buildCrossStoreComboSuggestions(
  cartItems: CartItem[],
  catalogProducts: CrossStoreCatalogProduct[],
  limit = 3,
): CrossStoreComboSuggestion[] {
  if (cartItems.length === 0 || catalogProducts.length === 0 || limit <= 0) {
    return [];
  }

  const context = buildComboContext(cartItems);
  if (!context) {
    return [];
  }

  const rankedSuggestions = catalogProducts
    .flatMap((product) => {
      const normalizedCategory = normalizeText(product.category);
      if (!normalizedCategory) return [];
      if (product.stock <= 0) return [];
      if (context.cartStoreIds.has(product.storeId)) return [];
      if (context.cartProductIds.has(product.productId)) return [];

      const categoryRank = context.targetCategoryRank.get(normalizedCategory);
      if (categoryRank === undefined) return [];

      const anchorCategory =
        context.anchorByTarget.get(normalizedCategory) ??
        context.anchorCategories[0] ??
        normalizedCategory;
      const sameZone =
        Boolean(context.primaryZone) &&
        normalizeText(context.primaryZone) === normalizeText(product.storeZone);

      return [{
        ...product,
        anchorCategory,
        comboReason: buildComboReason(product, anchorCategory, normalizedCategory, context.primaryZone),
        comboScore: rankCandidate(product, categoryRank, sameZone),
        targetCategory: normalizedCategory,
      } satisfies CrossStoreComboSuggestion];
    })
    .sort((left, right) => {
      if (right.comboScore !== left.comboScore) {
        return right.comboScore - left.comboScore;
      }
      if ((right.storeRating ?? 0) !== (left.storeRating ?? 0)) {
        return (right.storeRating ?? 0) - (left.storeRating ?? 0);
      }
      if (left.price !== right.price) {
        return left.price - right.price;
      }
      return left.name.localeCompare(right.name, "es");
    });

  return balanceSuggestions(rankedSuggestions, limit);
}