import { describe, expect, it } from "vitest";
import { buildCrossStoreComboSuggestions, type CrossStoreCatalogProduct } from "@/lib/marketplace/cross-store-combos";
import type { CartItem } from "@/hooks/use-marketplace-cart";

const CART_ITEM: CartItem = {
  category: "Bebidas",
  image: null,
  name: "Gaseosa Cola 2L",
  price: 8.5,
  productId: 10,
  quantity: 1,
  storeId: "store-a",
  storeName: "Bodega A",
  storeProductId: "sp-10",
  storeSlug: "bodega-a",
  storeZone: "Centro",
  unit: "unidad",
};

function buildCatalogProduct(overrides: Partial<CrossStoreCatalogProduct>): CrossStoreCatalogProduct {
  return {
    category: "Snacks",
    image: null,
    name: "Papas artesanales",
    price: 6,
    productId: 99,
    stock: 8,
    storeId: "store-b",
    storeName: "Snack Express",
    storeProductId: "sp-99",
    storeRating: 4.8,
    storeSlug: "snack-express",
    storeZone: "Centro",
    unit: "unidad",
    ...overrides,
  };
}

describe("buildCrossStoreComboSuggestions", () => {
  it("prioriza productos complementarios de otra tienda en la misma zona", () => {
    const suggestions = buildCrossStoreComboSuggestions(
      [CART_ITEM],
      [
        buildCatalogProduct({ productId: 20, storeId: "store-b", storeName: "Snack Express", storeProductId: "sp-20" }),
        buildCatalogProduct({ productId: 21, storeId: "store-c", storeName: "Norte Market", storeProductId: "sp-21", storeZone: "Norte", storeRating: 5 }),
        buildCatalogProduct({ productId: 22, category: "Bebidas", storeId: "store-d", storeName: "Bebidas Ya", storeProductId: "sp-22" }),
      ],
      2,
    );

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].storeId).toBe("store-b");
    expect(suggestions[0].targetCategory).toBe("snacks");
    expect(suggestions[0].comboReason).toContain("bebidas");
    expect(suggestions.every((item) => item.storeId !== CART_ITEM.storeId)).toBe(true);
  });

  it("excluye la misma tienda y productos ya presentes en el carrito", () => {
    const suggestions = buildCrossStoreComboSuggestions(
      [
        CART_ITEM,
        {
          ...CART_ITEM,
          category: "Abarrotes",
          name: "Arroz extra",
          price: 4.2,
          productId: 11,
          storeId: "store-b",
          storeName: "Bodega B",
          storeProductId: "sp-11",
          storeSlug: "bodega-b",
        },
      ],
      [
        buildCatalogProduct({ productId: 10, storeId: "store-c", storeName: "Otra tienda", storeProductId: "sp-10-c" }),
        buildCatalogProduct({ productId: 40, storeId: "store-b", storeName: "Bodega B", storeProductId: "sp-40" }),
        buildCatalogProduct({ productId: 50, storeId: "store-d", storeName: "Pan Centro", storeProductId: "sp-50", category: "Panadería" }),
      ],
      3,
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].productId).toBe(50);
    expect(suggestions[0].storeId).toBe("store-d");
  });
});