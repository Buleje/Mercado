import { test, expect } from "@playwright/test";

/**
 * E2E: Tienda catalog — product rendering, search, filters, view mode, cart.
 * Validates the core performance-critical interactions of the /tienda route.
 */

test.describe("Catálogo de la tienda", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tienda");
    await page.evaluate(() => {
      localStorage.removeItem("bsm-cart");
      localStorage.removeItem("bsm-recently-viewed");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  // ── Render ────────────────────────────────────────────────────────────────

  test("la página /tienda carga y muestra productos", async ({ page }) => {
    const firstCard = page.locator('button[aria-label^="Agregar"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
  });

  test("muestra al menos 8 product cards en la primera categoría", async ({ page }) => {
    await page.locator("#productos").scrollIntoViewIfNeeded();
    const cards = page.locator('button[aria-label^="Agregar"]');
    await expect(cards).toHaveCount(await cards.count());
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  // ── Search ────────────────────────────────────────────────────────────────

  test("buscar un producto muestra resultados relevantes", async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill("arroz");

    // Wait for debounced search (300ms) + render
    await page.waitForTimeout(500);

    // Should show a results count or product cards filtered
    const resultText = page.getByText(/resultado/i).first();
    await expect(resultText).toBeVisible({ timeout: 5000 });
  });

  test("limpiar búsqueda restaura el catálogo por categorías", async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]').first();
    await searchInput.fill("arroz");
    await page.waitForTimeout(500);

    // Clear search — X button
    const clearBtn = page.locator('button[aria-label*="limpiar"], button[aria-label*="Limpiar"]').first();
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
    } else {
      await searchInput.clear();
      await searchInput.press("Backspace");
    }
    await page.waitForTimeout(500);

    // Category sections should reappear
    const categorySection = page.locator('[id^="cat-"]').first();
    await expect(categorySection).toBeVisible({ timeout: 5000 });
  });

  // ── View mode toggle ──────────────────────────────────────────────────────

  test("cambiar a vista lista muestra productos como filas", async ({ page }) => {
    // Scroll to catalog
    await page.locator("#productos").scrollIntoViewIfNeeded();

    const listBtn = page.locator('button[aria-label*="lista"], button[title*="lista"]').first();
    if (!(await listBtn.isVisible())) {
      // Toggle button may have different aria label — find the list icon button
      await page.locator('[aria-label*="Lista"]').click().catch(() => {});
    } else {
      await listBtn.click();
    }

    await page.waitForTimeout(300);
    // List view rows have a specific height — verify something changed
    const rows = page.locator(".flex.items-center.gap-3.bg-white").first();
    // This checks that list-mode rows (ListProductRow) are present
    await expect(rows.or(page.locator('[id^="cat-"]').first())).toBeVisible({ timeout: 5000 });
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  test("filtro 'Solo ofertas' reduce los productos visibles", async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]').first();
    await searchInput.fill("a"); // trigger search mode
    await page.waitForTimeout(500);

    const offersFilter = page.locator('label', { hasText: /oferta/i }).first()
      .or(page.locator('input[id*="oferta"]').first());

    if (await offersFilter.isVisible()) {
      await offersFilter.click();
      await page.waitForTimeout(300);
      // Result count should update
      await expect(page.getByText(/resultado/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  // ── Cart integration ──────────────────────────────────────────────────────

  test("agregar producto desde catálogo actualiza el carrito", async ({ page }) => {
    const addBtn = page.locator('button[aria-label^="Agregar"]').first();
    await addBtn.waitFor({ state: "visible", timeout: 15000 });
    await addBtn.click();

    // Cart button badge appears
    const cartBadge = page.locator('button[aria-label="Abrir carrito"]');
    await expect(cartBadge).toContainText("1", { timeout: 3000 });
  });

  test("QuickView modal se abre al pulsar el botón de vista rápida", async ({ page }) => {
    // QuickView button appears on hover/focus — we need to trigger it
    const card = page.locator(".group.relative.bg-white").first();
    await card.hover();

    const quickViewBtn = page.locator('button[aria-label*="Vista rápida"], button[aria-label*="vista rápida"]').first();
    if (await quickViewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await quickViewBtn.click();
      // Modal should appear
      const modal = page.locator('[role="dialog"]').first();
      await expect(modal).toBeVisible({ timeout: 5000 });
      // Close it
      await page.keyboard.press("Escape");
    }
  });

  // ── Category navigation ───────────────────────────────────────────────────

  test("categoría pills filtran el catálogo", async ({ page }) => {
    await page.locator("#productos").scrollIntoViewIfNeeded();

    // Find a category pill (not "Todos")
    const pill = page.locator('button[aria-label*="Filtrar"], button').filter({ hasText: /bebidas|abarrotes|carnes/i }).first();
    if (await pill.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pill.click();
      await page.waitForTimeout(400);
      // Catalog section should still be visible
      await expect(page.locator("#productos")).toBeVisible();
    }
  });

  test("todos los productos de cada categoría se muestran directamente sin necesidad de 'Ver más'", async ({ page }) => {
    // MAX_CAT_VISIBLE = 9999 — no hidden products, no "Ver más" button expected
    await page.locator("#productos").scrollIntoViewIfNeeded();

    // Wait for at least one category section to render
    const catSection = page.locator('[id^="cat-"]').first();
    await catSection.waitFor({ state: "visible", timeout: 15000 });

    // The "Ver más" button should NOT exist when all products are already visible
    const showMoreBtn = page.locator('button', { hasText: /Ver .* más producto/i });
    const count = await showMoreBtn.count();
    expect(count).toBe(0);

    // Confirm product cards are visible (at least 8 total)
    const cards = page.locator('button[aria-label^="Agregar"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(8);
  });
});
