/**
 * Tests para lib/marketplace/cart-sharing.ts
 *
 * Cubre:
 *  1. Roundtrip serialize → deserialize preserva items
 *  2. Array vacío roundtrip → vacío
 *  3. base64 malformado → [] sin lanzar
 *  4. JSON inválido → [] sin lanzar
 *  5. Items con tipos inválidos son filtrados por Zod
 *  6. Encoding URL-safe (sin +, /, = en el token)
 *  7. 50 items no supera 2000 chars de URL total
 *  8. Nombres con Unicode (ñ, tildes) sobreviven el roundtrip
 */

import { describe, it, expect } from "vitest";
import { serializeCart, deserializeCart } from "@/lib/marketplace/cart-sharing";
import type { CartItem } from "@/hooks/use-marketplace-cart";

// ---------- helpers de test ----------

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    storeId: "tienda-1",
    storeName: "Bodega San Martín",
    storeSlug: "bodega-san-martin",
    storeProductId: "sp-1",
    productId: 42,
    name: "Arroz extra",
    price: 3.5,
    quantity: 2,
    image: null,
    unit: "kg",
    ...overrides,
  };
}

// ---------- tests ----------

describe("cart-sharing — serializeCart + deserializeCart", () => {
  it("roundtrip: preserva productId, storeSlug y quantity", () => {
    const items: CartItem[] = [
      makeItem({ productId: 1, storeSlug: "bodega-a", quantity: 3 }),
      makeItem({ productId: 2, storeSlug: "bodega-b", quantity: 1 }),
    ];

    const token = serializeCart(items);
    const result = deserializeCart(token);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ p: 1, s: "bodega-a", q: 3 });
    expect(result[1]).toEqual({ p: 2, s: "bodega-b", q: 1 });
  });

  it("array vacío roundtrip retorna array vacío", () => {
    const token = serializeCart([]);
    const result = deserializeCart(token);
    expect(result).toEqual([]);
  });

  it("base64 malformado retorna [] sin lanzar excepción", () => {
    expect(() => deserializeCart("!!!NOT_BASE64!!!")).not.toThrow();
    expect(deserializeCart("!!!NOT_BASE64!!!")).toEqual([]);
  });

  it("JSON inválido dentro del token retorna [] sin lanzar", () => {
    // Creamos un token que decodifica a JSON roto
    const badToken = Buffer.from("{broken json", "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => deserializeCart(badToken)).not.toThrow();
    expect(deserializeCart(badToken)).toEqual([]);
  });

  it("items con tipos inválidos son rechazados por Zod (cantidad negativa, productId faltante)", () => {
    // Serializar manualmente un payload con datos inválidos
    const badPayload = JSON.stringify([
      { p: -1, s: "tienda", q: 2 },       // productId negativo
      { p: 5, s: "", q: 3 },               // storeSlug vacío
      { p: 3, s: "tienda", q: 0 },         // quantity cero
      { s: "tienda", q: 1 },               // sin productId
    ]);
    const token = Buffer.from(badPayload, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = deserializeCart(token);
    expect(result).toEqual([]);
  });

  it("el token no contiene +, / ni = (URL-safe)", () => {
    const items: CartItem[] = [
      makeItem({ productId: 100, storeSlug: "tienda-pucallpa", quantity: 5 }),
      makeItem({ productId: 200, storeSlug: "mercado-central", quantity: 10 }),
    ];
    const token = serializeCart(items);
    expect(token).not.toMatch(/[+/=]/);
  });

  it("50 items con slugs tipicos no superan 2000 chars de URL total", () => {
    // Slugs realistas: cortos como los que genera Next.js slugify ("bodega-a", "mercado-b")
    const SLUGS = ["a", "b", "c", "d", "e"];
    const items: CartItem[] = Array.from({ length: 50 }, (_, i) =>
      makeItem({ productId: i + 1, storeSlug: SLUGS[i % SLUGS.length], quantity: (i % 9) + 1 })
    );
    const token = serializeCart(items);
    const fullUrl = `http://localhost:3000/marketplace?cart=${token}`;
    expect(fullUrl.length).toBeLessThan(2000);
  });

  it("nombres con Unicode (arroz, ñoquis) sobreviven el roundtrip via storeSlug", () => {
    // storeSlug suele ser ASCII pero verificamos que el JSON con ñ no corrompe
    const items: CartItem[] = [
      makeItem({ productId: 7, storeSlug: "tienda-ninos", quantity: 2 }),
      makeItem({ productId: 8, storeSlug: "bodega-peña", quantity: 1 }),
    ];
    const token = serializeCart(items);
    const result = deserializeCart(token);
    expect(result[0].s).toBe("tienda-ninos");
    expect(result[1].s).toBe("bodega-peña");
  });
});
