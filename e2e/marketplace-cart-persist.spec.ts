import { test, expect } from "@playwright/test";

/**
 * Cart persistence en /marketplace — regresión del bug 2026-04-19:
 * al agregar un producto de una tienda del marketplace y abrir el sidebar,
 * el carrito aparecía vacío.
 *
 * Causa: el hook de hydration validaba items contra /api/products?active=true
 * que solo devuelve productos del tenant "main". Items de otros stores → filter
 * devolvía [] → carrito borrado.
 *
 * Fix: migrado a /api/marketplace/products/check-exists + guard defensivo
 * (nunca borrar si TODOS los items desaparecerían).
 */

test.describe("Marketplace · Cart persistence multi-store", () => {
  test("item agregado del marketplace persiste al abrir sidebar", async ({ page }) => {
    await page.goto("/marketplace/explorar");
    // Reset carrito para entrar a un estado conocido.
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (k.includes("cart")) localStorage.removeItem(k);
      }
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Clickear el "+" de la primera card (QuickAdd) → drawer.
    const quickAdd = page.locator('button[aria-label^="Elegir opciones"]').first();
    await quickAdd.waitFor({ state: "visible", timeout: 15000 });
    await quickAdd.click();

    const dialog = page.getByRole("dialog", { name: /Agregar/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Agregar al carrito/i }).click();

    // Badge del carrito debe mostrar 1.
    const cartBtn = page.locator('button[aria-label="Abrir carrito"]');
    await expect(cartBtn).toContainText("1", { timeout: 5000 });

    // Abrir sidebar y verificar que el item NO desapareció.
    await cartBtn.click();
    // Hay que dar tiempo a la validación remota (check-exists) a completarse.
    // Si el guard funciona, el item sigue; si no, el carrito se vacía.
    await page.waitForTimeout(800);
    await expect(cartBtn).toContainText("1");
  });

  test("recargar la página NO borra el carrito", async ({ page }) => {
    await page.goto("/marketplace/explorar");
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (k.includes("cart")) localStorage.removeItem(k);
      }
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    const quickAdd = page.locator('button[aria-label^="Elegir opciones"]').first();
    await quickAdd.waitFor({ state: "visible", timeout: 15000 });
    await quickAdd.click();
    const dialog = page.getByRole("dialog", { name: /Agregar/i });
    await dialog.getByRole("button", { name: /Agregar al carrito/i }).click();

    const cartBtn = page.locator('button[aria-label="Abrir carrito"]');
    await expect(cartBtn).toContainText("1", { timeout: 5000 });

    // Recarga — hidratación ocurre; el guard debe preservar el item.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200); // check-exists response

    await expect(cartBtn).toContainText("1");
  });
});
