import { test, expect } from "@playwright/test";

/**
 * LocalStorageDoctor — regresión del bug `item.price.toFixed is not a function`.
 *
 * Precarga localStorage con entries legacy corruptos (price string, item sin id)
 * ANTES de navegar. Verifica que:
 *   1. La página renderiza sin errores en consola (el Doctor sanea al mount).
 *   2. Los entries inválidos fueron eliminados o normalizados.
 *   3. El render del RecentlyViewed NO crashea con el error viejo.
 */

const CORRUPTED_ENTRIES = [
  // Entry legacy con price string — la causa original del crash.
  {
    productId: 1,
    storeSlug: "main",
    storeName: "Bodega San Martin",
    name: "Arroz Legacy",
    price: "12.50", // ⚠️ string en vez de number
    image: "/products/arroz-5kg.svg",
    viewedAt: 1700000000000,
  },
  // Entry con shape inválida (sin productId) — debe ser dropped.
  {
    storeSlug: "main",
    name: "Sin ID",
    price: 5,
    image: null,
    viewedAt: 1700000000000,
  },
  // Entry válida — debe sobrevivir.
  {
    productId: 99,
    storeSlug: "main",
    storeName: "Bodega",
    name: "Aceite Valid",
    price: 9.9,
    image: "/products/aceite-primor.svg",
    viewedAt: 1700000000000,
  },
];

test.describe("LocalStorageDoctor", () => {
  test("sanea legacy price string y no crashea /marketplace/explorar", async ({ page }) => {
    // Listener de errores en consola — falla el test si hay TypeError crítico.
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Ir a la ruta ANTES de setear localStorage (necesario para tener origen).
    await page.goto("/marketplace/explorar");

    // Inyectar entries corruptos y recargar.
    await page.evaluate((entries) => {
      localStorage.setItem("marketplace:recent-viewed:v1", JSON.stringify(entries));
    }, CORRUPTED_ENTRIES);

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Verificar que Doctor + schema coercionaron / filtraron.
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("marketplace:recent-viewed:v1");
      return raw ? JSON.parse(raw) : null;
    });

    expect(stored).not.toBeNull();
    expect(Array.isArray(stored)).toBe(true);

    // Entry válida preservada.
    const valid = stored.find((e: { productId: number }) => e.productId === 99);
    expect(valid).toBeTruthy();

    // Entry con price string coercionada a number.
    const coerced = stored.find((e: { productId: number }) => e.productId === 1);
    if (coerced) {
      expect(typeof coerced.price).toBe("number");
      expect(coerced.price).toBe(12.5);
    }

    // Entry sin productId eliminada.
    const invalidRemains = stored.find(
      (e: { productId?: number; name?: string }) => e.name === "Sin ID",
    );
    expect(invalidRemains).toBeUndefined();

    // No crashearon los errores del bug original.
    const fatal = consoleErrors.filter((msg) =>
      msg.includes("toFixed is not a function"),
    );
    expect(fatal).toEqual([]);
  });
});
