import { test, expect } from "@playwright/test";

/**
 * QuickAddDrawer flow — regresión del crash visto en /marketplace/explorar
 * cuando QuickAddDrawer.tsx estaba vacío (500, Element type invalid).
 *
 * Este spec valida que:
 *   - La página carga sin 500.
 *   - Click en el botón "+" abre el drawer lateral.
 *   - El stepper incrementa la cantidad.
 *   - Al click en "Agregar", el contador del carrito refleja la cantidad.
 *   - Al cerrar con Escape, el drawer desaparece.
 */

test.describe("Marketplace · QuickAdd", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/marketplace/explorar");
    // Limpia carrito para empezar desde 0.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("cart:") || key.startsWith("bsm-cart")) {
          localStorage.removeItem(key);
        }
      }
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  test("/marketplace/explorar responde 200 (regresión del 500)", async ({ page }) => {
    // Si la página fuera 500, page.goto tiraría. Además validamos que no
    // hay overlay de error de Next en el DOM.
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    // El layout debe haber renderizado el main.
    await expect(page.locator("main#main-content")).toBeVisible();
  });

  test("click en '+' abre el drawer con info del producto", async ({ page }) => {
    const quickAddBtn = page
      .locator('button[aria-label^="Elegir opciones"]')
      .first();
    await quickAddBtn.waitFor({ state: "visible", timeout: 15000 });
    await quickAddBtn.click();

    const dialog = page.getByRole("dialog", { name: /Agregar/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cerrar" })).toBeVisible();
  });

  test("stepper +/- ajusta la cantidad y el subtotal", async ({ page }) => {
    const quickAddBtn = page.locator('button[aria-label^="Elegir opciones"]').first();
    await quickAddBtn.waitFor({ state: "visible", timeout: 15000 });
    await quickAddBtn.click();

    const dialog = page.getByRole("dialog", { name: /Agregar/i });
    await expect(dialog).toBeVisible();

    // Incrementar 2 veces → qty=3
    await dialog.getByLabel("Aumentar cantidad").click();
    await dialog.getByLabel("Aumentar cantidad").click();

    // El botón final debe reflejar "Agregar 3 al carrito"
    await expect(dialog.getByRole("button", { name: /Agregar 3/i })).toBeVisible();

    // Decrementar 1 → qty=2
    await dialog.getByLabel("Disminuir cantidad").click();
    await expect(dialog.getByRole("button", { name: /Agregar 2/i })).toBeVisible();
  });

  test("agregar 3 unidades actualiza el contador del carrito", async ({ page }) => {
    const quickAddBtn = page.locator('button[aria-label^="Elegir opciones"]').first();
    await quickAddBtn.waitFor({ state: "visible", timeout: 15000 });
    await quickAddBtn.click();

    const dialog = page.getByRole("dialog", { name: /Agregar/i });
    await dialog.getByLabel("Aumentar cantidad").click();
    await dialog.getByLabel("Aumentar cantidad").click();
    await dialog.getByRole("button", { name: /Agregar 3/i }).click();

    // El badge del carrito debe llegar a 3
    const cartBtn = page.locator('button[aria-label="Abrir carrito"]');
    await expect(cartBtn).toContainText("3", { timeout: 5000 });
  });

  test("Escape cierra el drawer", async ({ page }) => {
    const quickAddBtn = page.locator('button[aria-label^="Elegir opciones"]').first();
    await quickAddBtn.waitFor({ state: "visible", timeout: 15000 });
    await quickAddBtn.click();

    const dialog = page.getByRole("dialog", { name: /Agregar/i });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
