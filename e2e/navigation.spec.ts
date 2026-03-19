import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("home page carga sin errores", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Bodega|San Martín/i);
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
  });

  test("página /tienda carga el catálogo", async ({ page }) => {
    await page.goto("/tienda");
    await expect(page.locator("main#main-content")).toBeVisible();
    // breadcrumb confirms correct page
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" })
    ).toBeVisible();
    await expect(page.getByText(/Tienda/i)).toBeVisible();
  });

  test("página /buscar carga correctamente", async ({ page }) => {
    await page.goto("/buscar");
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.getByText(/Buscar/i).first()).toBeVisible();
  });

  test("header presente en /tienda con botón de carrito", async ({ page }) => {
    await page.goto("/tienda");
    const cartBtn = page.locator('button[aria-label="Abrir carrito"]');
    await expect(cartBtn).toBeVisible();
  });

  test("logo en header navega a inicio", async ({ page }) => {
    await page.goto("/tienda");
    await page.locator("header a").first().click();
    await expect(page).toHaveURL("/");
  });
});
