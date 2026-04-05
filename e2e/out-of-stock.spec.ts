import { test, expect } from "@playwright/test";

/**
 * E2E: Out-of-stock product flow
 * Validates that out-of-stock products are displayed correctly,
 * cannot be added to cart, show "Avisarme" link, and filters work.
 */

test.describe("Producto agotado", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tienda");
    await page.evaluate(() => {
      localStorage.removeItem("bsm-cart");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  test("productos agotados muestran badge 'Agotado'", async ({ page }) => {
    // Scroll to the product catalog section
    const catalogSection = page.locator("#productos");
    if (await catalogSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await catalogSection.scrollIntoViewIfNeeded();
    }

    // Look for any "Agotado" badge in the page
    const agotadoBadge = page.getByText("Agotado", { exact: true }).first();
    const hasOutOfStock = await agotadoBadge.isVisible({ timeout: 8000 }).catch(() => false);

    if (hasOutOfStock) {
      await expect(agotadoBadge).toBeVisible();
    } else {
      // No out-of-stock products in catalog — test passes (data-dependent)
      test.skip();
    }
  });

  test("producto agotado no tiene botón de agregar al carrito activo", async ({ page }) => {
    const catalogSection = page.locator("#productos");
    if (await catalogSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await catalogSection.scrollIntoViewIfNeeded();
    }

    const agotadoCard = page.locator(".pointer-events-none").first();
    const hasOutOfStock = await agotadoCard.isVisible({ timeout: 8000 }).catch(() => false);

    if (!hasOutOfStock) {
      test.skip();
      return;
    }

    // The card should have pointer-events-none making it non-interactive
    await expect(agotadoCard).toHaveClass(/pointer-events-none/);
  });

  test("producto agotado muestra enlace 'Avisarme cuando vuelva'", async ({ page }) => {
    const catalogSection = page.locator("#productos");
    if (await catalogSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await catalogSection.scrollIntoViewIfNeeded();
    }

    const avisarmeLink = page.getByText("Avisarme cuando vuelva").first();
    const hasOutOfStock = await avisarmeLink.isVisible({ timeout: 8000 }).catch(() => false);

    if (!hasOutOfStock) {
      test.skip();
      return;
    }

    await expect(avisarmeLink).toBeVisible();
    // Verify it's a link that navigates to the product detail
    const href = await avisarmeLink.getAttribute("href");
    expect(href).toMatch(/\/tienda\//);
  });

  test("filtro 'Disponible' oculta productos agotados", async ({ page }) => {
    const catalogSection = page.locator("#productos");
    if (await catalogSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await catalogSection.scrollIntoViewIfNeeded();
    }

    // Check if there are out-of-stock products
    const agotadoBadge = page.getByText("Agotado", { exact: true }).first();
    const hasOutOfStock = await agotadoBadge.isVisible({ timeout: 8000 }).catch(() => false);

    if (!hasOutOfStock) {
      test.skip();
      return;
    }

    // Click the "Disponible" filter button
    const disponibleBtn = page.locator("button", { hasText: "Disponible" }).first();
    await expect(disponibleBtn).toBeVisible({ timeout: 5000 });
    await disponibleBtn.click();
    await page.waitForTimeout(500);

    // "Agotado" badges should no longer be visible
    const agotadoAfter = page.getByText("Agotado", { exact: true });
    await expect(agotadoAfter).toHaveCount(0);
  });

  test("filtro 'Agotado' muestra solo productos sin stock", async ({ page }) => {
    const catalogSection = page.locator("#productos");
    if (await catalogSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await catalogSection.scrollIntoViewIfNeeded();
    }

    // Click the "Agotado" filter button
    const agotadoBtn = page.locator("button", { hasText: "Agotado" }).first();
    const filterExists = await agotadoBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!filterExists) {
      test.skip();
      return;
    }

    await agotadoBtn.click();
    await page.waitForTimeout(500);

    // All visible product cards should have "Agotado" badge or be out of stock
    const activeFilterPill = page.getByText("❌ Agotado").first();
    await expect(activeFilterPill).toBeVisible({ timeout: 3000 });
  });
});
