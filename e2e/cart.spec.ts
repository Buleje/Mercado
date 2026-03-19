import { test, expect } from "@playwright/test";

test.describe("Carrito de compras", () => {
  test.beforeEach(async ({ page }) => {
    // Clear cart state before each test
    await page.goto("/tienda");
    await page.evaluate(() => {
      localStorage.removeItem("bsm-cart");
      localStorage.removeItem("bsm-cart-reserve-start");
    });
    await page.reload();
    // Wait for catalog to load (skeletons resolve)
    await page.waitForLoadState("networkidle");
  });

  test("carrito está vacío inicialmente", async ({ page }) => {
    await page.locator('button[aria-label="Abrir carrito"]').click();
    await expect(
      page.getByRole("dialog", { name: "Carrito de compras" })
    ).toBeVisible();
    await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
  });

  test("cerrar carrito con botón X", async ({ page }) => {
    await page.locator('button[aria-label="Abrir carrito"]').click();
    const sidebar = page.getByRole("dialog", { name: "Carrito de compras" });
    await expect(sidebar).toBeVisible();
    await page.locator('button[aria-label="Cerrar carrito"]').click();
    await expect(sidebar).not.toBeVisible();
  });

  test("agregar producto al carrito actualiza el contador", async ({ page }) => {
    // Wait for at least one "Agregar" button to appear
    const addBtn = page
      .locator('button[aria-label^="Agregar"]')
      .first();
    await addBtn.waitFor({ state: "visible", timeout: 15000 });
    await addBtn.click();

    // Cart count badge should now show ≥1
    const cartBtn = page.locator('button[aria-label="Abrir carrito"]');
    await expect(cartBtn).toContainText("1");
  });

  test("producto aparece en sidebar del carrito después de agregarlo", async ({
    page,
  }) => {
    const addBtn = page
      .locator('button[aria-label^="Agregar"]')
      .first();
    await addBtn.waitFor({ state: "visible", timeout: 15000 });

    // Capture the product name from the card
    await addBtn.click();

    await page.locator('button[aria-label="Abrir carrito"]').click();
    const sidebar = page.getByRole("dialog", { name: "Carrito de compras" });
    await expect(sidebar).toBeVisible();
    // At least one item should be listed (not showing empty state)
    await expect(page.getByText("Tu carrito está vacío")).not.toBeVisible();
  });

  test("puede aumentar cantidad de producto en carrito", async ({ page }) => {
    const addBtn = page.locator('button[aria-label^="Agregar"]').first();
    await addBtn.waitFor({ state: "visible", timeout: 15000 });
    await addBtn.click();

    await page.locator('button[aria-label="Abrir carrito"]').click();
    // Increment quantity
    const incrementBtn = page
      .locator('button[aria-label^="Incrementar"]')
      .first();
    await incrementBtn.waitFor({ state: "visible", timeout: 5000 });
    await incrementBtn.click();

    // Cart count should now show 2
    await expect(
      page.locator('button[aria-label="Abrir carrito"]')
    ).toContainText("2");
  });

  test("carrito persiste después de recargar página", async ({ page }) => {
    // Add a product
    const addBtn = page.locator('button[aria-label^="Agregar"]').first();
    await addBtn.waitFor({ state: "visible", timeout: 15000 });
    await addBtn.click();

    // Verify cart shows 1 item
    await expect(
      page.locator('button[aria-label="Abrir carrito"]')
    ).toContainText("1", { timeout: 5000 });

    // Reload the page (tests hydration from localStorage)
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Cart should still have 1 item after reload
    await expect(
      page.locator('button[aria-label="Abrir carrito"]')
    ).toContainText("1", { timeout: 10000 });

    // Open cart and verify product is still there
    await page.locator('button[aria-label="Abrir carrito"]').click();
    const sidebar = page.getByRole("dialog", { name: "Carrito de compras" });
    await expect(sidebar).toBeVisible();
    await expect(page.getByText("Tu carrito está vacío")).not.toBeVisible();
  });

  test("no se duplican productos con clics rápidos", async ({ page }) => {
    const addBtn = page.locator('button[aria-label^="Agregar"]').first();
    await addBtn.waitFor({ state: "visible", timeout: 15000 });

    // Rapid-fire clicks (the debounce guard should prevent oscillation)
    await addBtn.click();
    await addBtn.click({ delay: 50 });
    await addBtn.click({ delay: 50 });

    // Wait for state to settle
    await page.waitForTimeout(500);

    // Should show exactly 1 item (debounce ignores rapid clicks within 300ms)
    await expect(
      page.locator('button[aria-label="Abrir carrito"]')
    ).toContainText("1", { timeout: 5000 });
  });
});
